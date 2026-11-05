/**
 * Search index builder. Rebuilds the per-grant index in ARTIFACTS_BUCKET/_search/ from the metadata
 * table and each grant's summary.json, re-embedding only what changed and writing a Haiku use-case
 * profile only when a grant's summary content changes. A build is written under its own prefix and
 * goes live when _search/current.json is swapped to it with a conditional write.
 *
 * Triggered by summary.json changes (via SQS), nightly with { full: true }, and once on deploy.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  BUILDS_PREFIX,
  EMBEDDING_DIM,
  INDEX_FORMAT,
  POINTER_KEY,
  decodeIndex,
  docVectors,
  encodeIndex,
  quantize,
} from "./search-core.mjs";
import {
  DEFAULT_TEXT_OPTIONS,
  PROFILE_SYSTEM,
  grantTexts,
  profilePrompt,
  sha256,
  summaryHash,
} from "./grant-text.mjs";

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});
const sqs = new SQSClient({});

const KEEP_BUILDS = 3;
const EMBED_CONCURRENCY = 8;
const PROFILE_CONCURRENCY = 6;
const RAW_TEXT_BYTES = 24_000;
// About 1,400 characters of profile is kept; 400 tokens cut off about one profile in seven before that.
const PROFILE_MAX_TOKENS = 800;
const PROFILE_MAX_CHARS = 1_400;
const RESERVED_MS = 180_000;
const MAX_RETRIES = 4;

const env = () => ({
  bucket: process.env.ARTIFACTS_BUCKET,
  legacyBucket: process.env.BUCKET,
  table: process.env.NOFO_METADATA_TABLE_NAME,
  titan: process.env.TITAN_MODEL_ID,
  haiku: process.env.HAIKU_MODEL_ID,
  queueUrl: process.env.QUEUE_URL,
  profiles: String(process.env.SEARCH_PROFILES ?? "on").toLowerCase() !== "off",
});

export function textOptionsFromEnv() {
  const views = (process.env.SEARCH_VIEWS || "").split(",").map((v) => v.trim()).filter(Boolean);
  return {
    ...DEFAULT_TEXT_OPTIONS,
    ...(views.length && { views }),
    ...(process.env.SEARCH_RAW_TEXT_CHARS && { rawTextChars: Number(process.env.SEARCH_RAW_TEXT_CHARS) || 0 }),
    ...(process.env.SEARCH_PROFILE_IN_EMBEDDING && { profileInEmbedding: process.env.SEARCH_PROFILE_IN_EMBEDDING !== "off" }),
    ...(process.env.SEARCH_PROFILE_IN_BM25 && { profileInBm25: process.env.SEARCH_PROFILE_IN_BM25 !== "off" }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isThrottle = (e) =>
  ["ThrottlingException", "TooManyRequestsException", "ServiceUnavailableException", "ModelTimeoutException"].includes(e?.name) ||
  e?.$metadata?.httpStatusCode === 429;
const isMissing = (e) => e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
const isNotModified = (e) => e?.name === "NotModified" || e?.$metadata?.httpStatusCode === 304;
const isPreconditionFailed = (e) =>
  e?.name === "PreconditionFailed" || e?.name === "ConditionalRequestConflict" || [409, 412].includes(e?.$metadata?.httpStatusCode);

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isThrottle(error) || attempt >= MAX_RETRIES) throw error;
      await sleep(Math.min(1000 * 2 ** attempt + Math.random() * 500, 20_000));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const bodyBytes = async (res) => Buffer.from(await res.Body.transformToByteArray());

export async function readPointer(bucket = env().bucket) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: POINTER_KEY }));
    return { pointer: JSON.parse((await bodyBytes(res)).toString("utf8")), etag: res.ETag };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function loadBuild(bucket, pointer) {
  try {
    const [indexRes, stateRes] = await Promise.all([
      s3.send(new GetObjectCommand({ Bucket: bucket, Key: pointer.indexKey })),
      s3.send(new GetObjectCommand({ Bucket: bucket, Key: pointer.stateKey })),
    ]);
    const index = decodeIndex(await bodyBytes(indexRes));
    const state = JSON.parse(gunzipSync(await bodyBytes(stateRes)).toString("utf8"));
    return { index, state };
  } catch (error) {
    console.warn("Previous search index unreadable, rebuilding from scratch:", error.message);
    return null;
  }
}

async function scanMetadata(table) {
  const rows = new Map();
  let lastKey;
  do {
    const res = await dynamo.send(
      new ScanCommand({
        TableName: table,
        ProjectionExpression: "nofo_name, #s, expiration_date, is_rolling, #scope, #state, agency, category, grant_type",
        ExpressionAttributeNames: { "#s": "status", "#scope": "scope", "#state": "state" },
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of res.Items || []) {
      const row = unmarshall(item);
      if (typeof row.nofo_name === "string" && row.nofo_name) rows.set(row.nofo_name, row);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

async function listSummaries(bucket) {
  const etags = new Map();
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const object of res.Contents || []) {
      if (!object.Key.endsWith("/summary.json")) continue;
      etags.set(object.Key.slice(0, -"/summary.json".length), object.ETag);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return etags;
}

function parseJson(buffer) {
  try {
    const value = JSON.parse(buffer.toString("utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

async function readSummary(cfg, name, etag, prevDoc) {
  if (etag) {
    const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: `${name}/summary.json` }));
    return { summary: parseJson(await bodyBytes(res)), etag: res.ETag ?? etag, source: "artifacts" };
  }
  if (!cfg.legacyBucket) return { summary: null, etag: null, source: "none" };
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: cfg.legacyBucket,
        Key: `${name}/summary.json`,
        ...(prevDoc?.summarySource === "legacy" && prevDoc.summaryEtag && { IfNoneMatch: prevDoc.summaryEtag }),
      })
    );
    return { summary: parseJson(await bodyBytes(res)), etag: res.ETag, source: "legacy" };
  } catch (error) {
    if (isNotModified(error)) return { notModified: true, etag: prevDoc.summaryEtag, source: "legacy" };
    if (isMissing(error)) return { summary: null, etag: null, source: "none" };
    throw error;
  }
}

async function readRawText(cfg, name) {
  for (const bucket of [cfg.bucket, cfg.legacyBucket].filter(Boolean)) {
    try {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: `${name}/raw-text.txt`, Range: `bytes=0-${RAW_TEXT_BYTES - 1}` })
      );
      return (await bodyBytes(res)).toString("utf8");
    } catch (error) {
      if (!isMissing(error) && error?.$metadata?.httpStatusCode !== 416) throw error;
    }
  }
  return "";
}

export async function embed(modelId, text) {
  const res = await withRetry(() =>
    bedrock.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: text, dimensions: EMBEDDING_DIM, normalize: true }),
      })
    )
  );
  return JSON.parse(new TextDecoder().decode(res.body)).embedding;
}

export async function writeProfile(modelId, name, meta, summary, rawText) {
  const res = await withRetry(() =>
    bedrock.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: PROFILE_MAX_TOKENS,
          // Haiku 5.5 thinks by default, which used up max_tokens before any profile text.
          thinking: { type: "disabled" },
          system: PROFILE_SYSTEM,
          messages: [{ role: "user", content: profilePrompt(name, meta, summary, rawText) }],
        }),
      })
    )
  );
  const parsed = JSON.parse(new TextDecoder().decode(res.body));
  if (parsed.stop_reason === "refusal") throw new Error(`profile refused for ${name}`);
  if (parsed.stop_reason === "max_tokens") throw new Error(`profile cut off for ${name}`);
  const text = (parsed.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) throw new Error(`empty profile for ${name}`);
  return text.slice(0, PROFILE_MAX_CHARS);
}

const metaFields = (meta) => ({
  status: meta.status ?? null,
  expirationDate: meta.expiration_date ?? null,
  isRolling: meta.is_rolling === true || meta.is_rolling === "true",
  scope: meta.scope ?? null,
  state: meta.state ?? null,
  agency: meta.agency ?? null,
  category: meta.category ?? null,
  grantType: meta.grant_type ?? null,
});

const viewHash = (cfg, text) => sha256({ model: cfg.titan ? "titan-v2" : null, dims: EMBEDDING_DIM, text });

/**
 * One incremental build. Returns stats; writes nothing when no grant changed.
 * full: re-read every summary (the nightly run); embeddings and profiles are still reused by hash.
 */
export async function buildIndex({ full = false, deadline = Infinity, options = textOptionsFromEnv(), profiles, profilesOnFirstBuild = false } = {}) {
  const cfg = env();
  const profilesOn = profiles ?? cfg.profiles;
  if (!cfg.bucket || !cfg.table || !cfg.titan) throw new Error("ARTIFACTS_BUCKET, NOFO_METADATA_TABLE_NAME and TITAN_MODEL_ID are required");

  const current = await readPointer(cfg.bucket);
  const prev = current ? await loadBuild(cfg.bucket, current.pointer) : null;
  const sameOptions = Boolean(prev) && JSON.stringify(prev.state.options) === JSON.stringify(options);
  const [metas, summaryEtags] = await Promise.all([scanMetadata(cfg.table), listSummaries(cfg.bucket)]);

  const names = [...metas.keys()].sort();
  const stats = { grants: names.length, reused: 0, summariesRead: 0, profilesWritten: 0, profileErrors: 0, profilesPending: 0, embedded: 0, removed: 0 };

  const entries = await mapLimit(names, 16, async (name) => {
    const meta = metas.get(name);
    const prevDoc = prev?.state.docs[name];
    const prevIdx = prev?.index.byName.get(name);
    const metaHash = sha256(metaFields(meta));
    const etag = summaryEtags.get(name) ?? null;
    const canReuse = sameOptions && prevDoc && prevIdx !== undefined && !(profilesOn && prevDoc.hasSummary && !prevDoc.profile);
    const sameSummary = etag
      ? prevDoc?.summarySource === "artifacts" && prevDoc.summaryEtag === etag
      : prevDoc?.summarySource === "none";
    if (!full && canReuse && sameSummary && prevDoc.metaHash === metaHash) {
      stats.reused++;
      return { name, meta, reused: prevDoc, vectors: docVectors(prev.index, prevIdx) };
    }
    const read = await readSummary(cfg, name, etag, prevDoc);
    if (read.notModified && canReuse && prevDoc.metaHash === metaHash) {
      stats.reused++;
      return { name, meta, reused: prevDoc, vectors: docVectors(prev.index, prevIdx) };
    }
    stats.summariesRead++;
    let summary = read.summary;
    if (read.notModified) summary = prevDoc.summary ?? null;
    const rawText = summary ? await readRawText(cfg, name) : "";
    const sHash = summary ? summaryHash(summary, rawText) : null;
    const profile = prevDoc && prevDoc.summaryHash === sHash ? prevDoc.profile ?? "" : "";
    return {
      name, meta, metaHash, summary, rawText, sHash, profile,
      summaryEtag: read.etag, summarySource: read.source, prevDoc, prevIdx,
    };
  });

  const needProfile = profilesOn && cfg.haiku ? entries.filter((e) => !e.reused && e.summary && !e.profile) : [];
  // The first build goes live without profiles, so search works minutes after a deploy; the
  // continuation runs add them.
  const profileBudget = prev || profilesOnFirstBuild ? needProfile : [];
  let started = 0;
  await mapLimit(profileBudget, PROFILE_CONCURRENCY, async (entry) => {
    if (Date.now() > deadline - RESERVED_MS) return;
    started++;
    try {
      entry.profile = await writeProfile(cfg.haiku, entry.name, entry.meta, entry.summary, entry.rawText);
      stats.profilesWritten++;
    } catch (error) {
      stats.profileErrors++;
      console.warn(`Profile failed for ${entry.name}:`, error.message);
    }
  });
  stats.profilesPending = needProfile.filter((e) => !e.profile).length;

  const toEmbed = [];
  for (const entry of entries) {
    if (entry.reused) continue;
    const { facts, fields, views } = grantTexts(entry.name, entry.meta, entry.summary, {
      profile: entry.profile, rawText: entry.rawText, options,
    });
    entry.facts = facts;
    entry.fields = fields;
    entry.viewHashes = views.map((v) => viewHash(cfg, v.text));
    const prevVectors = entry.prevIdx !== undefined ? docVectors(prev.index, entry.prevIdx) : [];
    const prevHashes = entry.prevDoc?.viewHashes ?? [];
    entry.vectors = views.map((v, i) => {
      const j = prevHashes.indexOf(entry.viewHashes[i]);
      if (j >= 0 && prevVectors[j]) return prevVectors[j];
      toEmbed.push({ entry, i, text: v.text });
      return null;
    });
  }
  await mapLimit(toEmbed, EMBED_CONCURRENCY, async ({ entry, i, text }) => {
    entry.vectors[i] = quantize(await embed(cfg.titan, text));
    stats.embedded++;
  });

  const docs = entries.map((entry) => {
    const m = metaFields(entry.meta);
    const cache = entry.reused ?? {
      summaryEtag: entry.summaryEtag,
      summarySource: entry.summarySource,
      metaHash: entry.metaHash,
      summaryHash: entry.sHash,
      hasSummary: Boolean(entry.summary),
      profile: entry.profile || "",
      fields: entry.fields,
      viewHashes: entry.viewHashes,
      ...(entry.summarySource === "legacy" && { summary: entry.summary }),
    };
    cache.hash = sha256({ fields: cache.fields, viewHashes: cache.viewHashes, meta: m });
    return { name: entry.name, ...m, hash: cache.hash, fields: cache.fields, vectors: entry.vectors, cache };
  });

  const prevNames = prev ? prev.index.docs.map((d) => d.name) : [];
  stats.removed = prevNames.filter((n) => !metas.has(n)).length;
  const unchanged =
    prev && sameOptions && prevNames.length === docs.length && docs.every((d, i) => prev.index.docs[i].name === d.name && prev.index.docs[i].hash === d.hash);
  if (unchanged && stats.profilesWritten === 0) {
    return { ...stats, changed: false, buildId: current.pointer.buildId };
  }

  const builtAt = new Date().toISOString();
  const buildId = `${builtAt.replace(/[-:.]/g, "")}-${randomBytes(3).toString("hex")}`;
  const indexBytes = encodeIndex({ buildId, builtAt, dims: EMBEDDING_DIM, views: options.views, docs });
  const stateBytes = gzipSync(
    JSON.stringify({ format: INDEX_FORMAT, buildId, options, docs: Object.fromEntries(docs.map((d) => [d.name, d.cache])) })
  );
  const indexKey = `${BUILDS_PREFIX}${buildId}/index.bin`;
  const stateKey = `${BUILDS_PREFIX}${buildId}/state.json.gz`;
  await Promise.all([
    s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: indexKey, Body: indexBytes, ContentType: "application/octet-stream" })),
    s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: stateKey, Body: stateBytes, ContentType: "application/gzip" })),
  ]);
  const pointer = { format: INDEX_FORMAT, buildId, builtAt, indexKey, stateKey, docs: docs.length, bytes: indexBytes.length };
  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: POINTER_KEY,
      Body: JSON.stringify(pointer),
      ContentType: "application/json",
      ...(current ? { IfMatch: current.etag } : { IfNoneMatch: "*" }),
    })
  );
  await pruneBuilds(cfg.bucket, buildId).catch((error) => console.warn("Pruning old search builds failed:", error.message));
  return { ...stats, changed: true, buildId, bytes: indexBytes.length, stateBytes: stateBytes.length, profilesStarted: started };
}

async function pruneBuilds(bucket, keepId) {
  const prefixes = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: BUILDS_PREFIX, Delimiter: "/", ContinuationToken: token }));
    for (const p of res.CommonPrefixes || []) prefixes.push(p.Prefix);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  const stale = prefixes.sort().reverse().filter((p) => !p.includes(keepId)).slice(KEEP_BUILDS - 1);
  for (const prefix of stale) {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const objects = (listed.Contents || []).map((o) => ({ Key: o.Key }));
    if (objects.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
  }
}

export const handler = async (event, context) => {
  const full = event?.full === true || event?.source === "aws.events";
  const deadline = Date.now() + (context?.getRemainingTimeInMillis?.() ?? 900_000);
  const triggers = (event?.Records ?? []).length;
  try {
    let result;
    try {
      result = await buildIndex({ full, deadline });
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
      console.warn("Search index pointer moved during the build; rebuilding on the new one");
      result = await buildIndex({ full, deadline });
    }
    console.log(JSON.stringify({ event: "search_index_build", full, triggers, ...result }));
    const { queueUrl } = env();
    if (result.profilesPending > 0 && (result.profilesWritten > 0 || result.changed) && queueUrl) {
      await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ continue: true }) }));
    }
    return result;
  } catch (error) {
    console.error("Search index build failed:", error);
    throw error;
  }
};

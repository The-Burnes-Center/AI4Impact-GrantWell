// usage: node eval/search-recall.mjs --profile <aws profile> --region us-east-1 --stack <stack name>
//          [--sample 300] [--need-per-grant 1] [--variants profile,no-profile,one-vector,raw-2000]
//          [--rerank] [--sweep] [--no-legacy] [--concurrency 4] [--out <dir>]
//          [--artifacts-bucket b] [--nofo-bucket b] [--table t] [--aoss-endpoint host] [--aoss-index i]
//          [--titan-model id] [--haiku-model id]
// Read-only. Builds the per-grant index locally from the deployment's summaries with real Titan and
// Haiku calls, then runs the same queries through today's OpenSearch search and the new search.
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { register } from "node:module";
import { parseArgs } from "node:util";

register("./lib/hooks.mjs", import.meta.url);

const { values: args } = parseArgs({
  options: {
    profile: { type: "string" },
    region: { type: "string", default: "us-east-1" },
    stack: { type: "string" },
    "artifacts-bucket": { type: "string" },
    "nofo-bucket": { type: "string" },
    table: { type: "string" },
    "aoss-endpoint": { type: "string" },
    "aoss-index": { type: "string" },
    "titan-model": { type: "string" },
    "haiku-model": { type: "string" },
    sample: { type: "string", default: "300" },
    "titles-per-grant": { type: "string", default: "2" },
    "need-per-grant": { type: "string", default: "1" },
    "state-queries": { type: "string", default: "40" },
    variants: { type: "string", default: "profile,no-profile,one-vector,raw-2000" },
    rerank: { type: "boolean", default: false },
    sweep: { type: "boolean", default: false },
    "no-legacy": { type: "boolean", default: false },
    concurrency: { type: "string", default: "4" },
    seed: { type: "string", default: "1" },
    out: { type: "string" },
  },
});
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};
if (!args.stack && !(args["artifacts-bucket"] && args.table)) fail("--stack (or --artifacts-bucket and --table) is required");
if (args.profile) {
  process.env.AWS_PROFILE = args.profile;
  for (const k of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) delete process.env[k];
}
process.env.AWS_REGION = args.region;

const { install, inScope, sha, s3Body } = await import("./lib/aws.mjs");
const { deployedModels } = await import("./lib/env.mjs");
const { pool } = await import("./lib/pool.mjs");
const { ListFunctionsCommand, LambdaClient } = await import("@aws-sdk/client-lambda");
const { GetObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
const { ScanCommand, DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
const { InvokeModelCommand, BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");
const { RerankCommand, BedrockAgentRuntimeClient } = await import("@aws-sdk/client-bedrock-agent-runtime");
const { SQSClient } = await import("@aws-sdk/client-sqs");
const { unmarshall, marshall } = await import("@aws-sdk/util-dynamodb");
const core = await import("../lib/chatbot-api/functions/landing-page/ai-grant-search/search-core.mjs");
const text = await import("../lib/chatbot-api/functions/landing-page/ai-grant-search/grant-text.mjs");
const lib = await import("./search/recall-lib.mjs");

const EVAL_DIR = path.dirname(new URL(import.meta.url).pathname);
const startedAt = new Date().toISOString();
const outDir = args.out ?? path.join(EVAL_DIR, "out", `search-recall-${startedAt.replace(/[:.]/g, "-")}`);
const cacheDir = path.join(EVAL_DIR, "out", "search-cache", args.stack ?? args["artifacts-bucket"]);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const VARIANTS = {
  profile: { profiles: true, options: text.DEFAULT_TEXT_OPTIONS },
  "no-profile": { profiles: false, options: { ...text.DEFAULT_TEXT_OPTIONS, profileInEmbedding: false, profileInBm25: false } },
  "profile-bm25-only": { profiles: true, options: { ...text.DEFAULT_TEXT_OPTIONS, profileInEmbedding: false } },
  "one-vector": { profiles: true, options: { ...text.DEFAULT_TEXT_OPTIONS, views: ["all"] } },
  "profile-view": { profiles: true, options: { ...text.DEFAULT_TEXT_OPTIONS, views: ["card", "detail", "profile"] } },
  "raw-2000": { profiles: true, options: { ...text.DEFAULT_TEXT_OPTIONS, rawTextChars: 2000 } },
};
const variantNames = args.variants.split(",").map((v) => v.trim()).filter(Boolean);
for (const v of variantNames) if (!VARIANTS[v]) fail(`unknown variant ${v}; one of ${Object.keys(VARIANTS).join(", ")}`);

// The handlers log every search; keep the run's own progress readable.
const say = console.log.bind(console);
console.log = console.warn = console.info = () => {};
console.error = () => {};

// ── read-only routing ──

const notFound = () => Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
const notModified = () => Object.assign(new Error("NotModified"), { name: "NotModified", $metadata: { httpStatusCode: 304 } });

/** Stands in for ARTIFACTS_BUCKET/_search/: the builder writes here, the new search reads here. */
class MemoryPrefix {
  objects = new Map();
  n = 0;
  get({ Key, IfNoneMatch }) {
    const o = this.objects.get(Key);
    if (!o) throw notFound();
    if (IfNoneMatch && IfNoneMatch === o.etag) throw notModified();
    return { Body: { transformToByteArray: async () => new Uint8Array(o.body), transformToString: async () => o.body.toString("utf8") }, ETag: o.etag };
  }
  put({ Key, Body, IfMatch, IfNoneMatch }) {
    const existing = this.objects.get(Key);
    if ((IfNoneMatch === "*" && existing) || (IfMatch && existing?.etag !== IfMatch)) {
      throw Object.assign(new Error("PreconditionFailed"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
    }
    const etag = `"mem-${++this.n}"`;
    this.objects.set(Key, { body: Buffer.from(Body), etag });
    return { ETag: etag };
  }
  list({ Prefix = "", Delimiter }) {
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(Prefix)).sort();
    if (!Delimiter) return { Contents: keys.map((Key) => ({ Key, ETag: this.objects.get(Key).etag })), IsTruncated: false };
    const prefixes = new Set(keys.map((k) => k.slice(Prefix.length)).filter((r) => r.includes(Delimiter)).map((r) => Prefix + r.slice(0, r.indexOf(Delimiter) + 1)));
    return { CommonPrefixes: [...prefixes].map((p) => ({ Prefix: p })), IsTruncated: false };
  }
  remove({ Delete }) {
    for (const { Key } of Delete.Objects) this.objects.delete(Key);
    return {};
  }
}
let memory = new MemoryPrefix();

const cacheFile = path.join(cacheDir, "bedrock.jsonl");
const bedrockCache = new Map();
if (fs.existsSync(cacheFile)) {
  for (const line of fs.readFileSync(cacheFile, "utf8").split("\n")) {
    if (!line) continue;
    const { key, body } = JSON.parse(line);
    bedrockCache.set(key, body);
  }
}
const usage = { titan: 0, haiku: 0, cached: 0, rerank: 0 };

let cfg;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function liveWithRetry(send) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      const throttled = ["ThrottlingException", "TooManyRequestsException", "ServiceUnavailableException"].includes(error?.name);
      if (!throttled || attempt >= 5) throw error;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

const routes = {
  lambda: (command, send) => {
    if (command.constructor.name !== "ListFunctionsCommand") throw new Error(`eval: unexpected Lambda ${command.constructor.name}`);
    return send();
  },
  dynamodb: (command, send) => {
    const name = command.constructor.name;
    const { TableName } = command.input;
    if (name === "GetItemCommand" && TableName === cfg.rolloutTable) {
      return { Item: marshall({ featureKey: "ai-grant-search", subjectKey: "CONFIG", mode: "all" }) };
    }
    if ((name === "ScanCommand" || name === "QueryCommand") && TableName === cfg.table) return send();
    throw new Error(`eval: unexpected DynamoDB ${name} on ${TableName}`);
  },
  s3: (command, send) => {
    const name = command.constructor.name;
    const input = command.input;
    const own = String(input.Key ?? input.Prefix ?? "").startsWith(core.SEARCH_PREFIX) || (name === "DeleteObjectsCommand");
    if (own && input.Bucket === cfg.artifactsBucket) {
      if (name === "GetObjectCommand") return memory.get(input);
      if (name === "PutObjectCommand") return memory.put(input);
      if (name === "ListObjectsV2Command") return memory.list(input);
      if (name === "DeleteObjectsCommand") return memory.remove(input);
    }
    const readable = [cfg.artifactsBucket, cfg.nofoBucket].includes(input.Bucket);
    if (readable && (name === "GetObjectCommand" || name === "ListObjectsV2Command")) return send();
    throw new Error(`eval: unexpected S3 ${name} on ${input.Bucket}/${input.Key ?? input.Prefix ?? ""}`);
  },
  bedrock: async (command, send) => {
    if (command.constructor.name !== "InvokeModelCommand") throw new Error(`eval: unexpected Bedrock ${command.constructor.name}`);
    const { modelId, body } = command.input;
    const kind = modelId === cfg.titan ? "titan" : modelId === cfg.haiku ? "haiku" : null;
    if (!kind) throw new Error(`eval: unexpected model ${modelId}`);
    const key = sha({ kind, body: String(body) });
    if (bedrockCache.has(key)) {
      usage.cached++;
      return { body: new TextEncoder().encode(bedrockCache.get(key)) };
    }
    const res = await liveWithRetry(send);
    const decoded = new TextDecoder().decode(res.body);
    usage[kind]++;
    bedrockCache.set(key, decoded);
    fs.appendFileSync(cacheFile, `${JSON.stringify({ key, body: decoded })}\n`);
    return { body: new TextEncoder().encode(decoded) };
  },
  kb: (command, send) => {
    if (command.constructor.name !== "RerankCommand") throw new Error(`eval: unexpected ${command.constructor.name}`);
    usage.rerank++;
    return liveWithRetry(send);
  },
};

SQSClient.prototype.send = async () => {
  throw new Error("eval: SQS is not routed");
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const u = new URL(url);
  const search = u.hostname === cfg.aossEndpoint && init?.method === "POST" && u.pathname === `/${cfg.aossIndex}/_search`;
  const rerank = /^bedrock-agent-runtime\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname) && u.pathname === "/rerank";
  if (!search && !rerank) throw new Error(`eval: unexpected fetch ${init?.method ?? "GET"} ${url}`);
  return realFetch(url, init);
};

install();

// ── setup ──

async function resolveConfig() {
  const lambda = new LambdaClient({});
  const fns = [];
  if (args.stack) {
    let Marker;
    do {
      const res = await lambda.send(new ListFunctionsCommand({ Marker }));
      fns.push(...(res.Functions ?? []).filter((f) => f.FunctionName.startsWith(`${args.stack}-`)));
      Marker = res.NextMarker;
    } while (Marker);
  }
  const envOf = (part) => fns.find((f) => f.FunctionName.includes(part))?.Environment?.Variables ?? {};
  const search = envOf("AIGrantSearch");
  const builder = envOf("SearchIndexBuil");
  const req = envOf("GetRequirements");
  const resolved = {
    artifactsBucket: args["artifacts-bucket"] ?? builder.ARTIFACTS_BUCKET ?? search.SEARCH_INDEX_BUCKET ?? req.ARTIFACTS_BUCKET,
    nofoBucket: args["nofo-bucket"] ?? builder.BUCKET ?? req.BUCKET,
    table: args.table ?? search.NOFO_METADATA_TABLE_NAME,
    rolloutTable: search.FEATURE_ROLLOUT_TABLE_NAME ?? "eval-rollouts",
    titan: args["titan-model"] ?? search.TITAN_MODEL_ID ?? "amazon.titan-embed-text-v2:0",
    haiku: args["haiku-model"] ?? builder.HAIKU_MODEL_ID ?? deployedModels().haiku,
    aossEndpoint: args["aoss-endpoint"] ?? search.OPENSEARCH_ENDPOINT,
    aossIndex: args["aoss-index"] ?? search.OPENSEARCH_INDEX,
    supportedStates: search.SUPPORTED_STATES ?? "[]",
  };
  if (!resolved.artifactsBucket || !resolved.table) fail(`could not find the artifacts bucket and metadata table for ${args.stack}; pass --artifacts-bucket and --table`);
  return resolved;
}

function setHandlerEnv() {
  Object.assign(process.env, {
    ARTIFACTS_BUCKET: cfg.artifactsBucket,
    SEARCH_INDEX_BUCKET: cfg.artifactsBucket,
    BUCKET: cfg.nofoBucket ?? "",
    NOFO_METADATA_TABLE_NAME: cfg.table,
    FEATURE_ROLLOUT_TABLE_NAME: cfg.rolloutTable,
    TITAN_MODEL_ID: cfg.titan,
    HAIKU_MODEL_ID: cfg.haiku,
    SUPPORTED_STATES: cfg.supportedStates,
    OPENSEARCH_ENDPOINT: cfg.aossEndpoint ?? "",
    OPENSEARCH_INDEX: cfg.aossIndex ?? "",
  });
  delete process.env.QUEUE_URL;
  delete process.env.ANALYTICS_TABLE_NAME;
}

async function scanMetadata() {
  const ddb = new DynamoDBClient({});
  const metas = new Map();
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: cfg.table, ExclusiveStartKey }));
    for (const item of res.Items ?? []) {
      const row = unmarshall(item);
      if (row.nofo_name) metas.set(row.nofo_name, row);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return metas;
}

async function readSummary(name) {
  const s3 = new S3Client({});
  for (const Bucket of [cfg.artifactsBucket, cfg.nofoBucket].filter(Boolean)) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket, Key: `${name}/summary.json` }));
      return JSON.parse(await res.Body.transformToString());
    } catch (error) {
      if (error?.name !== "NoSuchKey" && error?.$metadata?.httpStatusCode !== 404) throw error;
    }
  }
  return null;
}

async function needQueries(metas, sample, perGrant) {
  if (perGrant <= 0) return [];
  const bedrock = new BedrockRuntimeClient({});
  const queries = [];
  await pool(sample, Number(args.concurrency) * 2, async (name) => {
    const summary = await readSummary(name);
    if (!summary) return;
    const res = await bedrock.send(new InvokeModelCommand({
      modelId: cfg.haiku,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 300,
        system: lib.NEED_SYSTEM,
        messages: [{ role: "user", content: lib.needPrompt(name, metas.get(name), summary, perGrant) }],
      }),
    }));
    const parsed = JSON.parse(new TextDecoder().decode(res.body));
    const reply = (parsed.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    for (const query of lib.parseNeedQueries(reply, perGrant)) queries.push({ kind: "need", query, relevant: [name], source: name, generated: "haiku" });
  });
  return queries;
}

// ── running searches ──

const DEVELOPER = { email: "search-recall@eval.invalid", sub: "eval", "custom:role": '["Developer"]' };
function callerFor(q, supported) {
  if (!q.state) return DEVELOPER;
  if (supported.has(q.state)) return { email: DEVELOPER.email, sub: DEVELOPER.sub, "custom:state": q.state };
  return q.kind === "state" ? DEVELOPER : { email: DEVELOPER.email, sub: DEVELOPER.sub };
}

async function runQueries(label, handler, queries, metas, supported) {
  const rows = [];
  let n = 0;
  await pool(queries, Number(args.concurrency), async (q) => {
    const t0 = performance.now();
    let results = [];
    let error;
    try {
      const res = await handler({ requestContext: { authorizer: { jwt: { claims: callerFor(q, supported) } } }, body: JSON.stringify({ query: q.query }) });
      const body = JSON.parse(res.body);
      if (res.statusCode !== 200) error = `${res.statusCode} ${body.message ?? ""}`;
      results = (body.results ?? []).map((r) => r.name);
    } catch (e) {
      error = e.message;
    }
    const ms = performance.now() - t0;
    const row = { kind: q.kind, query: q.query, rank: lib.rankOf(results, q.relevant), ms, warm: n++ >= 3, results: results.slice(0, 30), ...(error && { error }) };
    if (q.category) row.junk5 = lib.junkAt5(results, metas, q.category);
    row.category = q.category ?? metas.get(q.source)?.category ?? "Unknown";
    rows.push(row);
  });
  say(`${label}: ${rows.length} queries, ${rows.filter((r) => r.error).length} errors`);
  return rows;
}

async function rerankRows(rows, queries, state) {
  const kb = new BedrockAgentRuntimeClient({});
  const byQuery = new Map(queries.map((q) => [q.query, q]));
  const out = [];
  await pool(rows, Number(args.concurrency), async (row) => {
    const q = byQuery.get(row.query);
    const top = row.results.slice(0, 30);
    if (top.length < 2) return out.push({ ...row });
    const docs = top.map((name) => {
      const f = state.docs[name]?.fields;
      return f ? `${f.name}\n${f.agency}\n${f.body}`.slice(0, 3000) : name;
    });
    const t0 = performance.now();
    try {
      const res = await kb.send(new RerankCommand({
        queries: [{ type: "TEXT", textQuery: { text: row.query } }],
        sources: docs.map((t) => ({ type: "INLINE", inlineDocumentSource: { type: "TEXT", textDocument: { text: t } } })),
        rerankingConfiguration: {
          type: "BEDROCK_RERANKING_MODEL",
          bedrockRerankingConfiguration: { numberOfResults: top.length, modelConfiguration: { modelArn: `arn:aws:bedrock:${args.region}::foundation-model/cohere.rerank-v3-5:0` } },
        },
      }));
      const results = res.results.map((r) => top[r.index]);
      out.push({ ...row, results, rank: lib.rankOf(results, q.relevant), ms: row.ms + (performance.now() - t0) });
    } catch (e) {
      out.push({ ...row, error: `rerank: ${e.message}` });
    }
  });
  return out;
}

async function buildVariant(name) {
  const { buildIndex } = await import(`../lib/chatbot-api/functions/landing-page/ai-grant-search/builder.mjs?variant=${name}`);
  memory = new MemoryPrefix();
  const t0 = Date.now();
  const stats = await buildIndex({ full: true, options: VARIANTS[name].options, profiles: VARIANTS[name].profiles, profilesOnFirstBuild: true });
  const pointer = JSON.parse(memory.objects.get(core.POINTER_KEY).body.toString());
  const indexBytes = memory.objects.get(pointer.indexKey).body;
  const state = JSON.parse(gunzipSync(memory.objects.get(pointer.stateKey).body).toString());
  const t1 = performance.now();
  const index = core.decodeIndex(indexBytes);
  const decodeMs = performance.now() - t1;
  say(`built ${name}: ${stats.grants} grants, ${(indexBytes.length / 1e6).toFixed(2)} MB, ${stats.embedded} embedded, ${stats.profilesWritten} profiles, ${Math.round((Date.now() - t0) / 1000)} s`);
  return { name, stats, memory, index, state, bytes: indexBytes.length, decodeMs, buildMs: Date.now() - t0 };
}

async function sweep(built, queries) {
  const bedrock = new BedrockRuntimeClient({});
  const pre = [];
  await pool(queries, Number(args.concurrency), async (q) => {
    const res = await bedrock.send(new InvokeModelCommand({
      modelId: cfg.titan, contentType: "application/json", accept: "application/json",
      body: JSON.stringify({ inputText: q.query, dimensions: core.EMBEDDING_DIM, normalize: true }),
    }));
    const embedding = JSON.parse(new TextDecoder().decode(res.body)).embedding;
    const { code, rest } = core.findQueryState(q.query);
    let terms = core.queryTerms(rest);
    if (!terms.length && code) terms = core.queryTerms(core.words(q.query));
    pre.push({ q, bm25: core.bm25Scores(built.index, terms), cos: core.cosineScores(built.index, embedding), wordCount: core.words(q.query).length });
  });
  const scored = lib.sweepGrid().map((params) => {
    const rows = pre.map((p) => ({ rank: lib.rankOf(lib.fuse(built.index, p, params), p.q.relevant) }));
    return { params, ...lib.summarize(rows) };
  });
  scored.sort((a, b) => b.mrr - a.mrr);
  const current = { short: core.SCORING.short, long: core.SCORING.long, floorRank: core.SEMANTIC_FLOOR_RANK };
  const now = lib.summarize(pre.map((p) => ({ rank: lib.rankOf(lib.fuse(built.index, p, current), p.q.relevant) })));
  return { current: { params: current, ...now }, best: scored.slice(0, 5) };
}

// ── report ──

const pct = (v) => (v === null || v === undefined ? "–" : `${v}`);
function table(title, systems, filter = () => true) {
  const lines = [`### ${title}`, "", "| system | queries | recall@30 | top-1 | top-3 | MRR | junk@5 | p50 ms | p90 ms | errors |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const [label, rows] of systems) {
    const subset = rows.filter(filter);
    const s = lib.summarize(subset);
    const warm = subset.filter((r) => r.warm && !r.error).map((r) => r.ms);
    lines.push(`| ${label} | ${s.n} | ${pct(s.recall30)} | ${pct(s.top1)} | ${pct(s.top3)} | ${pct(s.mrr)} | ${pct(s.junk5)} | ${pct(Math.round(lib.percentile(warm, 50) ?? 0))} | ${pct(Math.round(lib.percentile(warm, 90) ?? 0))} | ${s.errors ?? 0} |`);
  }
  return lines.join("\n");
}

async function main() {
  cfg = await resolveConfig();
  setHandlerEnv();
  say("config:", { ...cfg, supportedStates: undefined });
  const supported = new Set(JSON.parse(cfg.supportedStates).map((s) => s.code));

  const metas = await scanMetadata();
  const names = [...metas.keys()].sort();
  const sample = lib.seededShuffle(names, Number(args.seed)).slice(0, Number(args.sample));
  const queries = [
    ...lib.titleQueries(names, sample, Number(args["titles-per-grant"])),
    ...(await needQueries(metas, sample, Number(args["need-per-grant"]))),
    ...lib.stateQueries(metas, { limit: Number(args["state-queries"]), seed: Number(args.seed) }),
  ];
  fs.writeFileSync(path.join(outDir, "queries.json"), JSON.stringify(queries, null, 1));
  say(`${metas.size} grants, ${queries.length} queries (${sample.length} sampled grants)`);

  const systems = [];
  if (!args["no-legacy"]) {
    if (!cfg.aossEndpoint || !cfg.aossIndex) fail("today's search needs --aoss-endpoint and --aoss-index (the Lambda no longer has them after the switch)");
    const creds = await new S3Client({}).config.credentials();
    Object.assign(process.env, { AWS_ACCESS_KEY_ID: creds.accessKeyId, AWS_SECRET_ACCESS_KEY: creds.secretAccessKey, AWS_SESSION_TOKEN: creds.sessionToken ?? "" });
    const { handler } = await import("./search/legacy-ai-grant-search.mjs");
    systems.push(["today (OpenSearch + rerank)", await runQueries("today", handler, queries, metas, supported)]);
  }

  const builds = [];
  let sweepResult = null;
  for (const name of variantNames) {
    const built = await buildVariant(name);
    builds.push(built);
    memory = built.memory;
    const { handler } = await import(`../lib/chatbot-api/functions/landing-page/ai-grant-search/index.mjs?variant=${name}`);
    const rows = await runQueries(`new ${name}`, handler, queries, metas, supported);
    systems.push([`new: ${name}`, rows]);
    if (args.rerank && name === variantNames[0]) systems.push([`new: ${name} + rerank`, await rerankRows(rows, queries, built.state)]);
    if (args.sweep && name === variantNames[0]) sweepResult = await sweep(built, queries);
  }

  const kinds = [...new Set(queries.map((q) => q.kind))];
  const categories = Object.entries(
    queries.reduce((acc, q) => {
      const c = q.category ?? metas.get(q.source)?.category ?? "Unknown";
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).map(([c]) => c);

  const report = [
    `# Search recall: ${args.stack ?? cfg.artifactsBucket}`,
    "",
    `${startedAt}. ${metas.size} grants, ${sample.length} sampled, ${queries.length} queries: ${kinds.map((k) => `${queries.filter((q) => q.kind === k).length} ${k}`).join(", ")}. "need" queries are written by Haiku from each summary. Caller: Developer (sees every grant), except state queries, which run as a user in that state.`,
    "",
    "Latency is the handler's wall time from this machine, warm, including the live Titan query embedding; it is not Lambda time.",
    "",
    "## Index builds",
    "",
    "| variant | grants | MB | decode ms | vectors embedded | profiles | build s |",
    "|---|---|---|---|---|---|---|",
    ...builds.map((b) => `| ${b.name} | ${b.stats.grants} | ${(b.bytes / 1e6).toFixed(2)} | ${Math.round(b.decodeMs)} | ${b.stats.embedded} | ${b.stats.profilesWritten} | ${Math.round(b.buildMs / 1000)} |`),
    "",
    "## Results",
    "",
    table("All queries", systems),
    "",
    ...kinds.map((k) => `${table(`Kind: ${k}`, systems, (r) => r.kind === k)}\n`),
    "## By category",
    "",
    ...categories.slice(0, 20).map((c) => `${table(c, systems, (r) => r.category === c)}\n`),
    ...(sweepResult
      ? [
          `## Fusion sweep (${variantNames[0]}, hybrid layer only)`,
          "",
          `Current: ${JSON.stringify(sweepResult.current.params)} → recall@30 ${sweepResult.current.recall30}, top-1 ${sweepResult.current.top1}, MRR ${sweepResult.current.mrr}`,
          "",
          ...sweepResult.best.map((b) => `- ${JSON.stringify(b.params)} → recall@30 ${b.recall30}, top-1 ${b.top1}, top-3 ${b.top3}, MRR ${b.mrr}`),
          "",
        ]
      : []),
    `Model calls this run: ${usage.titan} Titan, ${usage.haiku} Haiku, ${usage.rerank} rerank (${usage.cached} served from ${path.relative(process.cwd(), cacheFile)}).`,
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "report.md"), `${report}\n`);
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ startedAt, config: cfg, usage, builds: builds.map(({ name, stats, bytes, decodeMs, buildMs }) => ({ name, stats, bytes, decodeMs, buildMs })), sweep: sweepResult, systems: Object.fromEntries(systems) }, null, 1));
  return report;
}

const result = await inScope(routes, main);
if (result.error) {
  process.stderr.write(`${result.error}\n`);
  process.exit(1);
}
say(`\n${result.output}\n\nWrote ${outDir}`);

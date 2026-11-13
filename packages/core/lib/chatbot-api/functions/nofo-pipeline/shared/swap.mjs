/**
 * Publishing a staged version (see PENDING_PREFIX in grantwell-shared) swaps its document and
 * derived files into the grant's published keys. Before anything is replaced, the version every
 * published key had is saved in `_pending/<grant>/swap.json`, so a failed publish, or a reject
 * after one, puts back exactly what was published. Both buckets are versioned.
 */

import { S3Client, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import {
  DOCUMENT_FILES,
  REQUIREMENT_CITATIONS_FILE,
  SOURCE_VERSION_METADATA,
  artifactsBucket,
  copySource,
  deletePending,
  isMissingObject,
  isPendingKey,
  listPending,
  pendingDir,
} from "grantwell-shared";
import { PAGE_MAP_FILE } from "../extract-text/page-map.mjs";

export const SWAP_JOURNAL = "swap.json";
/** Metadata row attribute: ETags of documents publish copied in, which the dispatcher must not process again. */
export const SWAP_ETAGS = "swap_document_etags";

const RAW_TEXT = "raw-text.txt";
const STAGED_FILES = [RAW_TEXT, PAGE_MAP_FILE, REQUIREMENT_CITATIONS_FILE];
const PUBLISHED_ARTIFACTS = [...STAGED_FILES, "summary.json", "questions.json"];

const s3 = new S3Client();
const dynamo = new DynamoDBClient();

export const normalizeEtag = (etag) => (typeof etag === "string" && etag ? etag.replace(/"/g, "") : null);

const journalKey = (nofoName) => `${pendingDir(nofoName)}${SWAP_JOURNAL}`;

const isMissing = (error) => isMissingObject(error) || error?.name === "NotFound";

async function head(bucket, key) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function publishedKeys(nofoName, grantBucket) {
  const documents = DOCUMENT_FILES.flatMap((file) => [`${nofoName}/${file}`, `${nofoName}/${file}.metadata.json`]);
  return [
    ...documents.map((key) => ({ bucket: grantBucket, key })),
    ...PUBLISHED_ARTIFACTS.map((file) => ({ bucket: artifactsBucket(), key: `${nofoName}/${file}` })),
  ];
}

async function readJournal(nofoName) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: artifactsBucket(), Key: journalKey(nofoName) }));
    return JSON.parse(await res.Body.transformToString());
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** An earlier journal is kept: after a swap that stopped partway, it still holds the last published versions. */
async function ensureJournal(nofoName, grantBucket) {
  const existing = await readJournal(nofoName);
  if (existing) return existing;
  const entries = [];
  for (const { bucket, key } of publishedKeys(nofoName, grantBucket)) {
    const current = await head(bucket, key);
    entries.push({ bucket, key, versionId: current ? current.VersionId ?? null : null, etag: normalizeEtag(current?.ETag), existed: Boolean(current) });
  }
  const journal = { nofoName, at: new Date().toISOString(), entries };
  await s3.send(
    new PutObjectCommand({ Bucket: artifactsBucket(), Key: journalKey(nofoName), Body: JSON.stringify(journal), ContentType: "application/json" })
  );
  return journal;
}

/** Done before each document copy: the copy's S3 event must not start another pipeline run. */
async function recordDocumentEtags(nofoName, etags) {
  const values = etags.filter(Boolean);
  if (!values.length || !process.env.NOFO_METADATA_TABLE_NAME) return;
  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.NOFO_METADATA_TABLE_NAME,
      Key: marshall({ nofo_name: nofoName }),
      UpdateExpression: `ADD ${SWAP_ETAGS} :etags`,
      ExpressionAttributeValues: { ":etags": { SS: [...new Set(values)] } },
    })
  );
}

const isDocument = (key) => DOCUMENT_FILES.some((file) => key.endsWith(`/${file}`));

export class StaleVersionError extends Error {
  constructor(nofoName) {
    super(`A newer document for "${nofoName}" was uploaded after this version was processed; its run replaces this one.`);
    this.name = "StaleVersionError";
  }
}

/**
 * True when a run of a staged document is no longer the newest: another upload replaced the
 * document (or Reject removed it) since. Unknown versions, and an S3 read error, are never stale:
 * holding a review that turns out stale is safe, since swapIn refuses it.
 */
export async function isStaleRun(documentKey, documentVersionId) {
  if (!documentVersionId || !isPendingKey(documentKey)) return false;
  try {
    const current = await head(artifactsBucket(), documentKey);
    return current?.VersionId !== documentVersionId;
  } catch (error) {
    console.warn(`Could not check whether ${documentKey} was replaced:`, error.message);
    return false;
  }
}

/**
 * Copies a staged version over the published one. Returns the published document key. Throws,
 * changing nothing, when the staged document is gone (rejected, renamed, or superseded and cleared),
 * or is not the version this run processed (StaleVersionError).
 */
export async function swapIn(nofoName, stagedDocumentKey, grantBucket, documentVersionId = null) {
  const dir = pendingDir(nofoName);
  const file = stagedDocumentKey.slice(dir.length);
  if (!stagedDocumentKey.startsWith(dir) || !DOCUMENT_FILES.includes(file)) {
    throw new Error(`"${stagedDocumentKey}" is not a staged document of "${nofoName}"`);
  }
  const staged = new Set(await listPending(s3, nofoName));
  if (!staged.has(stagedDocumentKey) || !staged.has(`${dir}${RAW_TEXT}`)) {
    throw new Error(`The new version of "${nofoName}" is no longer staged; reprocess the grant instead.`);
  }

  const artifacts = artifactsBucket();
  const source = await head(artifacts, stagedDocumentKey);
  if (documentVersionId) {
    if (source?.VersionId !== documentVersionId) throw new StaleVersionError(nofoName);
    for (const name of STAGED_FILES.filter((f) => staged.has(`${dir}${f}`))) {
      const derived = await head(artifacts, `${dir}${name}`);
      if (derived?.Metadata?.[SOURCE_VERSION_METADATA] !== documentVersionId) throw new StaleVersionError(nofoName);
    }
  }

  await ensureJournal(nofoName, grantBucket);
  const documentKey = `${nofoName}/${file}`;

  await recordDocumentEtags(nofoName, [normalizeEtag(source?.ETag)]);
  const copied = await s3.send(
    new CopyObjectCommand({
      Bucket: grantBucket,
      CopySource: copySource(artifacts, stagedDocumentKey) + (documentVersionId ? `?versionId=${encodeURIComponent(documentVersionId)}` : ""),
      Key: documentKey,
    })
  );
  const copiedEtag = normalizeEtag(copied?.CopyObjectResult?.ETag);
  if (copiedEtag && copiedEtag !== normalizeEtag(source?.ETag)) await recordDocumentEtags(nofoName, [copiedEtag]);

  // A PDF replaced by a TXT (or the reverse) must not leave the old document for the Knowledge Base.
  for (const other of DOCUMENT_FILES.filter((f) => f !== file)) {
    for (const key of [`${nofoName}/${other}`, `${nofoName}/${other}.metadata.json`]) {
      if (await head(grantBucket, key)) await s3.send(new DeleteObjectCommand({ Bucket: grantBucket, Key: key }));
    }
  }

  for (const name of STAGED_FILES) {
    const from = `${dir}${name}`;
    const to = `${nofoName}/${name}`;
    if (staged.has(from)) {
      await s3.send(new CopyObjectCommand({ Bucket: artifacts, CopySource: copySource(artifacts, from), Key: to }));
    } else if (name === PAGE_MAP_FILE && (await head(artifacts, to))) {
      // A TXT has no page map; the old one would point the chat at the wrong pages.
      await s3.send(new DeleteObjectCommand({ Bucket: artifacts, Key: to }));
    }
  }
  return documentKey;
}

/**
 * Puts every published key back to the version the journal saved, then drops the journal. Returns
 * false when there was no journal (nothing was swapped).
 */
export async function rollBack(nofoName) {
  const journal = await readJournal(nofoName);
  if (!journal) return false;
  const restores = [];
  for (const entry of journal.entries) {
    const current = await head(entry.bucket, entry.key);
    if (!entry.existed) {
      if (current) await s3.send(new DeleteObjectCommand({ Bucket: entry.bucket, Key: entry.key }));
      continue;
    }
    if (current?.VersionId && current.VersionId === entry.versionId) continue;
    if (!entry.versionId) {
      console.error(`Cannot restore ${entry.bucket}/${entry.key}: the bucket kept no version of it`);
      continue;
    }
    restores.push(entry);
  }
  await recordDocumentEtags(nofoName, restores.filter((e) => isDocument(e.key)).map((e) => e.etag));
  for (const entry of restores) {
    await s3.send(
      new CopyObjectCommand({
        Bucket: entry.bucket,
        CopySource: `${copySource(entry.bucket, entry.key)}?versionId=${encodeURIComponent(entry.versionId)}`,
        Key: entry.key,
      })
    );
  }
  await s3.send(new DeleteObjectCommand({ Bucket: artifactsBucket(), Key: journalKey(nofoName) }));
  console.log(`Restored the published version of ${nofoName}`);
  return true;
}

/** After the swap is recorded on the metadata row: the journal goes first, so a reject can't undo a finished publish. */
export async function finishSwap(nofoName) {
  await s3.send(new DeleteObjectCommand({ Bucket: artifactsBucket(), Key: journalKey(nofoName) }));
  try {
    await deletePending(s3, nofoName);
  } catch (error) {
    console.warn(`Could not clear the staged files of ${nofoName}; the next run clears them:`, error.message);
  }
}

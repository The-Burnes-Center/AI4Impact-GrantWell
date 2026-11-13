/**
 * Finds the passage of the grant behind each requirement on the Requirements page and saves them as
 * `<grant>/requirements-citations.json`. summary.json comes from a structured-output call, which the
 * API cannot combine with citations, so this is a second Haiku call with citations on.
 *
 * Events: `{ nofoName }` (publish and admin edits), or `{ reconcile: true }` (nightly, and the
 * backfill): every grant whose file is missing or older than its summary or text. The nightly run
 * only writes citations; it never unpublishes anything.
 *
 * `{ verifyLive: true }` checks every live grant and writes a report; only `{ verifyLive: true,
 * apply: true, reportId }`, run by hand, unpublishes the grants in that report (see verify-live.mjs).
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { artifactsBucket, isMissingObject, putArtifact, readArtifactText } from "grantwell-shared";
import { pageMapKey, usablePageStarts } from "../extract-text/page-map.mjs";
import {
  CITATIONS_FILE,
  CITATIONS_VERSION,
  MAX_TEXT_CHARS,
  citeItems,
  citationsFile,
  itemsHash,
  requirementItems,
} from "../shared/cite.mjs";
import { verifyLive } from "./verify-live.mjs";

export { CATEGORIES, CITATIONS_FILE, CITATIONS_VERSION, citationPrompt, citationsById, citationsFile, itemsHash, requirementItems } from "../shared/cite.mjs";

const RECONCILE_CONCURRENCY = 4;
const RECONCILE_BUDGET_MS = 12 * 60 * 1000;
const MAX_ROUNDS = 6;

const s3 = new S3Client();
const lambda = new LambdaClient();

async function readOptional(key) {
  try {
    return await readArtifactText(s3, key);
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

/** Writes the grant's citations file unless it is already current. Returns what it did. */
export async function citeGrant(nofoName, { force = false } = {}) {
  const [summaryText, rawText, mapText, existingText] = await Promise.all([
    readOptional(`${nofoName}/summary.json`),
    readOptional(`${nofoName}/raw-text.txt`),
    readOptional(pageMapKey(nofoName)),
    readOptional(`${nofoName}/${CITATIONS_FILE}`),
  ]);
  if (!summaryText || !rawText?.trim()) return "no-source";
  if (rawText.length > MAX_TEXT_CHARS) return "too-long";

  const items = requirementItems(JSON.parse(summaryText));
  if (!items.length) return "no-items";
  const hash = itemsHash(items);
  let existing = null;
  try {
    existing = existingText ? JSON.parse(existingText) : null;
  } catch {}
  if (!force && existing?.version === CITATIONS_VERSION && existing.itemsHash === hash && existing.textChars === rawText.length) return "current";

  let pageStarts = null;
  try {
    pageStarts = mapText ? usablePageStarts(JSON.parse(mapText), rawText) : null;
  } catch {}

  const modelId = process.env.HAIKU_MODEL_ID;
  const file = citationsFile(items, await citeItems(nofoName, rawText, items, modelId), { textChars: rawText.length, pageStarts, model: modelId });
  if (existing?.approval) file.approval = existing.approval;
  await putArtifact(s3, `${nofoName}/${CITATIONS_FILE}`, JSON.stringify(file), "application/json");
  console.log(`Cited ${Object.keys(file.items).length}/${items.length} requirements for ${nofoName}`);
  return "written";
}

/** Grants whose citations file is missing or older than their summary.json or raw-text.txt. */
export function staleGrants(objects) {
  const byGrant = new Map();
  for (const { Key, LastModified } of objects) {
    const slash = Key.indexOf("/");
    if (slash <= 0 || Key.startsWith("_")) continue;
    const name = Key.slice(0, slash);
    const file = Key.slice(slash + 1);
    if (!["summary.json", "raw-text.txt", CITATIONS_FILE].includes(file)) continue;
    const entry = byGrant.get(name) ?? {};
    entry[file] = new Date(LastModified).getTime();
    byGrant.set(name, entry);
  }
  return [...byGrant]
    .filter(([, f]) => f["summary.json"] && f["raw-text.txt"])
    .filter(([, f]) => !f[CITATIONS_FILE] || f[CITATIONS_FILE] < Math.max(f["summary.json"], f["raw-text.txt"]))
    .map(([name]) => name)
    .sort();
}

async function listObjects() {
  const objects = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: artifactsBucket(), ContinuationToken: token }));
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function reconcile(round, remainingMs) {
  const started = Date.now();
  const grants = staleGrants(await listObjects());
  const counts = {};
  let next = 0;
  let outOfTime = false;
  await Promise.all(
    Array.from({ length: Math.min(RECONCILE_CONCURRENCY, grants.length) }, async () => {
      while (next < grants.length) {
        if (Date.now() - started > RECONCILE_BUDGET_MS || remainingMs() < 2 * 60 * 1000) {
          outOfTime = true;
          return;
        }
        const name = grants[next++];
        try {
          const result = await citeGrant(name);
          counts[result] = (counts[result] ?? 0) + 1;
        } catch (error) {
          counts.failed = (counts.failed ?? 0) + 1;
          console.error(`Could not cite requirements for ${name}:`, error.message);
        }
      }
    })
  );
  console.log(`Requirements citations reconcile round ${round}: ${grants.length} stale`, counts);
  if (outOfTime && round < MAX_ROUNDS && process.env.AWS_LAMBDA_FUNCTION_NAME) {
    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: JSON.stringify({ reconcile: true, round: round + 1 }),
      })
    );
  }
  return { stale: grants.length, ...counts, continued: outOfTime && round < MAX_ROUNDS };
}

export const handler = async (event, context) => {
  if (event?.verifyLive) {
    return verifyLive(event, () => context?.getRemainingTimeInMillis?.() ?? Infinity);
  }
  if (event?.reconcile) {
    return reconcile(Number(event.round) || 1, () => context?.getRemainingTimeInMillis?.() ?? Infinity);
  }
  if (!event?.nofoName) throw new Error("cite-requirements needs { nofoName }, { reconcile: true } or { verifyLive: true }");
  return { result: await citeGrant(event.nofoName, { force: !!event.force }) };
};

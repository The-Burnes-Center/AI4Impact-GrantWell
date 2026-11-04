/**
 * Finds the passage of the grant behind each requirement on the Requirements page and saves them as
 * `<grant>/requirements-citations.json`. summary.json comes from a structured-output call, which the
 * API cannot combine with citations, so this is a second Haiku call with citations on.
 *
 * Events: `{ nofoName }` (publish and admin edits), or `{ reconcile: true }` (nightly, and the
 * backfill): every grant whose file is missing or older than its summary or text.
 */

import { createHash } from "node:crypto";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  artifactsBucket,
  isMissingObject,
  putArtifact,
  readArtifactText,
  requirementKey,
  REQUIREMENT_CITATIONS_FILE,
} from "grantwell-shared";
import { invokeBedrockWithRetry } from "../shared/bedrock.mjs";
import { pageAt, pageMapKey, usablePageStarts } from "../extract-text/page-map.mjs";

export const CITATIONS_FILE = REQUIREMENT_CITATIONS_FILE;
export const CITATIONS_VERSION = 1;
export const CATEGORIES = { EligibilityCriteria: "E", RequiredDocuments: "D", ProjectNarrativeSections: "N", KeyDeadlines: "K" };

const MAX_PER_ITEM = 3;
const QUOTE_MAX_CHARS = 600;
const RECONCILE_CONCURRENCY = 4;
const RECONCILE_BUDGET_MS = 12 * 60 * 1000;
const MAX_ROUNDS = 6;
// Haiku reads 1M tokens; at ~4 characters a token this leaves room for the list and the answer.
const MAX_TEXT_CHARS = 3_000_000;

const s3 = new S3Client();
const lambda = new LambdaClient();

const sha = (value) => createHash("sha256").update(value).digest("hex");

/** The summary's requirement items with prompt ids (E1, D2, …) and keys. */
export function requirementItems(summary) {
  const items = [];
  for (const [category, prefix] of Object.entries(CATEGORIES)) {
    const list = Array.isArray(summary?.[category]) ? summary[category] : [];
    list.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      items.push({
        id: `${prefix}${i + 1}`,
        key: requirementKey(category, entry),
        item: String(entry.item ?? "").trim(),
        description: String(entry.description ?? "").trim(),
      });
    });
  }
  return items;
}

export const itemsHash = (items) => sha(items.map((i) => i.key).join(","));

const oneLine = (s) => s.replace(/\s+/g, " ").trim();

export function citationPrompt(items) {
  const list = items.map((i) => `[${i.id}] ${oneLine(i.item)}: ${oneLine(i.description)}`).join("\n");
  return `The grant above was summarized into the requirements listed below, each with an ID in square brackets. For each requirement, in order, write one line that starts with its ID in square brackets and then restates the requirement in a few words, citing the passage of the grant that states it. Cite the most specific passage, such as the sentence that gives the date, amount or rule. If no passage in the grant supports a requirement, write its ID and "no source". Write nothing else.

<requirements>
${list}
</requirements>`;
}

const ID = /\[([EDNK]\d+)\]/g;
const TRAILING_ID = /\s*\[[EDNK]\d+\]\s*$/;

/**
 * Citations per item id from the answer's content blocks. A cited block belongs to the last ID
 * written before its text (an ID that ends the block opens the next line, so it does not count).
 */
export function citationsById(content) {
  const out = new Map();
  let full = "";
  for (const block of content || []) {
    if (block?.type !== "text") continue;
    const text = block.text || "";
    const own = full + text.replace(TRAILING_ID, "");
    full += text;
    if (!Array.isArray(block.citations) || !block.citations.length) continue;
    const ids = [...own.matchAll(ID)];
    const id = ids.at(-1)?.[1];
    if (!id) continue;
    const list = out.get(id) ?? [];
    list.push(...block.citations);
    out.set(id, list);
  }
  return out;
}

function pagesOf(citation, pageStarts) {
  if (citation.type !== "char_location" || !pageStarts) return {};
  return {
    page: pageAt(pageStarts, citation.start_char_index),
    lastPage: pageAt(pageStarts, Math.max(citation.start_char_index, citation.end_char_index - 1)),
  };
}

/** The saved file: per item key, up to three distinct quotes with pages. */
export function citationsFile(items, byId, { textChars, pageStarts, model }) {
  const entries = {};
  for (const item of items) {
    const seen = new Set();
    const quotes = [];
    for (const citation of byId.get(item.id) ?? []) {
      const quote = String(citation.cited_text ?? "").trim();
      if (!quote || seen.has(quote) || quotes.length >= MAX_PER_ITEM) continue;
      seen.add(quote);
      quotes.push({
        quote: quote.length > QUOTE_MAX_CHARS ? `${quote.slice(0, QUOTE_MAX_CHARS).trimEnd()}…` : quote,
        ...pagesOf(citation, pageStarts),
      });
    }
    if (quotes.length) entries[item.key] = quotes;
  }
  return { version: CITATIONS_VERSION, itemsHash: itemsHash(items), textChars, model, items: entries };
}

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
  if (!force && existingText) {
    try {
      const existing = JSON.parse(existingText);
      if (existing.version === CITATIONS_VERSION && existing.itemsHash === hash && existing.textChars === rawText.length) return "current";
    } catch {}
  }

  let pageStarts = null;
  try {
    pageStarts = mapText ? usablePageStarts(JSON.parse(mapText), rawText) : null;
  } catch {}

  const modelId = process.env.HAIKU_MODEL_ID;
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: Math.min(32000, 1000 + items.length * 150),
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "text", media_type: "text/plain", data: rawText },
            title: nofoName,
            citations: { enabled: true },
          },
          { type: "text", text: citationPrompt(items) },
        ],
      },
    ],
  };
  const response = await invokeBedrockWithRetry({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  if (parsed.stop_reason === "refusal") throw new Error(`Haiku declined to cite ${nofoName} (${parsed.stop_details?.category ?? "no category"})`);
  if (parsed.stop_reason === "max_tokens") console.warn(`Citations for ${nofoName} were cut off; saving the items cited so far`);

  const file = citationsFile(items, citationsById(parsed.content), { textChars: rawText.length, pageStarts, model: modelId });
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
  if (event?.reconcile) {
    return reconcile(Number(event.round) || 1, () => context?.getRemainingTimeInMillis?.() ?? Infinity);
  }
  if (!event?.nofoName) throw new Error("cite-requirements needs { nofoName } or { reconcile: true }");
  return { result: await citeGrant(event.nofoName, { force: !!event.force }) };
};

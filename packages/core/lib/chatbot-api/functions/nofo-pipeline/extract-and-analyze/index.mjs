import { EXTRACTION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readRawText } from "../shared/s3.mjs";
import { invokeStructuredOutput, isRetryableError } from "../shared/bedrock.mjs";
import { validateMergedSummary, countItems, isPlaceholderText } from "../shared/json.mjs";
import { EXTRACTION_SCHEMA } from "../shared/schemas.mjs";

const SONNET_MODEL = process.env.SONNET_MODEL_ID;
const CHUNK_SIZE = 80000;
const CHUNK_OVERLAP = 5000;
const MAX_CONCURRENT_CHUNKS = 3;
const NOFO_CLOSING_TAG = /<\s*\/\s*nofo_document\s*>/gi;
const MAX_CHUNK_ATTEMPTS = 3;
const CHUNK_RETRY_BASE_MS = 5000;
// One attempt can run a full Bedrock request timeout; don't start one the Lambda can't finish.
const MIN_REMAINING_MS_FOR_RETRY = 5 * 60 * 1000;
const SPARSE_MIN_CHARS = 20000;
const SPARSE_MAX_ITEMS = 3;

export const handler = async (event, context) => {
  const { s3Bucket, rawTextKey, nofoName } = event;

  await updateProcessingStatus(nofoName, "extracting");

  const rawText = await readRawText(s3Bucket, rawTextKey);
  const chunks = rawText.length <= CHUNK_SIZE ? [rawText] : splitIntoChunks(rawText, CHUNK_SIZE, CHUNK_OVERLAP);
  if (chunks.length > 1) {
    console.log(`Document ${nofoName} is ${rawText.length} chars, split into ${chunks.length} chunks`);
  }

  const outcomes = await processWithConcurrency(
    chunks,
    (chunk, i) => {
      if (chunks.length > 1) {
        console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
      }
      return extractChunkWithRetry(chunk, i, chunks.length, nofoName, context);
    },
    MAX_CONCURRENT_CHUNKS
  );

  const failedChunks = [];
  outcomes.forEach((outcome, i) => {
    if (outcome.error) failedChunks.push(describeChunk(i, chunks.length, rawText.length, outcome.error));
  });
  if (failedChunks.length === chunks.length) {
    throw outcomes[0].error;
  }

  const succeeded = outcomes.filter((outcome) => !outcome.error).map((outcome) => outcome.summary);
  const mergedSummary = withoutPlaceholders(mergeChunkResults(succeeded));

  console.log(
    `Extracted from ${nofoName}: ${countItems(mergedSummary)} items, ` +
    `${rawText.length} chars, ${chunks.length} chunk(s), ${failedChunks.length} failed`
  );

  return {
    ...event,
    mergedSummary,
    retryCount: event.retryCount || 0,
    ...(failedChunks.length > 0 && { failedChunks }),
  };
};

async function extractChunkWithRetry(chunk, i, total, nofoName, context) {
  for (let attempt = 1; ; attempt++) {
    try {
      const summary = await extractFromText(chunk, nofoName);
      // A rare reply lists one or two items for a whole grant; one more try usually fixes it.
      if (attempt === 1 && chunk.length >= SPARSE_MIN_CHARS && countItems(summary) < SPARSE_MAX_ITEMS) {
        console.warn(`Chunk ${i + 1}/${total} of ${nofoName} gave only ${countItems(summary)} item(s), retrying once`);
        continue;
      }
      return { summary };
    } catch (error) {
      const delay = CHUNK_RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * 1000;
      const remaining = context?.getRemainingTimeInMillis?.() ?? Infinity;
      const retry =
        attempt < MAX_CHUNK_ATTEMPTS &&
        isRetryableError(error) &&
        remaining - delay > MIN_REMAINING_MS_FOR_RETRY;
      if (!retry) {
        console.error(
          `Chunk ${i + 1}/${total} of ${nofoName} failed after ${attempt} attempt(s): ${error.name}: ${error.message}`
        );
        return { error };
      }
      console.warn(
        `Chunk ${i + 1}/${total} of ${nofoName} failed (${error.name}), retrying in ${Math.round(delay)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function describeChunk(i, total, textLength, error) {
  const start = i * (CHUNK_SIZE - CHUNK_OVERLAP);
  const end = Math.min(start + CHUNK_SIZE, textLength);
  return {
    part: i + 1,
    of: total,
    startPercent: Math.floor((start / textLength) * 100),
    endPercent: Math.ceil((end / textLength) * 100),
    error: `${error.name}: ${error.message}`.slice(0, 300),
  };
}

async function extractFromText(text, nofoName) {
  const fullPrompt = `${EXTRACTION_PROMPT}\n\n<nofo_document>\n${text.replace(NOFO_CLOSING_TAG, "&lt;/nofo_document&gt;")}\n</nofo_document>`;
  const parsed = await invokeStructuredOutput({
    modelId: SONNET_MODEL,
    prompt: fullPrompt,
    schema: EXTRACTION_SCHEMA,
    toolName: "save_nofo_extraction",
    toolDescription: "Extract the grant document's requirements into the four categories the schema defines",
    maxTokens: 16000,
    effort: "medium",
  });

  const validation = validateMergedSummary(parsed);

  if (validation.data) {
    if (validation.errors.length > 0) {
      console.warn(`Extraction for ${nofoName} had validation issues:`, validation.errors);
    }
    return validation.data;
  }

  console.warn(`Extraction validation failed for ${nofoName}:`, validation.errors);
  return {
    EligibilityCriteria: [],
    RequiredDocuments: [],
    ProjectNarrativeSections: [],
    KeyDeadlines: [],
  };
}

/**
 * Run async tasks with bounded concurrency.
 * Reused for chunk processing and parallel Bedrock calls.
 */
async function processWithConcurrency(items, fn, limit) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function splitIntoChunks(text, chunkSize, overlap) {
  const chunks = [];
  let offset = 0;

  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length);
    chunks.push(text.substring(offset, end));

    if (end === text.length) break;
    offset += chunkSize - overlap;
  }

  return chunks;
}

const CATEGORIES = ["EligibilityCriteria", "RequiredDocuments", "ProjectNarrativeSections", "KeyDeadlines"];

// A chunk sees only part of the grant and may say so ("not given in the provided text").
const CHUNK_BLIND = /\b(?:provided|visible|supplied) (?:text|excerpt|portion)\b|\b(?:in|from) this (?:text|excerpt)\b|\bthe excerpt\b|\bnot (?:included|given|stated|shown|provided) here\b/i;

function withoutChunkBlindSentences(item) {
  if (!item?.description || !CHUNK_BLIND.test(item.description)) return item;
  const kept = item.description.split(/(?<=[.!?])\s+/).filter((s) => !CHUNK_BLIND.test(s)).join(" ").trim();
  return kept ? { ...item, description: kept } : null;
}

export function withoutPlaceholders(summary) {
  const out = { ...summary };
  for (const cat of CATEGORIES) {
    if (Array.isArray(out[cat])) {
      out[cat] = out[cat]
        .map(withoutChunkBlindSentences)
        .filter((i) => i && !isPlaceholderText(i.item) && !isPlaceholderText(i.description));
    }
  }
  return out;
}

export function mergeChunkResults(results) {
  const merged = {};
  for (const cat of CATEGORIES) {
    merged[cat] = deduplicateItems(results.flatMap((r) => r[cat] || []), cat === "ProjectNarrativeSections");
  }
  // Prose the applicant writes is a section; the same name under documents repeats it.
  const sections = new Set(merged.ProjectNarrativeSections.map((s) => normalizeItemName(s.item)));
  merged.RequiredDocuments = merged.RequiredDocuments.filter((d) => !sections.has(normalizeItemName(d.item)));
  return merged;
}

function deduplicateItems(items, joinDescriptions = false) {
  const seen = new Map();

  for (const item of items) {
    const key = normalizeItemName(item.item);
    if (!key) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
      continue;
    }

    const [longer, shorter] = (item.description?.length || 0) > (existing.description?.length || 0) ? [item, existing] : [existing, item];
    // One chunk may hold a section's instructions and another its review criteria.
    const adds = joinDescriptions && shorter.description && !restates(longer.description ?? "", shorter.description);
    seen.set(key, adds ? { ...longer, description: `${longer.description} ${shorter.description}` } : longer);
  }

  return Array.from(seen.values());
}

const wordsOf = (text) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

function restates(longer, shorter) {
  const have = new Set(wordsOf(longer));
  const words = wordsOf(shorter);
  return words.filter((w) => have.has(w)).length >= 0.8 * words.length;
}

// Chunks name one item differently ("Attachment 5: Statement of Work", "Statement of Work
// (Attachment 5)", "Data Management and Sharing (DMS) Plan"): compare word sets, without an
// acronym of the name's own words. A scope in parentheses ("(Senegal)", "(SEED)") is kept.
export function normalizeItemName(name) {
  if (!name) return "";
  const initials = wordsOf(name.replace(/\([^)]*\)/g, " ")).map((w) => w[0]).join("");
  const isAcronym = (acr) => {
    let at = 0;
    for (const ch of initials) if (ch === acr[at]) at++;
    return at === acr.length;
  };
  const bare = name.replace(/\(\s*([A-Z]{2,8})\s*\)/g, (m, acr) => (isAcronym(acr.toLowerCase()) ? " " : m));
  return [...new Set(wordsOf(bare))].sort().join(" ");
}

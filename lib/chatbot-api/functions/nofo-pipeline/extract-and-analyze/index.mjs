import { EXTRACTION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeStructuredOutput } from "../shared/bedrock.mjs";
import { validateMergedSummary, countItems } from "../shared/json.mjs";
import { EXTRACTION_SCHEMA } from "../shared/schemas.mjs";

const SONNET_MODEL = "us.anthropic.claude-sonnet-4-6";
const CHUNK_SIZE = 80000;
const CHUNK_OVERLAP = 5000;
const MAX_CONCURRENT_CHUNKS = 3;

export const handler = async (event) => {
  const { s3Bucket, rawTextKey, nofoName } = event;

  await updateProcessingStatus(nofoName, "extracting");

  const rawText = await readS3Text(s3Bucket, rawTextKey);

  let mergedSummary;

  if (rawText.length <= CHUNK_SIZE) {
    mergedSummary = await extractFromText(rawText, nofoName);
  } else {
    const chunks = splitIntoChunks(rawText, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`Document ${nofoName} is ${rawText.length} chars, split into ${chunks.length} chunks`);

    // Process chunks with bounded concurrency (#6)
    const results = await processWithConcurrency(
      chunks,
      (chunk, i) => {
        console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
        return extractFromText(chunk, nofoName);
      },
      MAX_CONCURRENT_CHUNKS
    );

    mergedSummary = mergeChunkResults(results);
  }

  console.log(
    `Extracted from ${nofoName}: ${countItems(mergedSummary)} items, ` +
    `${rawText.length} chars, ${rawText.length <= CHUNK_SIZE ? 1 : Math.ceil(rawText.length / (CHUNK_SIZE - CHUNK_OVERLAP))} Sonnet call(s)`
  );

  return {
    ...event,
    mergedSummary,
    retryCount: event.retryCount || 0,
  };
};

async function extractFromText(text, nofoName) {
  const fullPrompt = `${EXTRACTION_PROMPT}\n\n<nofo_document>\n${text}\n</nofo_document>`;
  const parsed = await invokeStructuredOutput({
    modelId: SONNET_MODEL,
    prompt: fullPrompt,
    schema: EXTRACTION_SCHEMA,
    toolName: "save_nofo_extraction",
    toolDescription: "Save the structured extraction of the NOFO document",
    maxTokens: 8000,
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

function mergeChunkResults(results) {
  const categories = [
    "EligibilityCriteria",
    "RequiredDocuments",
    "ProjectNarrativeSections",
    "KeyDeadlines",
  ];

  const merged = {};

  for (const cat of categories) {
    const allItems = results.flatMap((r) => r[cat] || []);
    merged[cat] = deduplicateItems(allItems);
  }

  return merged;
}

function deduplicateItems(items) {
  const seen = new Map();
  const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

  for (const item of items) {
    const key = normalizeItemName(item.item);
    if (!key) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
      continue;
    }

    const existingRank = CONFIDENCE_RANK[existing.confidence] || 0;
    const newRank = CONFIDENCE_RANK[item.confidence] || 0;
    const shouldReplace =
      newRank > existingRank ||
      (newRank === existingRank &&
        (item.description?.length || 0) > (existing.description?.length || 0));

    if (shouldReplace) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values());
}

function normalizeItemName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

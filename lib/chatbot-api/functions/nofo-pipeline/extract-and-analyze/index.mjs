import { EXTRACTION_PROMPT, RETRY_PROMPT_PREFIX } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeBedrockWithRetry } from "../shared/bedrock.mjs";
import { extractJson, validateMergedSummary } from "../shared/json.mjs";

const SONNET_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";
const CHUNK_SIZE = 80000;
const CHUNK_OVERLAP = 5000;

export const handler = async (event) => {
  const { s3Bucket, rawTextKey, nofoName, validationFeedback } = event;

  await updateProcessingStatus(nofoName, "extracting");

  const rawText = await readS3Text(s3Bucket, rawTextKey);

  let mergedSummary;

  if (rawText.length <= CHUNK_SIZE) {
    mergedSummary = await extractFromText(rawText, nofoName, validationFeedback);
  } else {
    const chunks = splitIntoChunks(rawText, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`Document ${nofoName} is ${rawText.length} chars, split into ${chunks.length} chunks`);

    const results = [];
    for (const [i, chunk] of chunks.entries()) {
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
      const result = await extractFromText(chunk, nofoName, validationFeedback);
      results.push(result);
    }

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

async function extractFromText(text, nofoName, validationFeedback) {
  let prompt = EXTRACTION_PROMPT;
  if (validationFeedback) {
    prompt = `${RETRY_PROMPT_PREFIX}${validationFeedback}\n\n${prompt}`;
  }

  const fullPrompt = `${prompt}\n\n<nofo_document>\n${text}\n</nofo_document>`;

  const response = await invokeBedrockWithRetry({
    modelId: SONNET_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [{ role: "user", content: fullPrompt }],
      max_tokens: 8000,
      temperature: 0,
    }),
  });

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const parsed = extractJson(body.content[0].text);
  const validation = validateMergedSummary(parsed);

  if (validation.data) {
    if (validation.errors.length > 0) {
      console.warn(`Extraction for ${nofoName} had validation issues:`, validation.errors);
    }
    return validation.data;
  }

  console.warn(`Extraction failed for ${nofoName}:`, validation.errors);
  return {
    GrantName: "",
    EligibilityCriteria: [],
    RequiredDocuments: [],
    ProjectNarrativeSections: [],
    KeyDeadlines: [],
  };
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
  const grantName = results.find((r) => r.GrantName?.trim())?.GrantName || "";

  const categories = [
    "EligibilityCriteria",
    "RequiredDocuments",
    "ProjectNarrativeSections",
    "KeyDeadlines",
  ];

  const merged = { GrantName: grantName };

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

function countItems(summary) {
  return (
    (summary.EligibilityCriteria?.length || 0) +
    (summary.RequiredDocuments?.length || 0) +
    (summary.ProjectNarrativeSections?.length || 0) +
    (summary.KeyDeadlines?.length || 0)
  );
}

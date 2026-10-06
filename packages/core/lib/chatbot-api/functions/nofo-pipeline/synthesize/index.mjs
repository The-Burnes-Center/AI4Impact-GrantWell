import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { DEADLINE_EXTRACTION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeBedrockWithRetry } from "../shared/bedrock.mjs";
import { countItems } from "../shared/json.mjs";
import { documentSampleOf, generateQuestionsWithRetry } from "../shared/questions.mjs";

const dynamoClient = new DynamoDBClient();

const HAIKU_MODEL = process.env.HAIKU_MODEL_ID;

export const handler = async (event) => {
  const { s3Bucket, rawTextKey, nofoName, mergedSummary } = event;

  await updateProcessingStatus(nofoName, "synthesizing");

  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  let agency = null;
  let category = null;
  let existingExpirationDate = null;

  if (tableName) {
    try {
      const existing = await dynamoClient.send(
        new GetItemCommand({
          TableName: tableName,
          Key: marshall({ nofo_name: nofoName }),
        })
      );
      if (existing.Item) {
        const item = unmarshall(existing.Item);
        agency = item.agency || null;
        category = item.category || null;
        existingExpirationDate = item.expiration_date || null;
      }
    } catch (error) {
      console.warn(`Could not fetch metadata for ${nofoName}:`, error.message);
    }
  }

  const documentSample = documentSampleOf(await readS3Text(s3Bucket, rawTextKey));

  // Run deadline extraction and question generation in parallel
  const needsDeadline = !existingExpirationDate && mergedSummary.KeyDeadlines?.length > 0;
  const [applicationDeadline, questionsData] = await Promise.all([
    needsDeadline ? extractDeadline(mergedSummary.KeyDeadlines) : Promise.resolve(null),
    generateQuestionsWithRetry(mergedSummary, documentSample),
  ]);

  mergedSummary.GrantName = nofoName;
  if (agency) mergedSummary.Agency = agency;
  if (category) mergedSummary.Category = category;
  if (applicationDeadline) mergedSummary.application_deadline = applicationDeadline;

  mergedSummary._processingMeta = {
    processedAt: new Date().toISOString(),
    pipelineVersion: "3.1-content-check",
  };

  console.log(`Synthesized ${nofoName}: items=${countItems(mergedSummary)}`);

  return {
    ...event,
    mergedSummary,
    questionsData,
    applicationDeadline,
    agency,
    category,
    existingExpirationDate,
  };
};

async function extractDeadline(keyDeadlines) {
  try {
    const deadlineText = keyDeadlines
      .map((d) => `${d.item}: ${d.description}`)
      .join("\n");

    const response = await invokeBedrockWithRetry({
      modelId: HAIKU_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        messages: [
          { role: "user", content: `${DEADLINE_EXTRACTION_PROMPT}\n\n${deadlineText}` },
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    const body = JSON.parse(new TextDecoder().decode(response.body));
    const content = body.content[0].text.trim();

    if (content.toLowerCase() === "null" || !content) return null;

    // Accept YYYY-MM-DD directly if the LLM returns it
    const isoMatch = content.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return content;

    // Fallback: parse and format as UTC to avoid timezone drift
    const date = new Date(content);
    if (isNaN(date.getTime())) return null;

    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch (error) {
    console.error("Error extracting deadline:", error);
    return null;
  }
}

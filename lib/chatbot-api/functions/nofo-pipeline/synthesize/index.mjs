import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  QUESTION_GENERATION_PROMPT,
  DEADLINE_EXTRACTION_PROMPT,
} from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeBedrockWithRetry, invokeStructuredOutput } from "../shared/bedrock.mjs";
import { validateQuestions, countItems } from "../shared/json.mjs";
import { QUESTIONS_SCHEMA } from "../shared/schemas.mjs";

const dynamoClient = new DynamoDBClient();

const HAIKU_MODEL = "us.anthropic.claude-3-5-haiku-20241022-v1:0";

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

  const rawText = await readS3Text(s3Bucket, rawTextKey);
  const documentSample =
    rawText.length > 30000
      ? rawText.substring(0, 30000) + "\n\n[Truncated...]"
      : rawText;

  // Run deadline extraction and question generation in parallel
  const needsDeadline = !existingExpirationDate && mergedSummary.KeyDeadlines?.length > 0;
  const [applicationDeadline, questionsData] = await Promise.all([
    needsDeadline ? extractDeadline(mergedSummary.KeyDeadlines) : Promise.resolve(null),
    generateQuestions(mergedSummary, documentSample),
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

async function generateQuestions(mergedSummary, documentSample) {
  try {
    // Generate questions if we have any extracted content (not just narratives)
    const hasContent = ["EligibilityCriteria", "RequiredDocuments", "ProjectNarrativeSections", "KeyDeadlines"]
      .some((cat) => mergedSummary[cat]?.length > 0);
    if (!hasContent) return null;

    const prompt = `${QUESTION_GENERATION_PROMPT}\n\n<summary>\n${JSON.stringify(mergedSummary, null, 2)}\n</summary>\n\n<nofo_sample>\n${documentSample}\n</nofo_sample>`;

    const parsed = await invokeStructuredOutput({
      modelId: HAIKU_MODEL,
      prompt,
      schema: QUESTIONS_SCHEMA,
      toolName: "save_questions",
      toolDescription: "Save the generated strategic questions for the NOFO",
      maxTokens: 2000,
      temperature: 0.1,
    });

    const validation = validateQuestions(parsed);

    if (validation.data?.questions?.length > 0) {
      if (validation.errors.length > 0) {
        console.warn("Questions validation issues:", validation.errors);
      }
      return validation.data;
    }
    return null;
  } catch (error) {
    console.error("Error generating questions:", error);
    return null;
  }
}


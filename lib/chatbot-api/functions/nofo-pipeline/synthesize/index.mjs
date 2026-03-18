import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  QUESTION_GENERATION_PROMPT,
  DEADLINE_EXTRACTION_PROMPT,
} from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeBedrockWithRetry, invokeStructuredOutput } from "../shared/bedrock.mjs";
import { validateQuestions } from "../shared/json.mjs";
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

  let applicationDeadline = null;
  if (
    !existingExpirationDate &&
    mergedSummary.KeyDeadlines?.length > 0
  ) {
    applicationDeadline = await extractDeadline(mergedSummary.KeyDeadlines);
  }

  const rawText = await readS3Text(s3Bucket, rawTextKey);
  const documentSample =
    rawText.length > 30000
      ? rawText.substring(0, 30000) + "\n\n[Truncated...]"
      : rawText;
  const questionsData = await generateQuestions(mergedSummary, documentSample);

  const qualityScore = computeQualityScore(mergedSummary);

  if (agency) mergedSummary.Agency = agency;
  if (category) mergedSummary.Category = category;
  if (applicationDeadline) mergedSummary.application_deadline = applicationDeadline;

  mergedSummary._processingMeta = {
    processedAt: new Date().toISOString(),
    pipelineVersion: "3.0-single-pass",
    qualityScore,
    overallConfidence: qualityScore >= 80 ? "high" : qualityScore >= 50 ? "medium" : "low",
  };

  console.log(`Synthesized ${nofoName}: quality=${qualityScore}, items=${countItems(mergedSummary)}`);

  return {
    ...event,
    mergedSummary,
    questionsData,
    applicationDeadline,
    qualityScore,
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

    const date = new Date(content);
    if (isNaN(date.getTime())) return null;

    const estStr = date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const [month, day, year] = estStr.split("/");
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error extracting deadline:", error);
    return null;
  }
}

async function generateQuestions(mergedSummary, documentSample) {
  try {
    if (!mergedSummary.ProjectNarrativeSections?.length) return null;

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

function computeQualityScore(summary) {
  let score = 0;
  const weights = {
    GrantName: 15,
    EligibilityCriteria: 25,
    RequiredDocuments: 15,
    ProjectNarrativeSections: 25,
    KeyDeadlines: 20,
  };

  if (summary.GrantName?.trim()) score += weights.GrantName;

  for (const [field, weight] of Object.entries(weights)) {
    if (field === "GrantName") continue;
    const items = summary[field];
    if (Array.isArray(items) && items.length > 0) {
      const baseScore = Math.min(items.length / 2, 1) * weight * 0.6;
      const confidenceBonus =
        items.filter((i) => i.confidence === "high").length / items.length *
        weight * 0.4;
      score += baseScore + confidenceBonus;
    }
  }

  return Math.round(Math.min(score, 100));
}

function countItems(summary) {
  return (
    (summary.EligibilityCriteria?.length || 0) +
    (summary.RequiredDocuments?.length || 0) +
    (summary.ProjectNarrativeSections?.length || 0) +
    (summary.KeyDeadlines?.length || 0)
  );
}

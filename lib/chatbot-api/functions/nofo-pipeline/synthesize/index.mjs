import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  MERGE_PROMPT,
  QUESTION_GENERATION_PROMPT,
  DEADLINE_EXTRACTION_PROMPT,
} from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";

const bedrockClient = new BedrockRuntimeClient();
const dynamoClient = new DynamoDBClient();

const SONNET_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";
const HAIKU_MODEL = "us.anthropic.claude-3-5-haiku-20241022-v1:0";

export const handler = async (event) => {
  const { s3Bucket, rawTextKey, nofoName, sectionResults } = event;

  await updateProcessingStatus(nofoName, "synthesizing");

  const mergedSummary = await mergeSectionResults(sectionResults);

  // Fetch existing metadata from DynamoDB
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

  // Extract deadline if not already set
  let applicationDeadline = null;
  if (
    !existingExpirationDate &&
    mergedSummary.KeyDeadlines?.length > 0
  ) {
    applicationDeadline = await extractDeadline(mergedSummary.KeyDeadlines);
  }

  // Generate strategic questions
  const rawText = await readS3Text(s3Bucket, rawTextKey);
  const documentSample =
    rawText.length > 30000
      ? rawText.substring(0, 30000) + "\n\n[Truncated...]"
      : rawText;
  const questionsData = await generateQuestions(mergedSummary, documentSample);

  // Compute quality score
  const qualityScore = computeQualityScore(mergedSummary);

  // Attach metadata
  if (agency) mergedSummary.Agency = agency;
  if (category) mergedSummary.Category = category;
  if (applicationDeadline) mergedSummary.application_deadline = applicationDeadline;

  mergedSummary._processingMeta = {
    processedAt: new Date().toISOString(),
    pipelineVersion: "2.0-agentic",
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

async function mergeSectionResults(sectionResults) {
  const allItems = {
    eligibility: [],
    documents: [],
    narrative: [],
    deadlines: [],
    general: [],
  };

  for (const result of sectionResults) {
    if (!result?.items) continue;
    const cat = result.category || "general";
    if (allItems[cat]) {
      allItems[cat].push(...result.items);
    } else {
      allItems.general.push(...result.items);
    }
  }

  // Reclassify general items
  for (const item of allItems.general) {
    const text = `${item.item} ${item.description}`.toLowerCase();
    if (text.includes("eligible") || text.includes("applicant type") || text.includes("who may apply")) {
      allItems.eligibility.push(item);
    } else if (text.includes("submit") || text.includes("document") || text.includes("form") || text.includes("attachment")) {
      allItems.documents.push(item);
    } else if (text.includes("deadline") || text.includes("due date") || text.includes("submission date")) {
      allItems.deadlines.push(item);
    } else {
      allItems.narrative.push(item);
    }
  }

  // If total items are small enough, merge directly without LLM
  const totalItems = Object.values(allItems).flat().length;

  if (totalItems <= 3) {
    return {
      GrantName: "",
      EligibilityCriteria: allItems.eligibility,
      RequiredDocuments: allItems.documents,
      ProjectNarrativeSections: allItems.narrative,
      KeyDeadlines: allItems.deadlines,
    };
  }

  // Use LLM to merge and deduplicate
  const prompt = `${MERGE_PROMPT}\n\n<extraction_results>\n${JSON.stringify(allItems, null, 2)}\n</extraction_results>`;

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: SONNET_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        temperature: 0,
      }),
    })
  );

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const jsonMatch = body.content[0].text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  return {
    GrantName: "",
    EligibilityCriteria: allItems.eligibility,
    RequiredDocuments: allItems.documents,
    ProjectNarrativeSections: allItems.narrative,
    KeyDeadlines: allItems.deadlines,
  };
}

async function extractDeadline(keyDeadlines) {
  try {
    const deadlineText = keyDeadlines
      .map((d) => `${d.item}: ${d.description}`)
      .join("\n");

    const response = await bedrockClient.send(
      new InvokeModelCommand({
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
      })
    );

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

    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: HAIKU_MODEL,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2000,
          temperature: 0.1,
        }),
      })
    );

    const body = JSON.parse(new TextDecoder().decode(response.body));
    const jsonMatch = body.content[0].text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (data.questions?.length) {
        data.totalQuestions = data.questions.length;
        return data;
      }
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


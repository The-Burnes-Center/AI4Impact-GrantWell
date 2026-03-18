import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";

const dynamoClient = new DynamoDBClient();

export const handler = async (event) => {
  const {
    nofoName,
    s3Bucket,
    rawTextKey,
    documentKey,
    mergedSummary,
    questionsData,
    validationResult,
    qualityScore,
    retryCount,
    errorMessage,
    source,
  } = event;

  await updateProcessingStatus(nofoName, "quarantined");

  const tableName = process.env.REVIEW_TABLE_NAME;
  const reviewId = randomUUID();
  const now = new Date().toISOString();

  let documentTextPreview = "";
  if (rawTextKey) {
    try {
      const fullText = await readS3Text(s3Bucket, rawTextKey);
      documentTextPreview = fullText.substring(0, 2000);
    } catch (error) {
      console.warn(`Could not read source text for preview: ${error.message}`);
    }
  }

  const item = {
    nofo_name: nofoName,
    review_id: reviewId,
    status: "pending_review",
    created_at: now,
    extractedSummary: mergedSummary ? JSON.stringify(mergedSummary) : null,
    extractedQuestions: questionsData ? JSON.stringify(questionsData) : null,
    validationResult: validationResult ? JSON.stringify(validationResult) : null,
    qualityScore: qualityScore || 0,
    retryCount: retryCount || 0,
    s3DocumentKey: documentKey || "",
    s3RawTextKey: rawTextKey || "",
    documentTextPreview,
    reviewed_by: null,
    reviewed_at: null,
    admin_notes: null,
    corrections: null,
    source: source || "pipeline",
    errorMessage: errorMessage || null,
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    })
  );

  console.log(
    `Quarantined NOFO ${nofoName} for review (reviewId=${reviewId}, ` +
    `score=${qualityScore}, verdict=${validationResult?.overallVerdict || "N/A"})`
  );

  return {
    statusCode: 200,
    nofoName,
    reviewId,
    quarantined: true,
  };
};

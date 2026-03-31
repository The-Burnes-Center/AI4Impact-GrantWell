import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
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
    adminGuidance,
  } = event;

  await updateProcessingStatus(nofoName, "quarantined");

  const tableName = process.env.REVIEW_TABLE_NAME;
  const reviewId = randomUUID();
  const now = new Date().toISOString();

  // Auto-supersede any existing pending/failed/needs_reupload reviews for this NOFO
  try {
    const existing = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "nofo_name = :name",
        ExpressionAttributeValues: marshall({ ":name": nofoName }),
      })
    );
    const toSupersede = (existing.Items || [])
      .map((i) => unmarshall(i))
      .filter((r) => r.status === "pending_review" || r.status === "failed" || r.status === "needs_reupload");

    for (const old of toSupersede) {
      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: marshall({ nofo_name: nofoName, review_id: old.review_id }),
          UpdateExpression: "SET #s = :status, admin_notes = :notes, superseded_by = :newId",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: marshall({
            ":status": "superseded",
            ":notes": "Superseded by new pipeline run",
            ":newId": reviewId,
          }),
        })
      );
    }
    if (toSupersede.length > 0) {
      console.log(`Superseded ${toSupersede.length} old review(s) for ${nofoName}`);
    }
  } catch (error) {
    console.warn(`Could not supersede old reviews for ${nofoName}:`, error.message);
  }

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
    adminGuidance: adminGuidance ? JSON.stringify(adminGuidance) : null,
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

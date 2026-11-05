import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";
import { updateProcessingStatus, setNofoStatus, markProcessingComplete } from "../shared/status.mjs";
import { readRawText } from "../shared/s3.mjs";
import { liveStatusOf } from "../shared/live.mjs";

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
    previousStatus,
    unpublish,
  } = event;

  const row = await readMetadataRow(nofoName);
  // A live grant's failing new version waits here while its published version stays up. Only a
  // grant with no published version, or one the live check unpublishes, is marked `quarantined`.
  const liveStatus = unpublish === true ? null : await liveStatusOf(nofoName, row, { unknownIsLive: true });
  const heldFrom = typeof previousStatus === "string" ? previousStatus : typeof row?.previous_status === "string" ? row.previous_status : undefined;
  // An unreadable row leaves the status alone: a new grant is already `processing`, which is held too.
  if (!liveStatus && (row !== undefined || unpublish === true)) await setNofoStatus(nofoName, "quarantined", { previousStatus: heldFrom });
  await updateProcessingStatus(nofoName, "quarantined");
  // Stamp completion so the Processing tab shows this as a "Needs review" outcome for a window.
  await markProcessingComplete(nofoName, "needs_review");

  const tableName = process.env.REVIEW_TABLE_NAME;
  const reviewId = randomUUID();
  const now = new Date().toISOString();

  // Auto-supersede any existing pending/failed/needs_reupload reviews for this NOFO
  try {
    const existing = [];
    let lastKey;
    do {
      const page = await dynamoClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "nofo_name = :name",
          ExpressionAttributeValues: marshall({ ":name": nofoName }),
          ExclusiveStartKey: lastKey,
        })
      );
      existing.push(...(page.Items || []).map((i) => unmarshall(i)));
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);
    const toSupersede = existing
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
      const fullText = await readRawText(s3Bucket, rawTextKey);
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
    // Approving restores the status the grant had before it was held.
    previous_status: liveStatus ? undefined : heldFrom,
    // Set when the grant's published version stays live; rejecting then keeps it.
    live_status: liveStatus ?? undefined,
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

async function readMetadataRow(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return null;
  try {
    const result = await dynamoClient.send(
      new GetItemCommand({ TableName: tableName, Key: marshall({ nofo_name: nofoName }) })
    );
    return result.Item ? unmarshall(result.Item) : null;
  } catch (error) {
    console.warn(`Could not read metadata for ${nofoName}:`, error.message);
    return undefined;
  }
}

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient();

/**
 * Updates the processing_status field in the NOFO metadata table.
 * Used for real-time status tracking in the Grants tab.
 * @param {string} nofoName - The NOFO folder name
 * @param {string|null} stage - Stage name (e.g. "extracting_text") or null to clear
 */
export async function updateProcessingStatus(nofoName, stage) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName) return;

  try {
    const now = new Date().toISOString();
    if (stage === null) {
      await client.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: marshall({ nofo_name: nofoName }),
          UpdateExpression: "REMOVE processing_status SET updated_at = :now",
          ExpressionAttributeValues: marshall({ ":now": now }),
        })
      );
    } else {
      await client.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: marshall({ nofo_name: nofoName }),
          UpdateExpression: "SET processing_status = :s, updated_at = :now",
          ExpressionAttributeValues: marshall({
            ":s": stage,
            ":now": now,
          }),
        })
      );
    }
  } catch (error) {
    console.warn("Could not update processing status:", error.message);
  }
}

/**
 * `previousStatus` is kept on the row as previous_status until the grant publishes or is deleted,
 * so a reprocess that supersedes the review still restores it.
 */
export async function setNofoStatus(nofoName, status, { previousStatus } = {}) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return;
  const keepPrevious = typeof previousStatus === "string";
  try {
    await client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression: `SET #status = :s, updated_at = :now${keepPrevious ? ", previous_status = :prev" : ""}`,
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: marshall({
          ":s": status,
          ":now": new Date().toISOString(),
          ...(keepPrevious && { ":prev": previousStatus }),
        }),
      })
    );
  } catch (error) {
    console.warn(`Could not set status=${status} for ${nofoName}:`, error.message);
  }
}

/**
 * Stamp the terminal completion fields the Processing tab reads to keep a finished grant visible
 * for a window (see retrieve-nofos). outcome is "published" (went live) or "needs_review" (failed/
 * quarantined). Publish stamps these inline in its own UpdateItem; failure paths call this.
 */
export async function markProcessingComplete(nofoName, outcome) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return;
  try {
    await client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression:
          "SET processing_completed_at = :now, processing_outcome = :outcome, updated_at = :now" +
          " REMOVE pipeline_claim_at, pipeline_claim_execution, pipeline_claim_document",
        ExpressionAttributeValues: marshall({
          ":now": new Date().toISOString(),
          ":outcome": outcome,
        }),
      })
    );
  } catch (error) {
    console.warn(`Could not stamp completion for ${nofoName}:`, error.message);
  }
}

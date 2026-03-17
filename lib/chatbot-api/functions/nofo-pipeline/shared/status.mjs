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

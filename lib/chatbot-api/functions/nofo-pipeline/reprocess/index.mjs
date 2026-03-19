import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, UpdateItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { httpResponse } from "../shared/json.mjs";

const s3Client = new S3Client();
const sqsClient = new SQSClient();
const dynamoClient = new DynamoDBClient();

export const handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const { nofoName } = body;

  if (!nofoName) {
    return httpResponse(400, { error: "nofoName is required" });
  }

  const bucket = process.env.BUCKET;
  const queueUrl = process.env.QUEUE_URL;
  const metadataTable = process.env.NOFO_METADATA_TABLE_NAME;

  // Find the NOFO file in S3
  const listResult = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${nofoName}/NOFO-File-`,
      MaxKeys: 5,
    })
  );

  const nofoFile = listResult.Contents?.find(
    (obj) =>
      obj.Key.endsWith("NOFO-File-PDF") || obj.Key.endsWith("NOFO-File-TXT")
  );

  if (!nofoFile) {
    return httpResponse(404, { error: `No NOFO file found for "${nofoName}"` });
  }

  // Send message to the processing queue (mimics S3 event format)
  const s3Event = {
    Records: [
      {
        s3: {
          bucket: { name: bucket },
          object: { key: encodeURIComponent(nofoFile.Key) },
        },
      },
    ],
  };

  // Mark any existing pending reviews as superseded before reprocessing
  const reviewTable = process.env.REVIEW_TABLE_NAME;
  if (reviewTable) {
    try {
      const existing = await dynamoClient.send(
        new QueryCommand({
          TableName: reviewTable,
          KeyConditionExpression: "nofo_name = :name",
          ExpressionAttributeValues: marshall({ ":name": nofoName }),
        })
      );
      const pendingReviews = (existing.Items || [])
        .map((i) => unmarshall(i))
        .filter((r) => r.status === "pending_review" || r.status === "failed");

      for (const review of pendingReviews) {
        await dynamoClient.send(
          new UpdateItemCommand({
            TableName: reviewTable,
            Key: marshall({ nofo_name: nofoName, review_id: review.review_id }),
            UpdateExpression: "SET #s = :status, admin_notes = :notes",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: marshall({
              ":status": "rejected",
              ":notes": "Superseded by reprocessing",
            }),
          })
        );
      }
    } catch (error) {
      console.warn("Could not update old reviews:", error.message);
    }
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(s3Event),
    })
  );

  // Update metadata table to show reprocessing status
  if (metadataTable) {
    try {
      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: metadataTable,
          Key: marshall({ nofo_name: nofoName }),
          UpdateExpression: "SET processing_status = :ps, updated_at = :now",
          ExpressionAttributeValues: marshall({
            ":ps": "reprocessing",
            ":now": new Date().toISOString(),
          }),
        })
      );
    } catch (error) {
      console.warn("Could not update metadata:", error.message);
    }
  }

  console.log(`Reprocessing triggered for ${nofoName}`);

  return httpResponse(200, {
    message: `Reprocessing triggered for "${nofoName}"`,
    documentKey: nofoFile.Key,
  });
};

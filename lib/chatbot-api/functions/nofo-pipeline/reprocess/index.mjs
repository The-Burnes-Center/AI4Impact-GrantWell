import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const s3Client = new S3Client();
const sqsClient = new SQSClient();
const dynamoClient = new DynamoDBClient();

export const handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const { nofoName } = body;

  if (!nofoName) {
    return response(400, { error: "nofoName is required" });
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
    return response(404, { error: `No NOFO file found for "${nofoName}"` });
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
          UpdateExpression: "SET updated_at = :now",
          ExpressionAttributeValues: marshall({
            ":now": new Date().toISOString(),
          }),
        })
      );
    } catch (error) {
      console.warn("Could not update metadata:", error.message);
    }
  }

  console.log(`Reprocessing triggered for ${nofoName}`);

  return response(200, {
    message: `Reprocessing triggered for "${nofoName}"`,
    documentKey: nofoFile.Key,
  });
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";

const sqsClient = new SQSClient();
const dynamoClient = new DynamoDBClient();

export const handler = async () => {
  const dlqUrl = process.env.DLQ_URL;
  const reviewTableName = process.env.REVIEW_TABLE_NAME;
  let processedCount = 0;

  // Poll DLQ for messages (up to 10 at a time, repeat until empty)
  let hasMore = true;

  while (hasMore) {
    const receiveResult = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: dlqUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1,
      })
    );

    const messages = receiveResult.Messages || [];
    if (messages.length === 0) {
      hasMore = false;
      break;
    }

    for (const message of messages) {
      try {
        let nofoName = "unknown";
        let documentKey = "";
        let errorInfo = message.Body;

        // Attempt to extract NOFO name from the SQS message
        try {
          const s3Event = JSON.parse(message.Body);
          if (s3Event.Records?.[0]?.s3) {
            const key = decodeURIComponent(
              s3Event.Records[0].s3.object.key.replace(/\+/g, " ")
            );
            nofoName = key.substring(0, key.lastIndexOf("/"));
            documentKey = key;
          }
        } catch {
          // Message body is not a parseable S3 event
        }

        const reviewId = randomUUID();
        const now = new Date().toISOString();
        const ttl = Math.floor(Date.now() / 1000) + 90 * 86400;

        await dynamoClient.send(
          new PutItemCommand({
            TableName: reviewTableName,
            Item: marshall(
              {
                nofo_name: nofoName,
                review_id: reviewId,
                status: "failed",
                created_at: now,
                ttl,
                extractedSummary: null,
                extractedQuestions: null,
                validationResult: null,
                qualityScore: 0,
                retryCount: 3,
                s3DocumentKey: documentKey,
                s3RawTextKey: "",
                documentTextPreview: "",
                reviewed_by: null,
                reviewed_at: null,
                admin_notes: null,
                corrections: null,
                source: "dlq",
                errorMessage: typeof errorInfo === "string"
                  ? errorInfo.substring(0, 1000)
                  : JSON.stringify(errorInfo).substring(0, 1000),
              },
              { removeUndefinedValues: true }
            ),
          })
        );

        // Delete processed message from DLQ
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: dlqUrl,
            ReceiptHandle: message.ReceiptHandle,
          })
        );

        processedCount++;
      } catch (error) {
        console.error("Error processing DLQ message:", error);
      }
    }
  }

  console.log(`DLQ processor: surfaced ${processedCount} failed items to review table`);

  return { processedCount };
};

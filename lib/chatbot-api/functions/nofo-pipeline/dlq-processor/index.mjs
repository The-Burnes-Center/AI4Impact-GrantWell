import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";

const sqsClient = new SQSClient();
const dynamoClient = new DynamoDBClient();

async function drainQueue(dlqUrl, reviewTableName, source) {
  let processedCount = 0;
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

        try {
          const parsed = JSON.parse(message.Body);

          if (parsed.Records?.[0]?.s3) {
            const key = decodeURIComponent(
              parsed.Records[0].s3.object.key.replace(/\+/g, " ")
            );
            nofoName = key.substring(0, key.lastIndexOf("/"));
            documentKey = key;
          }

          if (parsed.opportunityTitle) {
            nofoName = parsed.opportunityTitle;
          }
        } catch {
          // Not parseable — keep defaults
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
                source,
                errorMessage: typeof errorInfo === "string"
                  ? errorInfo.substring(0, 1000)
                  : JSON.stringify(errorInfo).substring(0, 1000),
              },
              { removeUndefinedValues: true }
            ),
          })
        );

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

  return processedCount;
}

export const handler = async () => {
  const dlqUrl = process.env.DLQ_URL;
  const scraperDlqUrl = process.env.SCRAPER_DLQ_URL;
  const reviewTableName = process.env.REVIEW_TABLE_NAME;

  const pipelineCount = await drainQueue(dlqUrl, reviewTableName, "dlq");

  let scraperCount = 0;
  if (scraperDlqUrl) {
    scraperCount = await drainQueue(scraperDlqUrl, reviewTableName, "scraper-dlq");
  }

  const total = pipelineCount + scraperCount;
  console.log(
    `DLQ processor: surfaced ${total} failed items (pipeline=${pipelineCount}, scraper=${scraperCount})`
  );

  return { processedCount: total, pipelineCount, scraperCount };
};

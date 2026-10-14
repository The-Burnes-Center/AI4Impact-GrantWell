import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";
import { updateProcessingStatus, setNofoStatus, markProcessingComplete } from "../shared/status.mjs";

const sqsClient = new SQSClient();
const dynamoClient = new DynamoDBClient();

async function findFailedReview(reviewTableName, nofoName, source) {
  let lastKey;
  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: reviewTableName,
        KeyConditionExpression: "nofo_name = :name",
        ExpressionAttributeValues: marshall({ ":name": nofoName }),
        ExclusiveStartKey: lastKey,
      })
    );
    const match = (result.Items || [])
      .map((item) => unmarshall(item))
      .find((r) => r.status === "failed" && r.source === source);
    if (match) return match;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return null;
}

async function recordRepeatFailure(reviewTableName, existing, { now, ttl, retryCount, errorMessage }) {
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: reviewTableName,
        Key: marshall({ nofo_name: existing.nofo_name, review_id: existing.review_id }),
        UpdateExpression:
          "SET errorMessage = :err, retryCount = :retry, last_failed_at = :now, #ttl = :ttl," +
          " failure_count = if_not_exists(failure_count, :one) + :one",
        ConditionExpression: "#status = :failed",
        ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
        ExpressionAttributeValues: marshall({
          ":err": errorMessage,
          ":retry": retryCount,
          ":now": now,
          ":ttl": ttl,
          ":one": 1,
          ":failed": "failed",
        }),
      })
    );
    return true;
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

async function metadataExists(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName) return false;
  const result = await dynamoClient.send(
    new GetItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName }),
      ProjectionExpression: "nofo_name",
    })
  );
  return Boolean(result.Item);
}

async function drainQueue(dlqUrl, reviewTableName, source) {
  let processedCount = 0;
  let hasMore = true;

  while (hasMore) {
    const receiveResult = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: dlqUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1,
        AttributeNames: ["ApproximateReceiveCount"],
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

        const now = new Date().toISOString();
        const ttl = Math.floor(Date.now() / 1000) + 90 * 86400;
        const actualRetryCount = parseInt(message.Attributes?.ApproximateReceiveCount || "0", 10);
        const errorMessage = typeof errorInfo === "string"
          ? errorInfo.substring(0, 1000)
          : JSON.stringify(errorInfo).substring(0, 1000);

        // The scraper re-queues a grant daily until it has metadata, so a persistent failure
        // lands here every day; fold repeats into the open failed row instead of piling up new ones.
        const existing = nofoName !== "unknown"
          ? await findFailedReview(reviewTableName, nofoName, source)
          : null;
        const updated = existing
          ? await recordRepeatFailure(reviewTableName, existing, {
              now,
              ttl,
              retryCount: actualRetryCount,
              errorMessage,
            })
          : false;

        if (!updated) {
          await dynamoClient.send(
            new PutItemCommand({
              TableName: reviewTableName,
              Item: marshall(
                {
                  nofo_name: nofoName,
                  review_id: randomUUID(),
                  status: "failed",
                  created_at: now,
                  last_failed_at: now,
                  failure_count: 1,
                  ttl,
                  extractedSummary: null,
                  extractedQuestions: null,
                  validationResult: null,
                  qualityScore: 0,
                  retryCount: actualRetryCount,
                  s3DocumentKey: documentKey,
                  s3RawTextKey: "",
                  documentTextPreview: "",
                  reviewed_by: null,
                  reviewed_at: null,
                  admin_notes: null,
                  corrections: null,
                  source,
                  errorMessage,
                },
                { removeUndefinedValues: true }
              ),
            })
          );
        }

        // A hard pipeline failure is a terminal "needs attention" state — treat it like a
        // quarantine so the row leaves the `processing` bucket instead of lingering there: set
        // the metadata status to `quarantined` (queried by the admin list) and the
        // processing_status field the Grants "Needs review" pill keys off. A `failed` review row
        // was already written or refreshed above, so it also surfaces in the attention segment.
        // Only pipeline failures: a scraper-DLQ message is a failed fetch, often an update of a
        // grant that is still live, and these helpers' UpdateItem would create a stub row for a
        // grant that was never ingested (which the coordinator then treats as existing forever).
        if (source === "dlq" && nofoName && nofoName !== "unknown" && (await metadataExists(nofoName).catch(() => false))) {
          await setNofoStatus(nofoName, "quarantined").catch(() => {});
          await updateProcessingStatus(nofoName, "quarantined").catch(() => {});
          await markProcessingComplete(nofoName, "needs_review").catch(() => {});
        }

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

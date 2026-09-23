import { SFNClient, StartExecutionCommand, DescribeExecutionCommand, StopExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { createHash } from "node:crypto";
import { updateProcessingStatus } from "../shared/status.mjs";

const sfnClient = new SFNClient();
const dynamoClient = new DynamoDBClient();

const STALE_REVIEW_STATUSES = new Set(["pending_review", "failed", "needs_reupload"]);
const CLAIM_TTL_MS = 35 * 60 * 1000;

/**
 * Try to become the owner of this NOFO's pipeline run.
 * @returns {{acquired: boolean, previousExecutionArn?: string}}
 */
async function claimPipeline(nofoName, executionName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return { acquired: true };

  const now = Date.now();
  const staleBefore = new Date(now - CLAIM_TTL_MS).toISOString();

  try {
    const result = await dynamoClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression:
          "SET pipeline_claim_execution = :name, pipeline_claim_at = :now, updated_at = :now",
        ConditionExpression:
          "attribute_not_exists(pipeline_claim_at) OR pipeline_claim_at < :staleBefore",
        ExpressionAttributeValues: marshall({
          ":name": executionName,
          ":now": new Date(now).toISOString(),
          ":staleBefore": staleBefore,
        }),
        ReturnValues: "ALL_OLD",
      })
    );

    const previous = result.Attributes ? unmarshall(result.Attributes) : {};
    return { acquired: true, previousExecutionArn: previous.pipeline_execution_arn };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return { acquired: false };
    throw error;
  }
}

/** Record the ARN so a later reprocess can stop this exact execution — no name matching. */
async function recordExecutionArn(nofoName, executionArn) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return;
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression: "SET pipeline_execution_arn = :arn",
        ExpressionAttributeValues: marshall({ ":arn": executionArn }),
      })
    );
  } catch (error) {
    console.warn(`Could not record execution ARN for ${nofoName}:`, error.message);
  }
}

async function releaseClaim(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return;
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression: "REMOVE pipeline_claim_at, pipeline_claim_execution",
      })
    );
  } catch (error) {
    console.warn(`Could not release pipeline claim for ${nofoName}:`, error.message);
  }
}

/**
 * Stop the previous execution for this NOFO by its recorded ARN. Reprocessing is explicitly
 * meant to supersede an in-flight run; a stale ARN from a finished run is a harmless no-op.
 */
async function stopPreviousExecution(executionArn) {
  if (!executionArn) return;
  try {
    const desc = await sfnClient.send(new DescribeExecutionCommand({ executionArn }));
    if (desc.status !== "RUNNING") return;
    await sfnClient.send(
      new StopExecutionCommand({ executionArn, cause: "Reprocessing requested" })
    );
    console.log(`Stopped old execution: ${executionArn}`);
  } catch (error) {
    console.warn(`Could not stop previous execution ${executionArn}:`, error.message);
  }
}

async function supersedeOpenReviews(nofoName) {
  const reviewTable = process.env.REVIEW_TABLE_NAME;
  if (!reviewTable) return;

  try {
    const existing = await dynamoClient.send(
      new QueryCommand({
        TableName: reviewTable,
        KeyConditionExpression: "nofo_name = :name",
        ExpressionAttributeValues: marshall({ ":name": nofoName }),
      })
    );
    const openReviews = (existing.Items || [])
      .map((i) => unmarshall(i))
      .filter((r) => STALE_REVIEW_STATUSES.has(r.status));

    for (const review of openReviews) {
      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: reviewTable,
          Key: marshall({ nofo_name: nofoName, review_id: review.review_id }),
          UpdateExpression: "SET #s = :status, admin_notes = :notes",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: marshall({
            ":status": "superseded",
            ":notes": "Superseded by reprocessing",
          }),
        })
      );
    }
  } catch (error) {
    console.warn(`Could not supersede reviews for ${nofoName}:`, error.message);
  }
}

async function markProcessingStatus(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return;
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression: "SET #status = :processing, updated_at = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: marshall({
          ":processing": "processing",
          ":now": new Date().toISOString(),
        }),
      })
    );
  } catch (error) {
    console.warn(`Could not mark ${nofoName} as processing:`, error.message);
  }
}

export const handler = async (event) => {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;

  const batchItemFailures = [];

  for (const sqsRecord of event.Records) {
    try {
      const s3Event = JSON.parse(sqsRecord.body);

      for (const record of s3Event.Records || []) {
        const s3Bucket = record.s3.bucket.name;
        const documentKey = decodeURIComponent(
          record.s3.object.key.replace(/\+/g, " ")
        );
        const nofoName = documentKey.substring(0, documentKey.lastIndexOf("/"));

        const executionInput = {
          s3Bucket,
          documentKey,
          nofoName,
          retryCount: 0,
          validationFeedback: null,
        };

        const nofoDigest = createHash("sha256").update(nofoName).digest("hex").substring(0, 16);
        const executionName = `${Date.now()}-${nofoDigest}`;

        const claim = await claimPipeline(nofoName, executionName);
        if (!claim.acquired) {
          console.log(`Pipeline already running for ${nofoName}; skipping duplicate dispatch.`);
          continue;
        }

        await supersedeOpenReviews(nofoName);
        await markProcessingStatus(nofoName);
        await updateProcessingStatus(nofoName, "uploading");

        await stopPreviousExecution(claim.previousExecutionArn);

        try {
          const startResult = await sfnClient.send(
            new StartExecutionCommand({
              stateMachineArn,
              name: executionName,
              input: JSON.stringify(executionInput),
            })
          );

          await recordExecutionArn(nofoName, startResult.executionArn);
          console.log(`Started SFN execution for ${nofoName}: ${startResult.executionArn}`);
        } catch (error) {
          await releaseClaim(nofoName);
          throw error;
        }
      }
    } catch (error) {
      console.error("Error dispatching SQS record:", error);
      batchItemFailures.push({ itemIdentifier: sqsRecord.messageId });
    }
  }

  return { batchItemFailures };
};

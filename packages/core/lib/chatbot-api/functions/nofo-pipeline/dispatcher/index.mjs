import { SFNClient, StartExecutionCommand, DescribeExecutionCommand, StopExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBClient, GetItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { createHash } from "node:crypto";
import { S3Client, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { artifactsBucket, copySource, deletePending, grantOfKey, isPendingKey, pendingDir } from "grantwell-shared";
import { updateProcessingStatus } from "../shared/status.mjs";
import { liveStatusOf } from "../shared/live.mjs";
import { SWAP_JOURNAL, SWAP_ETAGS, isStaleRun, normalizeEtag } from "../shared/swap.mjs";

const sfnClient = new SFNClient();
const dynamoClient = new DynamoDBClient();
const s3Client = new S3Client();

async function readMetadataRow(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return null;
  const result = await dynamoClient.send(
    new GetItemCommand({ TableName: tableName, Key: marshall({ nofo_name: nofoName }), ConsistentRead: true })
  );
  return result.Item ? unmarshall(result.Item) : null;
}

/**
 * True when this event is publish copying a staged document into place (publish records its ETag
 * first). The ETag is consumed, so a later upload of the same bytes is processed as usual.
 */
async function consumePublishedCopy(nofoName, row, eTag) {
  const etag = normalizeEtag(eTag);
  const recorded = row?.[SWAP_ETAGS];
  if (!etag || !recorded || ![...recorded].includes(etag)) return false;
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: process.env.NOFO_METADATA_TABLE_NAME,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression: `DELETE ${SWAP_ETAGS} :etag`,
        ExpressionAttributeValues: { ":etag": { SS: [etag] } },
      })
    );
  } catch (error) {
    console.warn(`Could not clear the swapped document's ETag for ${nofoName}:`, error.message);
  }
  return true;
}

async function stagePublishedDocument(bucket, documentKey, nofoName) {
  const stagedKey = `${pendingDir(nofoName)}${documentKey.slice(documentKey.lastIndexOf("/") + 1)}`;
  await s3Client.send(
    new CopyObjectCommand({ Bucket: artifactsBucket(), CopySource: copySource(bucket, documentKey), Key: stagedKey })
  );
  console.log(`${nofoName} is live; its new version runs from ${stagedKey}.`);
}

/** Files an earlier run staged for this grant would otherwise be swapped in with this run's. */
async function clearEarlierStagedFiles(nofoName, documentKey) {
  try {
    await deletePending(s3Client, nofoName, { keep: [documentKey, `${pendingDir(nofoName)}${SWAP_JOURNAL}`] });
  } catch (error) {
    console.warn(`Could not clear earlier staged files for ${nofoName}:`, error.message);
  }
}

const STALE_REVIEW_STATUSES = new Set(["pending_review", "failed", "needs_reupload"]);
const CLAIM_TTL_MS = 50 * 60 * 1000;

/**
 * Try to become the owner of this NOFO's pipeline run.
 * @returns {{acquired: boolean, previousExecutionArn?: string, row?: object}}
 */
async function claimPipeline(nofoName, executionName, { document = null, replaceOlder = false } = {}) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return { acquired: true };

  const now = Date.now();
  const staleBefore = new Date(now - CLAIM_TTL_MS).toISOString();
  const free = "attribute_not_exists(pipeline_claim_at) OR pipeline_claim_at < :staleBefore";

  try {
    const result = await dynamoClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression:
          "SET pipeline_claim_execution = :name, pipeline_claim_at = :now, updated_at = :now" +
          (document ? ", pipeline_claim_document = :document" : " REMOVE pipeline_claim_document"),
        // A run of another staged document (a newer upload) takes over; the same one again is a duplicate.
        ConditionExpression: replaceOlder && document ? `${free} OR pipeline_claim_document <> :document` : free,
        ExpressionAttributeValues: marshall({
          ":name": executionName,
          ":now": new Date(now).toISOString(),
          ":staleBefore": staleBefore,
          ...(document && { ":document": document }),
        }),
        ReturnValues: "ALL_OLD",
      })
    );

    const previous = result.Attributes ? unmarshall(result.Attributes) : {};
    return { acquired: true, previousExecutionArn: previous.pipeline_execution_arn, row: previous };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return { acquired: false };
    throw error;
  }
}

/** The S3 version of a staged document this run processes; the event's, or the current one. */
async function stagedVersionOf(bucket, documentKey, eventVersionId) {
  if (eventVersionId) return eventVersionId;
  try {
    return (await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: documentKey }))).VersionId ?? null;
  } catch (error) {
    console.warn(`Could not read the version of ${documentKey}:`, error.message);
    return null;
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
        UpdateExpression: "REMOVE pipeline_claim_at, pipeline_claim_execution, pipeline_claim_document",
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
    const existing = [];
    let lastKey;
    do {
      const page = await dynamoClient.send(
        new QueryCommand({
          TableName: reviewTable,
          KeyConditionExpression: "nofo_name = :name",
          ExpressionAttributeValues: marshall({ ":name": nofoName }),
          ExclusiveStartKey: lastKey,
        })
      );
      existing.push(...(page.Items || []).map((i) => unmarshall(i)));
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);
    const openReviews = existing
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
        const nofoName = grantOfKey(documentKey);

        if (!isPendingKey(documentKey)) {
          const row = await readMetadataRow(nofoName);
          if (await consumePublishedCopy(nofoName, row, record.s3.object.eTag)) {
            console.log(`${documentKey} is a staged version publish just swapped in; not processing it again.`);
            continue;
          }
          // Rename and Reprocess land here with the published document. The run works from a staged
          // copy, whose upload starts it, so a failing version never overwrites the published files.
          if (await liveStatusOf(nofoName, row, { unknownIsLive: true })) {
            await stagePublishedDocument(s3Bucket, documentKey, nofoName);
            continue;
          }
        }

        const staged = isPendingKey(documentKey);
        const documentVersionId = staged ? await stagedVersionOf(s3Bucket, documentKey, record.s3.object.versionId) : null;
        // An older upload's event can arrive after a newer one's; running it would stop the newest run.
        if (await isStaleRun(documentKey, documentVersionId)) {
          console.log(`${documentKey} was replaced by a newer upload; not processing this version.`);
          continue;
        }
        const executionInput = {
          s3Bucket,
          documentKey,
          documentVersionId,
          nofoName,
          retryCount: 0,
          validationFeedback: null,
        };

        const nofoDigest = createHash("sha256").update(nofoName).digest("hex").substring(0, 16);
        const executionName = `${Date.now()}-${nofoDigest}`;

        const claim = await claimPipeline(nofoName, executionName, {
          document: documentVersionId ? `${documentKey}#${documentVersionId}` : null,
          replaceOlder: staged,
        });
        if (!claim.acquired) {
          console.log(`Pipeline already running for ${nofoName}; skipping duplicate dispatch.`);
          continue;
        }

        // Before the older run's staged files are cleared, so it stops writing them.
        await stopPreviousExecution(claim.previousExecutionArn);
        await supersedeOpenReviews(nofoName);
        if (staged) await clearEarlierStagedFiles(nofoName, documentKey);
        const liveStatus = await liveStatusOf(nofoName, claim.row);
        if (liveStatus) console.log(`${nofoName} stays ${liveStatus} while its new version is processed.`);
        else await markProcessingStatus(nofoName);
        await updateProcessingStatus(nofoName, "uploading");

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

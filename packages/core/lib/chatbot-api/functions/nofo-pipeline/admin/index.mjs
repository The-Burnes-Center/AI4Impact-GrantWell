import {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
  UpdateItemCommand,
  ScanCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { safeJsonParse, httpResponse } from "../shared/json.mjs";
import { readRawText } from "../shared/s3.mjs";
import { documentSampleOf, generateQuestions, hasQuestions } from "../shared/questions.mjs";
import { liveStatusOf } from "../shared/live.mjs";
import {
  requireAdmin,
  assertCanEditNofoOr403,
  canEditAnyNofo,
  resolveCallerScope,
  grantDeadline,
  compareByDeadline,
  readGrantMetadata,
  OPEN_REVIEW_STATUSES,
  artifactsBucket,
  deleteArtifacts,
  deletePending,
  isPendingKey,
  pendingDir,
  stagesNewVersion,
} from "grantwell-shared";
import { rollBack } from "../shared/swap.mjs";

const dynamoClient = new DynamoDBClient();
const lambdaClient = new LambdaClient();
const s3Client = new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" });

const scopeDeps = { client: dynamoClient, GetItemCommand, marshall, unmarshall };

// A review-queue mutation (approve/reject/needs-reupload/reupload) acts on the NOFO's own
// metadata row, written at presign time — so its scope is enforceable even while quarantined.
// State admins may only act on their own state's NOFOs. Unknown scope fails closed.
function guardNofoScope(event, nofoName) {
  return assertCanEditNofoOr403(event, scopeDeps, process.env.NOFO_METADATA_TABLE_NAME, nofoName);
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.path;

  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;

  try {
    if (method === "GET" && path === "/admin/processing-reviews") {
      return await listReviews(event);
    }
    if (method === "GET" && path === "/admin/processing-metrics") {
      return await getMetrics();
    }
    if (method === "POST" && path === "/admin/processing-reviews/close-expired") {
      return await closeExpiredReviews(event);
    }
    if (method === "GET" && path.startsWith("/admin/processing-reviews/")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(
        suffix.endsWith("/approve") ? suffix.slice(0, -"/approve".length)
        : suffix.endsWith("/reject") ? suffix.slice(0, -"/reject".length)
        : suffix
      );
      // Detail exposes the extracted summary + document text preview; gate it so a state
      // admin can't deep-link into another state's or a federal NOFO's review.
      const denied = await guardNofoScope(event, nofoName);
      if (denied) return denied;
      return await getReviewDetail(nofoName);
    }
    if (method === "POST" && path.endsWith("/approve")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(suffix.slice(0, -"/approve".length));
      const denied = await guardNofoScope(event, nofoName);
      if (denied) return denied;
      return await approveReview(nofoName, event);
    }
    if (method === "POST" && path.endsWith("/reject")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(suffix.slice(0, -"/reject".length));
      const denied = await guardNofoScope(event, nofoName);
      if (denied) return denied;
      return await rejectReview(nofoName, event);
    }
    if (method === "POST" && path.endsWith("/needs-reupload")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(suffix.slice(0, -"/needs-reupload".length));
      const denied = await guardNofoScope(event, nofoName);
      if (denied) return denied;
      return await markNeedsReupload(nofoName, event);
    }
    if (method === "POST" && path === "/admin/reupload-nofo") {
      const { nofoName } = JSON.parse(event.body || "{}");
      if (nofoName) {
        const denied = await guardNofoScope(event, nofoName);
        if (denied) return denied;
      }
      return await getReuploadUrl(event);
    }

    return httpResponse(404, { error: "Route not found" });
  } catch (error) {
    console.error("Admin API error:", error);
    return httpResponse(500, { error: error.message });
  }
};

async function queryReviewsByStatus(status) {
  const items = [];
  let lastKey;
  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: process.env.REVIEW_TABLE_NAME,
        IndexName: "StatusIndex",
        KeyConditionExpression: "#s = :status",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: marshall({ ":status": status }),
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...(result.Items || []).map((item) => unmarshall(item)));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function scanAllReviews() {
  const items = [];
  let lastKey;
  do {
    const result = await dynamoClient.send(
      new ScanCommand({ TableName: process.env.REVIEW_TABLE_NAME, ExclusiveStartKey: lastKey })
    );
    items.push(...(result.Items || []).map((item) => unmarshall(item)));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function grantMetadata(reviews) {
  return readGrantMetadata(dynamoClient, process.env.NOFO_METADATA_TABLE_NAME, reviews.map((r) => r.nofo_name));
}

// A state admin only sees review rows for their own state's NOFOs — federal/other-state
// rows are hidden entirely (matching retrieve-nofos), so no out-of-scope actions surface.
function inCallerScope(callerScope, meta) {
  if (callerScope.role !== "stateAdmin" || canEditAnyNofo(callerScope)) return true;
  return meta?.scope === "state" && meta?.state === callerScope.state;
}

function withDeadline(review, meta, now) {
  const { deadline, daysLeft, urgency } = grantDeadline(meta, now);
  return { ...review, deadline, daysLeft, urgency, grantStatus: meta?.status ?? null };
}

async function listReviews(event) {
  const params = event.queryStringParameters || {};
  const statusFilter = params.status || "pending_review";
  const callerScope = resolveCallerScope(event);
  const now = new Date();

  const listed = statusFilter === "all" ? await scanAllReviews() : await queryReviewsByStatus(statusFilter);
  // The "Close all expired" count covers every open status, not just the one being viewed.
  const open = statusFilter === "all" ? listed.filter((r) => OPEN_REVIEW_STATUSES.includes(r.status)) : [...listed];
  if (statusFilter !== "all") {
    for (const status of OPEN_REVIEW_STATUSES) {
      if (status !== statusFilter) open.push(...(await queryReviewsByStatus(status)));
    }
  }

  const metaByName = await grantMetadata([...listed, ...open]);
  const scoped = (items) =>
    items
      .filter((r) => inCallerScope(callerScope, metaByName.get(r.nofo_name)))
      .map((r) => withDeadline(r, metaByName.get(r.nofo_name), now));

  const items = scoped(listed).sort(compareByDeadline);
  const expiredOpenCount = scoped(open).filter((r) => r.urgency === "expired").length;

  const reviews = items.map((parsed) => {
    // Don't send full summary/questions/validation in list view
    const guidance = safeJsonParse(parsed.adminGuidance);
    return {
      nofo_name: parsed.nofo_name,
      review_id: parsed.review_id,
      status: parsed.status,
      created_at: parsed.created_at,
      retryCount: parsed.retryCount,
      source: parsed.source,
      errorMessage: parsed.errorMessage,
      failure_count: parsed.failure_count,
      last_failed_at: parsed.last_failed_at,
      guidanceTitle: guidance?.title || null,
      guidanceSeverity: guidance?.severity || null,
      missingSections: guidance?.missingCategories || [],
      unverifiedCount: Array.isArray(guidance?.failingItems) ? guidance.failingItems.length : 0,
      deadline: parsed.deadline,
      daysLeft: parsed.daysLeft,
      deadlineUrgency: parsed.urgency,
      grantStatus: parsed.grantStatus,
    };
  });

  return httpResponse(200, { reviews, expiredOpenCount });
}

function approverOf(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  return claims.email || claims["cognito:username"] || claims.sub || null;
}

/**
 * Supersedes every open review whose grant's deadline has passed. Only review rows change; the
 * grant, its files and its metadata are left alone.
 */
async function closeExpiredReviews(event) {
  const callerScope = resolveCallerScope(event);
  if (callerScope.role !== "developer" && callerScope.role !== "regularAdmin" && callerScope.role !== "stateAdmin") {
    return httpResponse(403, { message: "Not authorized to modify NOFOs." });
  }
  const now = new Date();
  const open = [];
  for (const status of OPEN_REVIEW_STATUSES) open.push(...(await queryReviewsByStatus(status)));
  const metaByName = await grantMetadata(open);
  const expired = open.filter((r) => {
    const meta = metaByName.get(r.nofo_name);
    return inCallerScope(callerScope, meta) && grantDeadline(meta, now).urgency === "expired";
  });

  const closedBy = approverOf(event);
  const closedAt = now.toISOString();
  let closed = 0;
  for (const review of expired) {
    try {
      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: process.env.REVIEW_TABLE_NAME,
          Key: marshall({ nofo_name: review.nofo_name, review_id: review.review_id }),
          UpdateExpression: "SET #s = :closed, reviewed_at = :now, reviewed_by = :by, admin_notes = :notes",
          // Skips a row someone else acted on since the read.
          ConditionExpression: "#s = :was",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: marshall({
            ":closed": "superseded",
            ":was": review.status,
            ":now": closedAt,
            ":by": closedBy,
            ":notes": "Closed: grant expired",
          }),
        })
      );
      closed++;
    } catch (error) {
      if (error?.name !== "ConditionalCheckFailedException") throw error;
    }
  }

  console.log(`Closed ${closed} review(s) for expired grants`, { by: closedBy });
  return httpResponse(200, { closed });
}

async function getLatestReview(tableName, nofoName) {
  const items = [];
  let lastKey;
  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "nofo_name = :name",
        ExpressionAttributeValues: marshall({ ":name": nofoName }),
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...(result.Items || []).map((i) => unmarshall(i)));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (!items.length) return null;

  items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return items[0];
}

async function getReviewDetail(nofoName) {
  const tableName = process.env.REVIEW_TABLE_NAME;

  const item = await getLatestReview(tableName, nofoName);

  if (!item) {
    return httpResponse(404, { error: "Review not found" });
  }

  const detail = {
    ...item,
    extractedSummary: safeJsonParse(item.extractedSummary),
    extractedQuestions: safeJsonParse(item.extractedQuestions),
    validationResult: safeJsonParse(item.validationResult),
    corrections: safeJsonParse(item.corrections),
    adminGuidance: safeJsonParse(item.adminGuidance),
  };

  return httpResponse(200, { review: detail });
}

const CLOSED_REVIEW = "This review is closed. A newer run of this grant may be in the review queue.";

async function readReview(tableName, nofoName, reviewId) {
  if (!reviewId) return getLatestReview(tableName, nofoName);
  const result = await dynamoClient.send(
    new GetItemCommand({ TableName: tableName, Key: marshall({ nofo_name: nofoName, review_id: reviewId }) })
  );
  return result.Item ? unmarshall(result.Item) : null;
}

async function approveReview(nofoName, event) {
  const body = JSON.parse(event.body || "{}");
  const { corrections, notes, reviewId } = body;
  const tableName = process.env.REVIEW_TABLE_NAME;
  const publishFunctionName = process.env.PUBLISH_FUNCTION_NAME;

  const review = await readReview(tableName, nofoName, reviewId);

  if (!review) {
    return httpResponse(404, { error: "Review not found" });
  }
  // Publishing swaps in whatever is staged now, which a newer run may have replaced.
  if (isPendingKey(review.s3DocumentKey) && !OPEN_REVIEW_STATUSES.includes(review.status)) {
    return httpResponse(409, { error: CLOSED_REVIEW });
  }

  const actualReviewId = review.review_id;
  const extractedSummary = safeJsonParse(review.extractedSummary);
  const extractedQuestions = safeJsonParse(review.extractedQuestions);

  if (!extractedSummary) {
    return httpResponse(400, {
      error: `Review for "${nofoName}" has no extracted requirements (duplicate or failed extraction) — approving it would publish an empty grant. Reprocess it instead.`,
    });
  }

  let questionsData = extractedQuestions;
  if (!hasQuestions(questionsData)) {
    questionsData = await regenerateQuestions(
      corrections ? { ...extractedSummary, ...corrections } : extractedSummary,
      review.s3RawTextKey
    );
    if (!hasQuestions(questionsData)) {
      return httpResponse(500, {
        error: "Could not generate application questions for this grant. Try Reprocess.",
      });
    }
  }

  // Invoke the publish Lambda with the (corrected) data
  const publishPayload = {
    nofoName,
    s3Bucket: process.env.BUCKET,
    documentKey: review.s3DocumentKey,
    documentVersionId: review.s3DocumentVersionId || null,
    mergedSummary: extractedSummary,
    questionsData,
    applicationDeadline: extractedSummary?.application_deadline || null,
    agency: extractedSummary?.Agency || null,
    category: extractedSummary?.Category || null,
    existingExpirationDate: null,
    corrections: corrections || null,
    reviewApproval: { reviewId: actualReviewId, by: approverOf(event), at: new Date().toISOString() },
    ...(review.previous_status === "archived" && { publishStatus: "archived" }),
  };

  // Synchronous invoke so we know if publishing failed before telling the admin it succeeded
  const invokeResult = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: publishFunctionName,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(publishPayload),
    })
  );

  if (invokeResult.FunctionError) {
    const errorPayload = JSON.parse(new TextDecoder().decode(invokeResult.Payload));
    throw new Error(`Publish failed: ${errorPayload.errorMessage || invokeResult.FunctionError}`);
  }

  // Update review status and set TTL (30 days for approved)
  const ttlApproved = Math.floor(Date.now() / 1000) + 30 * 86400;
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName, review_id: actualReviewId }),
      UpdateExpression:
        "SET #s = :status, reviewed_at = :now, admin_notes = :notes, corrections = :corr, #ttl = :ttl",
      ExpressionAttributeNames: { "#s": "status", "#ttl": "ttl" },
      ExpressionAttributeValues: marshall(
        {
          ":status": "approved",
          ":now": new Date().toISOString(),
          ":notes": notes || null,
          ":corr": corrections ? JSON.stringify(corrections) : null,
          ":ttl": ttlApproved,
        },
        { removeUndefinedValues: true }
      ),
    })
  );

  return httpResponse(200, { message: `Review approved for "${nofoName}"` });
}

async function regenerateQuestions(summary, rawTextKey) {
  let documentSample = "";
  if (rawTextKey) {
    try {
      documentSample = documentSampleOf(await readRawText(process.env.BUCKET, rawTextKey));
    } catch (error) {
      console.warn(`Could not read ${rawTextKey}, generating questions from the summary only:`, error.message);
    }
  }
  return generateQuestions(summary, documentSample);
}

async function rejectReview(nofoName, event) {
  const body = JSON.parse(event.body || "{}");
  const { reason, reviewId } = body;
  const tableName = process.env.REVIEW_TABLE_NAME;
  const metadataTableName = process.env.NOFO_METADATA_TABLE_NAME;
  const bucket = process.env.BUCKET;

  let actualReviewId = reviewId;
  if (!actualReviewId) {
    const review = await getLatestReview(tableName, nofoName);
    actualReviewId = review?.review_id;
  }

  if (!actualReviewId) {
    return httpResponse(404, { error: "Review not found" });
  }

  const keepLive = await hasLiveVersion(metadataTableName, nofoName);
  if (keepLive) {
    // A closed review's staged files may belong to a newer run by now.
    const review = await readReview(tableName, nofoName, actualReviewId);
    if (review && !OPEN_REVIEW_STATUSES.includes(review.status)) return httpResponse(409, { error: CLOSED_REVIEW });
    // Before the review is marked rejected, so a failure leaves it open to retry.
    await discardNewVersion(nofoName);
  }

  const ttlRejected = Math.floor(Date.now() / 1000) + 90 * 86400;
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName, review_id: actualReviewId }),
      UpdateExpression:
        "SET #s = :status, reviewed_at = :now, admin_notes = :notes, #ttl = :ttl",
      ExpressionAttributeNames: { "#s": "status", "#ttl": "ttl" },
      ExpressionAttributeValues: marshall(
        {
          ":status": "rejected",
          ":now": new Date().toISOString(),
          ":notes": reason || null,
          ":ttl": ttlRejected,
        },
        { removeUndefinedValues: true }
      ),
    })
  );

  if (keepLive) {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: metadataTableName,
        Key: marshall({ nofo_name: nofoName }),
        UpdateExpression: "REMOVE processing_status SET updated_at = :now",
        ExpressionAttributeValues: marshall({ ":now": new Date().toISOString() }),
      })
    );
    console.log(`Rejected the new version of live grant ${nofoName}; its published version stays`);
    return httpResponse(200, { message: `Review rejected for "${nofoName}"`, keptLive: true });
  }

  // Delete all S3 objects under the NOFO folder
  if (bucket) {
    try {
      const prefix = nofoName + "/";
      const listResult = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
        })
      );

      const objects = listResult.Contents || [];
      if (objects.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key })),
              Quiet: true,
            },
          })
        );
        console.log(`Deleted ${objects.length} S3 objects for rejected NOFO ${nofoName}`);
      }
    } catch (error) {
      console.error(`Failed to delete S3 objects for ${nofoName}:`, error);
      // Continue - we still want to return success; the review is marked rejected
    }
  }

  try {
    await deleteArtifacts(s3Client, nofoName);
    await deletePending(s3Client, nofoName);
  } catch (error) {
    console.error(`Failed to delete derived files for ${nofoName}:`, error);
  }

  // Delete metadata table entry if it exists
  if (metadataTableName) {
    try {
      await dynamoClient.send(
        new DeleteItemCommand({
          TableName: metadataTableName,
          Key: marshall({ nofo_name: nofoName }),
        })
      );
      console.log(`Deleted metadata entry for rejected NOFO ${nofoName}`);
    } catch (error) {
      console.warn(`Could not delete metadata for ${nofoName}:`, error.message);
    }
  }

  return httpResponse(200, { message: `Review rejected for "${nofoName}"` });
}

/**
 * Drops the staged new version. A publish that stopped partway is undone first, so the published
 * version is exactly what it was. Errors propagate: the admin retries rather than half-rejecting.
 */
async function discardNewVersion(nofoName) {
  await rollBack(nofoName);
  const removed = await deletePending(s3Client, nofoName);
  if (removed) console.log(`Discarded ${removed} staged file(s) of ${nofoName}`);
}

/**
 * True when the grant has a published version that stays live, so rejecting its new version keeps
 * the grant. A metadata read error throws rather than risk deleting a live grant.
 */
async function hasLiveVersion(tableName, nofoName) {
  if (!tableName) return false;
  const row = await readMetadataRow(nofoName);
  return Boolean(await liveStatusOf(nofoName, row, { unknownIsLive: true }));
}

async function readMetadataRow(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName) return null;
  const result = await dynamoClient.send(
    new GetItemCommand({ TableName: tableName, Key: marshall({ nofo_name: nofoName }) })
  );
  return result.Item ? unmarshall(result.Item) : null;
}

/**
 * Generate a presigned S3 PUT URL so the admin can upload a replacement NOFO
 * document directly from the review panel without leaving the page.
 * The upload lands in the NOFO's folder, or its staging folder when it may be live, and either
 * S3 trigger starts the pipeline.
 */
async function getReuploadUrl(event) {
  const body = JSON.parse(event.body || "{}");
  const { nofoName, fileType } = body;

  if (!nofoName || !fileType) {
    return httpResponse(400, { error: "nofoName and fileType are required" });
  }

  const bucket = process.env.BUCKET;
  if (!bucket) {
    return httpResponse(500, { error: "BUCKET env var not set" });
  }

  const extension = fileType === "application/pdf" ? "PDF" : "TXT";
  const file = `NOFO-File-${extension}`;
  // A grant that may be live gets its replacement staged; the staged upload starts the pipeline.
  const row = await readMetadataRow(nofoName);
  const staged = stagesNewVersion(row?.status);
  const objectKey = staged ? `${pendingDir(nofoName)}${file}` : `${nofoName}/${file}`;

  const command = new PutObjectCommand({
    Bucket: staged ? artifactsBucket() : bucket,
    Key: objectKey,
    ContentType: fileType,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  console.log(`Generated re-upload URL for ${nofoName}: ${objectKey}`);
  return httpResponse(200, { signedUrl, objectKey });
}

async function getMetrics() {
  const tableName = process.env.REVIEW_TABLE_NAME;
  const metadataTable = process.env.NOFO_METADATA_TABLE_NAME;

  // Count items by status in the review table
  const statuses = ["pending_review", "approved", "rejected", "failed", "needs_reupload", "superseded"];
  const counts = {};

  for (const status of statuses) {
    try {
      let count = 0;
      let lastKey;
      do {
        const result = await dynamoClient.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: "StatusIndex",
            KeyConditionExpression: "#s = :status",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: marshall({ ":status": status }),
            Select: "COUNT",
            ExclusiveStartKey: lastKey,
          })
        );
        count += result.Count || 0;
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
      counts[status] = count;
    } catch (error) {
      // A count badge must not 500 the dashboard. Degrade a failed bucket to 0 and keep going.
      console.warn(`Could not count review status "${status}":`, error.message);
      counts[status] = 0;
    }
  }

  // Count total NOFOs processed (from metadata table)
  let totalProcessed = 0;
  try {
    let lastKey;
    do {
      const scanResult = await dynamoClient.send(
        new ScanCommand({
          TableName: metadataTable,
          Select: "COUNT",
          ExclusiveStartKey: lastKey,
        })
      );
      totalProcessed += scanResult.Count || 0;
      lastKey = scanResult.LastEvaluatedKey;
    } while (lastKey);
  } catch (error) {
    console.warn("Could not count processed NOFOs:", error.message);
  }

  const totalReviewed = counts.approved + counts.rejected;
  const totalAttempted = totalProcessed + counts.pending_review + counts.failed;
  const successRate =
    totalAttempted > 0
      ? Math.round((totalProcessed / totalAttempted) * 100)
      : 0;

  return httpResponse(200, {
    metrics: {
      totalProcessed,
      successRate,
      pendingCount: counts.pending_review,
      failedCount: counts.failed,
      approvedCount: counts.approved,
      rejectedCount: counts.rejected,
      needsReuploadCount: counts.needs_reupload,
      supersededCount: counts.superseded,
    },
  });
}

async function markNeedsReupload(nofoName, event) {
  const body = JSON.parse(event.body || "{}");
  const { notes, reviewId } = body;
  const tableName = process.env.REVIEW_TABLE_NAME;

  let actualReviewId = reviewId;
  if (!actualReviewId) {
    const review = await getLatestReview(tableName, nofoName);
    actualReviewId = review?.review_id;
  }

  if (!actualReviewId) {
    return httpResponse(404, { error: "Review not found" });
  }

  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName, review_id: actualReviewId }),
      UpdateExpression: "SET #s = :status, reviewed_at = :now, admin_notes = :notes",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: marshall(
        {
          ":status": "needs_reupload",
          ":now": new Date().toISOString(),
          ":notes": notes || null,
        },
        { removeUndefinedValues: true }
      ),
    })
  );

  return httpResponse(200, { message: `Review marked as needs re-upload for "${nofoName}"` });
}


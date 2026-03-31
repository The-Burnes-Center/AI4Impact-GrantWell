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

const dynamoClient = new DynamoDBClient();
const lambdaClient = new LambdaClient();
const s3Client = new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" });

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.path;

  try {
    if (method === "GET" && path === "/admin/processing-reviews") {
      return await listReviews(event);
    }
    if (method === "GET" && path === "/admin/processing-metrics") {
      return await getMetrics();
    }
    if (method === "GET" && path.startsWith("/admin/processing-reviews/")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(
        suffix.endsWith("/approve") ? suffix.slice(0, -"/approve".length)
        : suffix.endsWith("/reject") ? suffix.slice(0, -"/reject".length)
        : suffix
      );
      return await getReviewDetail(nofoName);
    }
    if (method === "POST" && path.endsWith("/approve")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(suffix.slice(0, -"/approve".length));
      return await approveReview(nofoName, event);
    }
    if (method === "POST" && path.endsWith("/reject")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(suffix.slice(0, -"/reject".length));
      return await rejectReview(nofoName, event);
    }
    if (method === "POST" && path.endsWith("/needs-reupload")) {
      const suffix = path.slice("/admin/processing-reviews/".length);
      const nofoName = decodeURIComponent(suffix.slice(0, -"/needs-reupload".length));
      return await markNeedsReupload(nofoName, event);
    }
    if (method === "POST" && path === "/admin/reupload-nofo") {
      return await getReuploadUrl(event);
    }

    return httpResponse(404, { error: "Route not found" });
  } catch (error) {
    console.error("Admin API error:", error);
    return httpResponse(500, { error: error.message });
  }
};

async function listReviews(event) {
  const params = event.queryStringParameters || {};
  const statusFilter = params.status || "pending_review";
  const tableName = process.env.REVIEW_TABLE_NAME;

  let items;
  if (statusFilter === "all") {
    // Paginated scan for "all" statuses
    items = [];
    let lastKey = undefined;
    do {
      const result = await dynamoClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastKey,
        })
      );
      items.push(...(result.Items || []).map((item) => unmarshall(item)));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  } else {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "StatusIndex",
        KeyConditionExpression: "#s = :status",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: marshall({ ":status": statusFilter }),
        ScanIndexForward: false,
      })
    );
    items = (result.Items || []).map((item) => unmarshall(item));
  }

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
      guidanceTitle: guidance?.title || null,
      guidanceSeverity: guidance?.severity || null,
      missingSections: guidance?.missingCategories || [],
    };
  });

  return httpResponse(200, { reviews });
}

async function getLatestReview(tableName, nofoName) {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "nofo_name = :name",
      ExpressionAttributeValues: marshall({ ":name": nofoName }),
    })
  );

  if (!result.Items?.length) return null;

  const items = result.Items.map((i) => unmarshall(i));
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

async function approveReview(nofoName, event) {
  const body = JSON.parse(event.body || "{}");
  const { corrections, notes, reviewId } = body;
  const tableName = process.env.REVIEW_TABLE_NAME;
  const publishFunctionName = process.env.PUBLISH_FUNCTION_NAME;

  let review;
  if (reviewId) {
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName, review_id: reviewId }),
      })
    );
    review = result.Item ? unmarshall(result.Item) : null;
  } else {
    review = await getLatestReview(tableName, nofoName);
  }

  if (!review) {
    return httpResponse(404, { error: "Review not found" });
  }

  const actualReviewId = review.review_id;
  const extractedSummary = safeJsonParse(review.extractedSummary);
  const extractedQuestions = safeJsonParse(review.extractedQuestions);

  // Invoke the publish Lambda with the (corrected) data
  const publishPayload = {
    nofoName,
    s3Bucket: process.env.BUCKET,
    documentKey: review.s3DocumentKey,
    mergedSummary: extractedSummary,
    questionsData: extractedQuestions,
    applicationDeadline: extractedSummary?.application_deadline || null,
    agency: extractedSummary?.Agency || null,
    category: extractedSummary?.Category || null,
    existingExpirationDate: null,
    corrections: corrections || null,
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
 * Generate a presigned S3 PUT URL so the admin can upload a replacement NOFO
 * document directly from the review panel without leaving the page.
 * The upload key matches the existing NOFO folder so the pipeline picks it up
 * automatically via the S3 trigger.
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
  const objectKey = `${nofoName}/NOFO-File-${extension}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
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
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "StatusIndex",
        KeyConditionExpression: "#s = :status",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: marshall({ ":status": status }),
        Select: "COUNT",
      })
    );
    counts[status] = result.Count || 0;
  }

  // Count total NOFOs processed (from metadata table)
  let totalProcessed = 0;
  try {
    const scanResult = await dynamoClient.send(
      new ScanCommand({
        TableName: metadataTable,
        Select: "COUNT",
      })
    );
    totalProcessed = scanResult.Count || 0;
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


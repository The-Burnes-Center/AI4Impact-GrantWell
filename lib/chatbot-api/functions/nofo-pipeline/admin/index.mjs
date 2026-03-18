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
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { safeJsonParse, httpResponse } from "../shared/json.mjs";

const dynamoClient = new DynamoDBClient();
const lambdaClient = new LambdaClient();
const s3Client = new S3Client();

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
      const nofoName = decodeURIComponent(
        path.replace("/admin/processing-reviews/", "").replace("/approve", "").replace("/reject", "")
      );
      return await getReviewDetail(nofoName);
    }
    if (method === "POST" && path.endsWith("/approve")) {
      const nofoName = decodeURIComponent(
        path.replace("/admin/processing-reviews/", "").replace("/approve", "")
      );
      return await approveReview(nofoName, event);
    }
    if (method === "POST" && path.endsWith("/reject")) {
      const nofoName = decodeURIComponent(
        path.replace("/admin/processing-reviews/", "").replace("/reject", "")
      );
      return await rejectReview(nofoName, event);
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

  const items = (result.Items || []).map((item) => {
    const parsed = unmarshall(item);
    // Don't send full summary/questions/validation in list view
    return {
      nofo_name: parsed.nofo_name,
      review_id: parsed.review_id,
      status: parsed.status,
      created_at: parsed.created_at,
      qualityScore: parsed.qualityScore,
      retryCount: parsed.retryCount,
      source: parsed.source,
      errorMessage: parsed.errorMessage,
      issueCount: countIssues(parsed.validationResult),
    };
  });

  return httpResponse(200, { reviews: items });
}

async function getReviewDetail(nofoName) {
  const tableName = process.env.REVIEW_TABLE_NAME;

  // Query all reviews for this NOFO and get the latest
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "nofo_name = :name",
      ExpressionAttributeValues: marshall({ ":name": nofoName }),
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  if (!result.Items?.length) {
    return httpResponse(404, { error: "Review not found" });
  }

  const item = unmarshall(result.Items[0]);

  const detail = {
    ...item,
    extractedSummary: safeJsonParse(item.extractedSummary),
    extractedQuestions: safeJsonParse(item.extractedQuestions),
    validationResult: safeJsonParse(item.validationResult),
    corrections: safeJsonParse(item.corrections),
  };

  return httpResponse(200, { review: detail });
}

async function approveReview(nofoName, event) {
  const body = JSON.parse(event.body || "{}");
  const { corrections, notes, reviewId } = body;
  const tableName = process.env.REVIEW_TABLE_NAME;
  const publishFunctionName = process.env.PUBLISH_FUNCTION_NAME;

  // Get the review record
  const reviewResult = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "nofo_name = :name",
      ExpressionAttributeValues: marshall({ ":name": nofoName }),
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  if (!reviewResult.Items?.length) {
    return httpResponse(404, { error: "Review not found" });
  }

  const review = unmarshall(reviewResult.Items[0]);
  const actualReviewId = reviewId || review.review_id;
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
    validationResult: safeJsonParse(review.validationResult),
    corrections: corrections || null,
  };

  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: publishFunctionName,
      InvocationType: "Event",
      Payload: JSON.stringify(publishPayload),
    })
  );

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

  // Get the latest review if no reviewId provided
  let actualReviewId = reviewId;
  if (!actualReviewId) {
    const reviewResult = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "nofo_name = :name",
        ExpressionAttributeValues: marshall({ ":name": nofoName }),
        ScanIndexForward: false,
        Limit: 1,
      })
    );
    if (reviewResult.Items?.length) {
      actualReviewId = unmarshall(reviewResult.Items[0]).review_id;
    }
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

async function getMetrics() {
  const tableName = process.env.REVIEW_TABLE_NAME;
  const metadataTable = process.env.NOFO_METADATA_TABLE_NAME;

  // Count items by status in the review table
  const statuses = ["pending_review", "approved", "rejected", "failed"];
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

  // Calculate avg quality score from recent reviews
  let avgQualityScore = 0;
  try {
    const recentResult = await dynamoClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "qualityScore",
        Limit: 100,
      })
    );
    const scores = (recentResult.Items || [])
      .map((item) => unmarshall(item).qualityScore)
      .filter((s) => typeof s === "number" && s > 0);
    if (scores.length > 0) {
      avgQualityScore = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length
      );
    }
  } catch (error) {
    console.warn("Could not calculate avg quality score:", error.message);
  }

  return httpResponse(200, {
    metrics: {
      totalProcessed,
      successRate,
      avgQualityScore,
      pendingCount: counts.pending_review,
      failedCount: counts.failed,
      approvedCount: counts.approved,
      rejectedCount: counts.rejected,
    },
  });
}

function countIssues(validationResultStr) {
  const result = safeJsonParse(validationResultStr);
  if (!result?.issues) return { critical: 0, warning: 0, info: 0 };
  return {
    critical: result.issues.filter((i) => i.severity === "critical").length,
    warning: result.issues.filter((i) => i.severity === "warning").length,
    info: result.issues.filter((i) => i.severity === "info").length,
  };
}


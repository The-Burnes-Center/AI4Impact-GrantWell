/**
 * Draft Generation Job Status Lambda Function
 * 
 * This function returns the status of an async draft generation job.
 * Used by the frontend to poll for draft generation results.
 */

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const EXPORTS_BUCKET = process.env.EXPORTS_BUCKET;
const DOWNLOAD_URL_TTL_SECONDS = 300;

async function presignExport(objectKey) {
  if (!EXPORTS_BUCKET) {
    console.error('EXPORTS_BUCKET is not configured; cannot hand back a download URL');
    return undefined;
  }
  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: EXPORTS_BUCKET, Key: objectKey }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
    );
  } catch (error) {
    console.error(`Could not presign ${objectKey}: ${error.message}`);
    return undefined;
  }
}

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-amz-security-token']);

function redactEvent(event) {
  const e = { ...event };
  if (e.headers) {
    e.headers = Object.fromEntries(
      Object.entries(e.headers).map(([k, v]) =>
        SENSITIVE_HEADERS.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v]
      )
    );
  }
  if (typeof e.body === 'string') e.body = `[${e.body.length} chars omitted]`;
  else if (e.body) e.body = '[omitted]';
  const claims = e.requestContext?.authorizer?.jwt?.claims;
  if (claims) {
    e.requestContext = {
      ...e.requestContext,
      authorizer: { jwt: { claims: { ...claims, email: '[REDACTED]' } } },
    };
  }
  return e;
}

/**
 * Handler for the draft generation job status API
 */
export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET',
    'Content-Type': 'application/json'
  };
  
  try {
    console.log('Event received:', JSON.stringify(redactEvent(event)));
    
    // Handle OPTIONS requests (CORS preflight)
    if (event.requestContext?.http?.method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({})
      };
    }
    
    // Get job ID from path parameters
    const jobId = event.pathParameters?.jobId;
    
    if (!jobId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Job ID is required' })
      };
    }
    
    console.log(`[Job Status] Checking status for job: ${jobId}`);
    
    // Get job status from DynamoDB
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (!tableName) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Draft generation jobs table not configured' })
      };
    }
    
    const command = new GetItemCommand({
      TableName: tableName,
      Key: {
        jobId: { S: jobId }
      }
    });
    
    const response = await dynamoClient.send(command);

    if (!response.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Job not found' })
      };
    }

    const job = unmarshall(response.Item);

    // Enforce ownership: jobIds are UUIDs, but they appear in API responses
    // and logs, so binding to the authenticated caller protects against
    // enumeration or accidental leakage.
    const callerSub = event.requestContext?.authorizer?.jwt?.claims?.sub
      || event.requestContext?.authorizer?.claims?.sub;
    if (!callerSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized: missing JWT claims' })
      };
    }
    if (job.userId && job.userId !== callerSub) {
      // Return 404 (not 403) to avoid disclosing job existence to non-owners.
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Job not found' })
      };
    }

    console.log(`[Job Status] Job ${jobId} status: ${job.status}`);

    // Minted on read: a URL stored at job creation would burn its lifetime while Chromium ran.
    let downloadUrl;
    if (job.jobType === 'export' && job.status === 'completed' && job.objectKey) {
      downloadUrl = await presignExport(job.objectKey);
    }

    // Return job status
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobId: job.jobId,
        status: job.status,
        sectionNames: job.sectionNames,
        totalSections: job.totalSections,
        completedSectionCount: job.completedSectionCount,
        sections: job.sections || {},
        failedSections: job.failedSections,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error,
        jobType: job.jobType,
        downloadUrl
      })
    };
  } catch (error) {
    console.error('Error checking job status:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to check job status',
        message: error.message
      })
    };
  }
};

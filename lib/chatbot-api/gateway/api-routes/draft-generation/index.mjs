/**
 * REST API handler for draft generation
 *
 * This module processes POST requests to the /draft-generation endpoint
 * and starts a Step Functions execution to generate draft sections in parallel.
 * Returns a jobId immediately for polling.
 */

import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";

const sfnClient = new SFNClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

/**
 * Handler for the draft generation API
 *
 * @param {object} event - API Gateway event object
 * @returns {object} - API Gateway response
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));

    // CORS headers for preflight requests
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Content-Type': 'application/json'
    };

    // Handle OPTIONS requests (CORS preflight)
    if (event.requestContext?.http?.method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({})
      };
    }

    // Parse request body
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      console.error('Error parsing request body:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }

    const { query, documentIdentifier, projectBasics, questionnaire, sessionId } = body;

    // Validate required parameters
    if (!query || !documentIdentifier || !sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query, documentIdentifier, and sessionId are required' })
      };
    }

    // Generate a unique job ID for this draft generation
    const jobId = randomUUID();
    console.log(`[Job ${jobId}] Starting draft generation for query: "${query}"`);

    // Extract userId from the request context (Cognito authorizer)
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub
      || event.requestContext?.authorizer?.claims?.sub
      || 'unknown';

    // Store initial job status in DynamoDB
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (tableName) {
      await saveJobStatus(jobId, {
        jobId,
        status: 'in_progress',
        query,
        documentIdentifier,
        projectBasics: projectBasics || {},
        questionnaire: questionnaire || {},
        sessionId,
        sections: {},
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 3600 // 1 hour TTL
      });
    }

    // Start the Step Functions execution
    await startDraftGenerationExecution(jobId, {
      jobId,
      query,
      documentIdentifier,
      projectBasics: projectBasics || {},
      questionnaire: questionnaire || {},
      sessionId,
      userId,
    });

    // Return the jobId immediately for polling
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobId,
        status: 'in_progress',
        message: 'Draft generation started. Poll /draft-generation-jobs/{jobId} for results.'
      })
    };
  } catch (error) {
    console.error('Error processing draft generation:', error);

    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Failed to generate draft sections',
        message: error.message
      })
    };
  }
};

/**
 * Save job status to DynamoDB
 */
async function saveJobStatus(jobId, jobData) {
  try {
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (!tableName) {
      console.warn('DRAFT_GENERATION_JOBS_TABLE_NAME not configured');
      return;
    }

    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(jobData)
    });

    await dynamoClient.send(command);
    console.log(`[Job ${jobId}] Saved job status to DynamoDB`);
  } catch (error) {
    console.error(`[Job ${jobId}] Error saving job status:`, error);
    // Don't throw - job can still proceed
  }
}

/**
 * Start the draft generation Step Functions execution
 */
async function startDraftGenerationExecution(jobId, input) {
  const stateMachineArn = process.env.DRAFT_GENERATION_STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    throw new Error('DRAFT_GENERATION_STATE_MACHINE_ARN not configured');
  }

  // Sanitize jobId for the execution name (alphanumeric, hyphens, underscores only)
  const sanitizedJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 40);
  const executionName = `draft-${Date.now()}-${sanitizedJobId}`;

  try {
    const command = new StartExecutionCommand({
      stateMachineArn,
      name: executionName,
      input: JSON.stringify(input),
    });
    await sfnClient.send(command);
    console.log(`[Job ${jobId}] Started Step Functions execution: ${executionName}`);
  } catch (error) {
    console.error(`[Job ${jobId}] Error starting Step Functions execution:`, error);

    // Update job status to error
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (tableName) {
      await saveJobStatus(jobId, {
        jobId,
        status: 'error',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }

    throw error;
  }
}

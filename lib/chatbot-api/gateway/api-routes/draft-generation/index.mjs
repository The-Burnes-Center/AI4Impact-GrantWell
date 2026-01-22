/**
 * REST API handler for draft generation
 * 
 * This module processes POST requests to the /draft-generation endpoint
 * and starts an async job to generate draft sections based on project basics and questionnaire responses.
 * Returns a jobId immediately for polling.
 */

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";

const lambdaClient = new LambdaClient({ region: 'us-east-1' });
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
    
    // Invoke the draft generator Lambda function asynchronously
    await invokeDraftGeneratorFunctionAsync(jobId, query, documentIdentifier, projectBasics, questionnaire, sessionId);
    
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
 * Invoke the draft generator Lambda function asynchronously
 * 
 * @param {string} jobId - The job ID
 * @param {string} query - The user's query
 * @param {string} documentIdentifier - The NOFO document identifier
 * @param {object} projectBasics - Project basic information
 * @param {object} questionnaire - Questionnaire responses
 * @param {string} sessionId - The session ID
 */
async function invokeDraftGeneratorFunctionAsync(jobId, query, documentIdentifier, projectBasics = {}, questionnaire = {}, sessionId) {
  const params = {
    FunctionName: process.env.DRAFT_GENERATOR_FUNCTION,
    InvocationType: 'Event', // Asynchronous invocation
    Payload: JSON.stringify({
      asyncDraftGeneration: true,
      jobId,
      query,
      documentIdentifier,
      projectBasics,
      questionnaire,
      sessionId
    })
  };
  
  try {
    const command = new InvokeCommand(params);
    await lambdaClient.send(command);
    console.log(`[Job ${jobId}] Started async draft generation`);
  } catch (error) {
    console.error(`[Job ${jobId}] Error invoking draft generator function:`, error);
    
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
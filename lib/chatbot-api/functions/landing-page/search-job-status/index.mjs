/**
 * Search Job Status Lambda Function
 * 
 * This function returns the status of an async grant recommendation search job.
 * Used by the frontend to poll for RAG search results.
 */

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

/**
 * Handler for the search job status API
 */
export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET',
    'Content-Type': 'application/json'
  };
  
  try {
    console.log('Event received:', JSON.stringify(event));
    
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
    const tableName = process.env.SEARCH_JOBS_TABLE_NAME;
    if (!tableName) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Search jobs table not configured' })
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
    
    console.log(`[Job Status] Job ${jobId} status: ${job.status}, ragStatus: ${job.ragStatus}`);
    
    // Return job status
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobId: job.jobId,
        status: job.status,
        ragStatus: job.ragStatus,
        filteredGrants: job.filteredGrants || [],
        ragGrants: job.ragGrants || [],
        filters: job.filters,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.ragError
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

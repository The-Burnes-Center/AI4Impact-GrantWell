/**
 * REST API handler for grant recommendations
 * 
 * This module processes POST requests to the /grant-recommendation endpoint
 * and returns matching grants based on the user's query.
 */

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({ region: 'us-east-1' });

/**
 * Handler for the grant recommendation API
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
    if (event.httpMethod === 'OPTIONS') {
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
    
    const { query, userId, sessionId, preferences } = body;
    
    // Validate required parameters
    if (!query) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is required' })
      };
    }
    
    // Invoke the grant recommendation Lambda function
    const response = await invokeGrantRecommendationFunction(query, preferences || {});
    
    // Return the response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Error processing grant recommendation:', error);
    
    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Failed to process grant recommendations',
        message: error.message
      })
    };
  }
};

/**
 * Invoke the grant recommendation Lambda function
 * 
 * @param {string} query - The user's query
 * @param {object} userPreferences - Optional user preferences
 * @returns {object} - The Lambda function response
 */
async function invokeGrantRecommendationFunction(query, userPreferences = {}) {
  const params = {
    FunctionName: process.env.GRANT_RECOMMENDATION_FUNCTION,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({
      body: JSON.stringify({
        query,
        userPreferences
      })
    })
  };
  
  try {
    const command = new InvokeCommand(params);
    const response = await lambdaClient.send(command);
    
    // Parse the response from the Lambda function
    const responseString = new TextDecoder().decode(response.Payload);
    const lambdaResponse = JSON.parse(responseString);
    
    // Parse the body from the Lambda response
    if (lambdaResponse.statusCode === 200 && lambdaResponse.body) {
      return JSON.parse(lambdaResponse.body);
    } else {
      throw new Error(lambdaResponse.body?.error || 'Unknown error from grant recommendation function');
    }
  } catch (error) {
    console.error('Error invoking grant recommendation function:', error);
    throw error;
  }
}
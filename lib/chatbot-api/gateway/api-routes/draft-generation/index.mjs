/**
 * REST API handler for draft generation
 * 
 * This module processes POST requests to the /draft-generation endpoint
 * and returns generated draft sections based on project basics and questionnaire responses.
 */

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({ region: 'us-east-1' });

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
    
    const { query, documentIdentifier, projectBasics, questionnaire } = body;
    
    // Validate required parameters
    if (!query || !documentIdentifier) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query and documentIdentifier are required' })
      };
    }
    
    // Invoke the draft generator Lambda function
    const response = await invokeDraftGeneratorFunction(query, documentIdentifier, projectBasics, questionnaire);
    
    // Return the response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
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
 * Invoke the draft generator Lambda function
 * 
 * @param {string} query - The user's query
 * @param {string} documentIdentifier - The NOFO document identifier
 * @param {object} projectBasics - Project basic information
 * @param {object} questionnaire - Questionnaire responses
 * @returns {object} - The Lambda function response
 */
async function invokeDraftGeneratorFunction(query, documentIdentifier, projectBasics = {}, questionnaire = {}) {
  const params = {
    FunctionName: process.env.DRAFT_GENERATOR_FUNCTION,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({
      body: JSON.stringify({
        query,
        documentIdentifier,
        projectBasics,
        questionnaire
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
      const parsedBody = JSON.parse(lambdaResponse.body);
      console.log('Parsed Lambda response body:', parsedBody);
      return {
        sections: parsedBody.sections || {}
      };
    } else {
      throw new Error(lambdaResponse.body?.error || 'Unknown error from draft generator function');
    }
  } catch (error) {
    console.error('Error invoking draft generator function:', error);
    throw error;
  }
}
/**
 * API Wrapper for Automated NOFO Scraper
 * 
 * This function provides a REST API endpoint to manually trigger the automated NOFO scraper.
 * It invokes the main scraper function and returns the results.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({ region: 'us-east-1' });

export const handler = async (event) => {
  try {
    console.log('Manual trigger of automated NOFO scraper requested');

    // Invoke the automated NOFO scraper function
    const invokeCommand = new InvokeCommand({
      FunctionName: process.env.AUTOMATED_NOFO_SCRAPER_FUNCTION,
      InvocationType: 'RequestResponse', // Synchronous invocation
    });

    const response = await lambdaClient.send(invokeCommand);
    
    // Parse the response payload
    const payload = JSON.parse(new TextDecoder().decode(response.Payload));
    
    console.log('Automated NOFO scraper completed:', payload);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({
        message: 'Automated NOFO scraper triggered successfully',
        result: payload,
        timestamp: new Date().toISOString(),
      }),
    };

  } catch (error) {
    console.error('Error triggering automated NOFO scraper:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({
        message: 'Error triggering automated NOFO scraper',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}; 
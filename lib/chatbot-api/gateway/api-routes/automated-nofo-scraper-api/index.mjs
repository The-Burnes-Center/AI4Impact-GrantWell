/**
 * API Wrapper for Scraper Coordinator
 *
 * Invokes the Scraper Coordinator Lambda (fan-out architecture) and returns
 * its summary response. This wrapper exists for cases where the API route
 * needs to go through a gateway function; the primary route in index.ts
 * points directly to the coordinator Lambda.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({ region: 'us-east-1' });

export const handler = async (event) => {
  const functionName = process.env.SCRAPER_COORDINATOR_FUNCTION;

  try {
    if (!functionName) {
      throw new Error('SCRAPER_COORDINATOR_FUNCTION environment variable is not set');
    }

    console.log('Invoking scraper coordinator:', functionName);

    const response = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
      })
    );

    if (response.FunctionError) {
      throw new Error(`Coordinator error: ${response.FunctionError}`);
    }

    const payloadText = new TextDecoder().decode(response.Payload);
    const payload = JSON.parse(payloadText);

    if (payload.statusCode && payload.statusCode >= 400) {
      throw new Error(`Coordinator returned error: ${payload.body || 'Unknown'}`);
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({
        message: 'Scraper coordinator triggered successfully',
        result: payload,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Scraper API wrapper error:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({
        message: 'Error triggering scraper coordinator',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}; 
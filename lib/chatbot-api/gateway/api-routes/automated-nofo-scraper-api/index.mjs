/**
 * API Wrapper for Automated NOFO Scraper
 * 
 * This function provides a REST API endpoint to manually trigger the automated NOFO scraper.
 * It invokes the main scraper function and returns the results.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({ region: 'us-east-1' });

export const handler = async (event) => {
  console.log('=== AUTOMATED NOFO SCRAPER API WRAPPER START ===');
  console.log('Event received:', JSON.stringify(event, null, 2));
  console.log('Environment variables:', {
    AUTOMATED_NOFO_SCRAPER_FUNCTION: process.env.AUTOMATED_NOFO_SCRAPER_FUNCTION,
    GRANTS_GOV_API_KEY: process.env.GRANTS_GOV_API_KEY ? 'SET' : 'NOT SET',
    BUCKET: process.env.BUCKET
  });

  try {
    console.log('Manual trigger of automated NOFO scraper requested');

    // Validate environment variables
    if (!process.env.AUTOMATED_NOFO_SCRAPER_FUNCTION) {
      throw new Error('AUTOMATED_NOFO_SCRAPER_FUNCTION environment variable is not set');
    }

    if (!process.env.GRANTS_GOV_API_KEY) {
      throw new Error('GRANTS_GOV_API_KEY environment variable is not set');
    }

    if (!process.env.BUCKET) {
      throw new Error('BUCKET environment variable is not set');
    }

    console.log('Environment validation passed');

    // Invoke the automated NOFO scraper function
    console.log('Invoking Lambda function:', process.env.AUTOMATED_NOFO_SCRAPER_FUNCTION);
    
    const invokeCommand = new InvokeCommand({
      FunctionName: process.env.AUTOMATED_NOFO_SCRAPER_FUNCTION,
      InvocationType: 'RequestResponse', // Synchronous invocation
    });

    console.log('Sending invoke command...');
    const response = await lambdaClient.send(invokeCommand);
    
    console.log('Lambda response received:', {
      StatusCode: response.StatusCode,
      FunctionError: response.FunctionError,
      PayloadLength: response.Payload ? response.Payload.length : 0
    });

    // Check for Lambda function errors
    if (response.FunctionError) {
      console.error('Lambda function error:', response.FunctionError);
      throw new Error(`Lambda function error: ${response.FunctionError}`);
    }

    if (response.StatusCode !== 200) {
      console.error('Lambda function returned non-200 status:', response.StatusCode);
      throw new Error(`Lambda function returned status: ${response.StatusCode}`);
    }

    // Parse the response payload
    console.log('Parsing response payload...');
    const payloadText = new TextDecoder().decode(response.Payload);
    console.log('Raw payload:', payloadText);
    
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch (parseError) {
      console.error('Error parsing Lambda response payload:', parseError);
      throw new Error(`Failed to parse Lambda response: ${parseError.message}`);
    }
    
    console.log('Parsed payload:', JSON.stringify(payload, null, 2));

    // Check if the Lambda function returned an error
    if (payload.statusCode && payload.statusCode >= 400) {
      console.error('Lambda function returned error status:', payload);
      throw new Error(`Lambda function error: ${payload.body || payload.message || 'Unknown error'}`);
    }

    console.log('Automated NOFO scraper completed successfully:', payload);

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
    console.error('=== ERROR IN AUTOMATED NOFO SCRAPER API WRAPPER ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Log additional error details if available
    if (error.name) console.error('Error name:', error.name);
    if (error.code) console.error('Error code:', error.code);
    if (error.requestId) console.error('Request ID:', error.requestId);
    
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
        errorType: error.constructor.name,
        timestamp: new Date().toISOString(),
        debug: {
          hasApiKey: !!process.env.GRANTS_GOV_API_KEY,
          hasFunctionName: !!process.env.AUTOMATED_NOFO_SCRAPER_FUNCTION,
          hasBucket: !!process.env.BUCKET
        }
      }),
    };
  } finally {
    console.log('=== AUTOMATED NOFO SCRAPER API WRAPPER END ===');
  }
}; 
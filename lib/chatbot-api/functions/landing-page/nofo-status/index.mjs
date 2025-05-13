/**
 * This Lambda function updates the status of a NOFO in S3.
 * It accepts a NOFO name and status ('active' or 'archived') in the request body,
 * updates the corresponding summary.json file in the S3 bucket,
 * and returns success or error accordingly.
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// Convert a ReadableStream to a string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client();

  try {
    // Parse the request body to get the NOFO name and status
    const requestBody = JSON.parse(event.body);
    const { nofoName, status } = requestBody;

    // Validate input
    if (!nofoName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Missing 'nofoName' in request body" }),
      };
    }

    if (!status || (status !== 'active' && status !== 'archived')) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Status must be 'active' or 'archived'" }),
      };
    }

    // Path to the summary.json file
    const summaryKey = `${nofoName}/summary.json`;

    // First, get the existing summary.json file if it exists
    const getCommand = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: summaryKey,
    });

    let summaryObject;
    try {
      // Try to get the existing summary file
      const getResult = await s3Client.send(getCommand);
      const fileContent = await streamToString(getResult.Body);
      summaryObject = JSON.parse(fileContent);
    } catch (error) {
      // If summary.json doesn't exist, create a new object
      console.log(`No existing summary.json found for ${nofoName}, creating new one`);
      summaryObject = {};
    }

    // Update the status in the summary object
    summaryObject.status = status;

    // Write the updated summary back to S3
    const putCommand = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: summaryKey,
      Body: JSON.stringify(summaryObject, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(putCommand);

    // Return success response
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: `Status for NOFO '${nofoName}' updated to '${status}' successfully`,
      }),
    };
  } catch (error) {
    console.error("Error updating NOFO status:", error);

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: 'Failed to update NOFO status. Internal Server Error.',
        error: error.message,
      }),
    };
  }
}; 
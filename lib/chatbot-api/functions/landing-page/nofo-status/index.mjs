/**
 * This Lambda function updates the status of a NOFO in both S3 and DynamoDB.
 * It accepts a NOFO name and status ('active' or 'archived') and/or isPinned in the request body,
 * updates the corresponding summary.json file in S3 and the metadata in DynamoDB,
 * and returns success or error accordingly.
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Convert a ReadableStream to a string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Update NOFO metadata in DynamoDB
 */
async function updateDynamoDB(tableName, nofoName, status, isPinned) {
  const dynamoClient = new DynamoDBClient();
  const now = new Date().toISOString();

  try {
    // First, check if the item exists
    const getCommand = new GetItemCommand({
      TableName: tableName,
      Key: marshall({
        nofo_name: nofoName,
      }),
    });

    const existingItem = await dynamoClient.send(getCommand);

    if (existingItem.Item) {
      // Update existing item
      const updateExpression = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      if (status !== undefined) {
        updateExpression.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = status;
      }

      if (isPinned !== undefined) {
        updateExpression.push('#isPinned = :isPinned');
        expressionAttributeNames['#isPinned'] = 'isPinned';
        expressionAttributeValues[':isPinned'] = String(isPinned); // DynamoDB GSI requires string
      }

      updateExpression.push('#updated_at = :updated_at');
      expressionAttributeNames['#updated_at'] = 'updated_at';
      expressionAttributeValues[':updated_at'] = now;

      const updateCommand = new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({
          nofo_name: nofoName,
        }),
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
      });

      await dynamoClient.send(updateCommand);
      console.log(`Updated DynamoDB entry for ${nofoName}`);
    } else {
      // Create new item if it doesn't exist
      const item = {
        nofo_name: nofoName,
        status: status || 'active',
        isPinned: String(isPinned !== undefined ? isPinned : false),
        created_at: now,
        updated_at: now,
      };

      const putCommand = new PutItemCommand({
        TableName: tableName,
        Item: marshall(item),
      });

      await dynamoClient.send(putCommand);
      console.log(`Created DynamoDB entry for ${nofoName}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Error updating DynamoDB for ${nofoName}:`, error);
    return { success: false, error: error.message };
  }
}

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
  const s3Client = new S3Client();

  try {
    // Parse the request body to get the NOFO name and status
    const requestBody = JSON.parse(event.body);
    const { nofoName, status, isPinned } = requestBody;

    // Validate input
    if (!nofoName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Missing 'nofoName' in request body" }),
      };
    }

    if (status && status !== 'active' && status !== 'archived') {
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

    // Update the status in the summary object if provided
    if (status) {
      summaryObject.status = status;
    }

    // Update the pinned status if provided
    if (typeof isPinned === 'boolean') {
      summaryObject.isPinned = isPinned;
    }

    // Ensure default values match existing code behavior
    if (!summaryObject.status) {
      summaryObject.status = 'active';
    }
    if (summaryObject.isPinned === undefined) {
      summaryObject.isPinned = false;
    }

    // Write the updated summary back to S3
    const putCommand = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: summaryKey,
      Body: JSON.stringify(summaryObject, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(putCommand);
    console.log(`Updated S3 summary.json for ${nofoName}`);

    // Update DynamoDB if enabled
    // Use summaryObject values to ensure consistency with S3
    if (enableDynamoDBCache && tableName) {
      const dynamoResult = await updateDynamoDB(
        tableName,
        nofoName,
        summaryObject.status,
        summaryObject.isPinned
      );

      if (!dynamoResult.success) {
        console.warn(`DynamoDB update failed for ${nofoName}, but S3 update succeeded: ${dynamoResult.error}`);
        // Continue execution - S3 is the source of truth
      }
    }

    // Return success response (matching existing format)
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: `NOFO '${nofoName}' updated successfully`,
        status: summaryObject.status,
        isPinned: summaryObject.isPinned,
      }),
    };
  } catch (error) {
    console.error('Error updating NOFO:', error);

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: 'Failed to update NOFO. Internal Server Error.',
        error: error.message,
      }),
    };
  }
};

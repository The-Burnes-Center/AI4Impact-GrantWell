/**
 * This Lambda function deletes a NOFO folder and all its contents from S3.
 * It accepts a folder name in the request body and deletes all objects with that prefix.
 * After deletion, it also removes the NOFO entry from DynamoDB (if enabled) and
 * triggers KB sync to remove the NOFO from the Knowledge Base.
 */

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client();

  try {
    // Parse the request body to get the folder name to delete
    const requestBody = JSON.parse(event.body);
    const { nofoName } = requestBody;

    // Validate input
    if (!nofoName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Missing 'nofoName' in request body" }),
      };
    }

    // Collect S3 objects under this NOFO's folder prefix.
    // DynamoDB may store names with "/" but S3 uses "-", so try both.
    let objects = [];

    async function listAllObjects(prefix) {
      const items = [];
      let continuationToken;
      do {
        const response = await s3Client.send(new ListObjectsV2Command({
          Bucket: s3Bucket,
          Prefix: `${prefix}/`,
          ContinuationToken: continuationToken,
        }));
        if (response.Contents) items.push(...response.Contents);
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);
      return items;
    }

    objects = await listAllObjects(nofoName);

    if (objects.length === 0 && nofoName.includes('/')) {
      objects = await listAllObjects(nofoName.replace(/\//g, '-'));
    }

    if (objects.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: `Folder '${nofoName}' not found or already deleted` }),
      };
    }

    // Delete all objects in the folder (including metadata files)
    for (const object of objects) {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: object.Key,
      });

      await s3Client.send(deleteCommand);
    }

    const tableName = process.env.NOFO_METADATA_TABLE_NAME;
    const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
    
    if (enableDynamoDBCache && tableName) {
      try {
        const dynamoClient = new DynamoDBClient();
        const deleteCommand = new DeleteItemCommand({
          TableName: tableName,
          Key: marshall({
            nofo_name: nofoName,
          }),
        });

        await dynamoClient.send(deleteCommand);
        console.log(`Successfully deleted NOFO '${nofoName}' from DynamoDB`);
      } catch (dynamoError) {
        console.error(`Failed to delete from DynamoDB for '${nofoName}' (non-critical):`, dynamoError);
      }
    }

    // Trigger KB sync to remove deleted NOFO from Knowledge Base
    const syncFunctionName = process.env.SYNC_KB_FUNCTION_NAME;
    if (syncFunctionName) {
      try {
        const lambdaClient = new LambdaClient({ region: 'us-east-1' });
        const invokeCommand = new InvokeCommand({
          FunctionName: syncFunctionName,
          InvocationType: 'Event',
          Payload: JSON.stringify({ syncSource: 'nofo' }),
        });
        await lambdaClient.send(invokeCommand);
        console.log(`Triggered KB sync to remove deleted NOFO '${nofoName}' from index`);
      } catch (syncError) {
        console.error(`Failed to trigger KB sync (non-critical): ${syncError}`);
        // Non-critical - NOFO is deleted from S3, sync can happen later
      }
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: `Successfully deleted folder '${nofoName}' and all its contents (${objects.length} objects)`,
      }),
    };
  } catch (error) {
    console.error("Error deleting NOFO folder:", error);

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: 'Failed to delete NOFO folder. Internal Server Error.',
        error: error.message,
      }),
    };
  }
}; 
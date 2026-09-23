/**
 * This Lambda function deletes a NOFO folder and all its contents from S3.
 * It accepts a folder name in the request body and deletes all objects with that prefix.
 * After deletion, it also removes the NOFO entry from DynamoDB (if enabled) and
 * triggers KB sync to remove the NOFO from the Knowledge Base.
 */

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient, DeleteItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { requireAdmin, assertCanEditNofoOr403 } from 'grantwell-shared';

const scopeDeps = { client: new DynamoDBClient(), GetItemCommand, marshall, unmarshall };

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client();

  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;

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

    const tableNameForAuth = process.env.NOFO_METADATA_TABLE_NAME;
    const denied = await assertCanEditNofoOr403(event, scopeDeps, tableNameForAuth, nofoName);
    if (denied) return denied;

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

    // Delete all objects in the folder (including metadata files)
    for (const object of objects) {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: object.Key,
      });

      await s3Client.send(deleteCommand);
    }

    // Always remove the DynamoDB row even when S3 has no objects: the dashboard
    // lists NOFOs from DynamoDB, so an orphaned metadata row (S3 already gone)
    // would otherwise be undeletable — every retry 404s before reaching this step.
    const tableName = process.env.NOFO_METADATA_TABLE_NAME;
    const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
    let dynamoDeleted = false;

    if (enableDynamoDBCache && tableName) {
      try {
        const dynamoClient = new DynamoDBClient();
        const deleteCommand = new DeleteItemCommand({
          TableName: tableName,
          Key: marshall({
            nofo_name: nofoName,
          }),
          ReturnValues: 'ALL_OLD',
        });

        const deleteResult = await dynamoClient.send(deleteCommand);
        dynamoDeleted = Boolean(deleteResult.Attributes);
        console.log(`Deleted NOFO '${nofoName}' from DynamoDB (existed: ${dynamoDeleted})`);
      } catch (dynamoError) {
        console.error(`Failed to delete from DynamoDB for '${nofoName}' (non-critical):`, dynamoError);
      }
    }

    if (objects.length === 0 && !dynamoDeleted) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: `Folder '${nofoName}' not found or already deleted` }),
      };
    }

    // Trigger KB sync to remove deleted NOFO from Knowledge Base
    const syncFunctionName = process.env.SYNC_KB_FUNCTION_NAME;
    if (syncFunctionName) {
      try {
        const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
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
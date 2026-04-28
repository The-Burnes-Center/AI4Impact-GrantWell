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

const SUPPORTED_STATE_CODES = new Set(JSON.parse(process.env.SUPPORTED_STATES || "[]"));

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => typeof r === "string");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === "string") : [];
  } catch {
    return [raw];
  }
}

function resolveCallerScope(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const roles = parseRoles(claims["custom:role"]);
  const stateRaw = String(claims["custom:state"] || "").trim().toUpperCase();
  const state = SUPPORTED_STATE_CODES.has(stateRaw) ? stateRaw : "";

  if (roles.includes("Developer")) return { role: "developer", state };
  if (roles.includes("Admin")) {
    return state ? { role: "stateAdmin", state } : { role: "regularAdmin", state: "" };
  }
  return { role: "user", state };
}

function assertCanEditNofo(callerScope, nofoScope, nofoState) {
  if (callerScope.role === "developer" || callerScope.role === "regularAdmin") return;
  if (callerScope.role === "stateAdmin") {
    if (nofoScope === "state" && nofoState === callerScope.state) return;
    const err = new Error(
      nofoScope === "federal"
        ? "State admins cannot delete federal NOFOs."
        : "State admins can only delete NOFOs for their own state."
    );
    err.statusCode = 403;
    throw err;
  }
  const err = new Error("Not authorized to delete NOFOs.");
  err.statusCode = 403;
  throw err;
}

async function readNofoScope(tableName, nofoName) {
  if (!tableName || !nofoName) return { scope: null, state: null };
  try {
    const dynamoClient = new DynamoDBClient();
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
      })
    );
    if (!result.Item) return { scope: null, state: null };
    const row = unmarshall(result.Item);
    return {
      scope: typeof row.scope === "string" ? row.scope : null,
      state: typeof row.state === "string" ? row.state : null,
    };
  } catch (err) {
    console.warn(`Could not read scope/state for ${nofoName}:`, err.message);
    return { scope: null, state: null };
  }
}

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

    const tableNameForAuth = process.env.NOFO_METADATA_TABLE_NAME;
    const existingScope = await readNofoScope(tableNameForAuth, nofoName);
    if (existingScope.scope) {
      try {
        const callerScope = resolveCallerScope(event);
        assertCanEditNofo(callerScope, existingScope.scope, existingScope.state);
      } catch (authError) {
        return {
          statusCode: authError.statusCode || 403,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ message: authError.message }),
        };
      }
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
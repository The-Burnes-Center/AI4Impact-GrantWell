/**
 * Lambda function to update the content fields of a NOFO's summary.json in S3.
 * Allows admins to correct extracted summary data (EligibilityCriteria,
 * RequiredDocuments, ProjectNarrativeSections, KeyDeadlines, GrantName,
 * Agency, Category) without re-running the full processing pipeline.
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

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
        ? "State admins cannot modify federal NOFOs."
        : "State admins can only modify NOFOs for their own state."
    );
    err.statusCode = 403;
    throw err;
  }
  const err = new Error("Not authorized to modify NOFOs.");
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

async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

const EDITABLE_ARRAY_FIELDS = [
  'EligibilityCriteria',
  'RequiredDocuments',
  'ProjectNarrativeSections',
  'KeyDeadlines',
];

const EDITABLE_SCALAR_FIELDS = ['GrantName', 'Agency', 'Category'];

async function syncMetadataToDynamoDB(tableName, nofoName, summary) {
  const dynamoClient = new DynamoDBClient();
  const now = new Date().toISOString();

  try {
    const getCommand = new GetItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName }),
    });
    const existingItem = await dynamoClient.send(getCommand);
    if (!existingItem.Item) return;

    const updateExpression = ['#updated_at = :updated_at'];
    const expressionAttributeNames = { '#updated_at': 'updated_at' };
    const expressionAttributeValues = { ':updated_at': now };

    if (summary.Agency !== undefined) {
      updateExpression.push('agency = :agency');
      expressionAttributeValues[':agency'] = summary.Agency || null;
    }
    if (summary.Category !== undefined) {
      updateExpression.push('category = :category');
      expressionAttributeValues[':category'] = summary.Category || null;
    }

    const updateCommand = new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ nofo_name: nofoName }),
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    });

    await dynamoClient.send(updateCommand);
    console.log(`Synced metadata to DynamoDB for ${nofoName}`);
  } catch (error) {
    console.warn(`DynamoDB metadata sync failed for ${nofoName}: ${error.message}`);
  }
}

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
  const s3Client = new S3Client();

  try {
    const requestBody = JSON.parse(event.body);
    const { nofoName, summary } = requestBody;

    if (!nofoName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Missing 'nofoName' in request body" }),
      };
    }

    const existingScope = await readNofoScope(tableName, nofoName);
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

    if (!summary || typeof summary !== 'object') {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: "Missing or invalid 'summary' in request body" }),
      };
    }

    const summaryKey = `${nofoName}/summary.json`;

    const getCommand = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: summaryKey,
    });

    let existingSummary;
    try {
      const getResult = await s3Client.send(getCommand);
      const fileContent = await streamToString(getResult.Body);
      existingSummary = JSON.parse(fileContent);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return {
          statusCode: 404,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ message: `No summary.json found for '${nofoName}'` }),
        };
      }
      throw error;
    }

    for (const field of EDITABLE_SCALAR_FIELDS) {
      if (summary[field] !== undefined) {
        existingSummary[field] = summary[field];
      }
    }

    for (const field of EDITABLE_ARRAY_FIELDS) {
      if (Array.isArray(summary[field])) {
        existingSummary[field] = summary[field]
          .filter((item) => !item.removed)
          .map(({ removed, ...rest }) => rest);
      }
    }

    const putCommand = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: summaryKey,
      Body: JSON.stringify(existingSummary, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(putCommand);
    console.log(`Updated summary.json content for ${nofoName}`);

    if (enableDynamoDBCache && tableName) {
      await syncMetadataToDynamoDB(tableName, nofoName, existingSummary);
    }

    const syncFunctionName = process.env.SYNC_KB_FUNCTION_NAME;
    if (syncFunctionName) {
      try {
        const lambdaClient = new LambdaClient();
        await lambdaClient.send(
          new InvokeCommand({
            FunctionName: syncFunctionName,
            InvocationType: 'Event',
            Payload: JSON.stringify({ syncSource: 'nofo' }),
          })
        );
        console.log('Triggered KB sync after summary update');
      } catch (error) {
        console.error('Failed to invoke KB sync:', error);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: `Summary for '${nofoName}' updated successfully`,
        data: existingSummary,
      }),
    };
  } catch (error) {
    console.error('Error updating NOFO summary:', error);

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: 'Failed to update NOFO summary. Internal Server Error.',
        error: error.message,
      }),
    };
  }
};

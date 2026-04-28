import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const SUPPORTED_STATE_CODES = new Set(JSON.parse(process.env.SUPPORTED_STATES || "[]"));

const STATE_NAMES = {
  CA: "California",
  CO: "Colorado",
  RI: "Rhode Island",
};

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

function assertUserCanAccessNofo(callerScope, nofoScope, nofoState) {
  if (callerScope.role === "developer" || callerScope.role === "regularAdmin") return;
  if (nofoScope === "federal") return;
  if (nofoScope === "state" && nofoState && nofoState === callerScope.state) return;

  const err = new Error("ACCESS_DENIED_STATE");
  err.code = "ACCESS_DENIED_STATE";
  err.statusCode = 403;
  err.userState = callerScope.state || null;
  err.nofoState = nofoState || null;
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

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET;
  const s3Client = new S3Client();

  try {
    const baseFileName = event.queryStringParameters?.documentKey;
    if (!baseFileName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Missing 'documentKey' in query params" }),
      };
    }

    const basePath = baseFileName.split('/')[0];

    const existingScope = await readNofoScope(process.env.NOFO_METADATA_TABLE_NAME, basePath);
    // Untagged rows default to federal (permissive) so legacy NOFOs stay viewable.
    const effectiveScope = existingScope.scope || "federal";
    const effectiveState = existingScope.state;

    try {
      const callerScope = resolveCallerScope(event);
      assertUserCanAccessNofo(callerScope, effectiveScope, effectiveState);
    } catch (authError) {
      if (authError.code === "ACCESS_DENIED_STATE") {
        const stateName = effectiveState ? (STATE_NAMES[effectiveState] || effectiveState) : "another state";
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            error: "ACCESS_DENIED_STATE",
            message: `This grant is specific to ${stateName}. Please contact a platform administrator to request access.`,
            userState: authError.userState,
            nofoState: authError.nofoState,
            cta: { label: "Go back to home", target: "/home" },
          }),
        };
      }
      throw authError;
    }

    const fileName = `${basePath}/summary.json`;
    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: fileName,
    });

    const result = await s3Client.send(command);
    const fileContent = await streamToString(result.Body);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "File retrieved successfully",
        data: JSON.parse(fileContent),
      }),
    };

  } catch (error) {
    console.error("Error fetching file from S3:", error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to retrieve file from S3. Internal Server Error.',
      }),
    };
  }
};

const streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
};

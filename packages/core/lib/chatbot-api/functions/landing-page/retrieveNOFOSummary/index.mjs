import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { recordEvent, touchLastActive } from 'grantwell-shared';

// SUPPORTED_STATES injected as [{code,name}] (from lib/shared/states.ts). Parsed inline because
// this function does not attach the grantwell-shared Lambda layer.
const SUPPORTED_STATES = (() => {
  try {
    const parsed = JSON.parse(process.env.SUPPORTED_STATES || "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.code === "string") : [];
  } catch {
    return [];
  }
})();
const SUPPORTED_STATE_CODES = new Set(SUPPORTED_STATES.map((s) => s.code));
const STATE_NAME_BY_CODE = Object.fromEntries(SUPPORTED_STATES.map((s) => [s.code, s.name]));
const stateNameFromCode = (code) => STATE_NAME_BY_CODE[code] || code;

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

// Platform authority comes from the explicit PlatformAdmin role; this flag keeps pre-migration
// stateless admins working and must stay on until every pool is migrated.
const LEGACY_STATELESS_ADMIN_IS_PLATFORM =
  String(process.env.LEGACY_STATELESS_ADMIN_IS_PLATFORM ?? "true").toLowerCase() !== "false";

function resolveCallerScope(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const roles = parseRoles(claims["custom:role"]);
  const stateRaw = String(claims["custom:state"] || "").trim().toUpperCase();
  const state = SUPPORTED_STATE_CODES.has(stateRaw) ? stateRaw : "";

  if (roles.includes("Developer")) return { role: "developer", state };
  if (roles.includes("PlatformAdmin")) return { role: "regularAdmin", state: "" };
  if (roles.includes("Admin")) {
    if (state) return { role: "stateAdmin", state };
    return LEGACY_STATELESS_ADMIN_IS_PLATFORM
      ? { role: "regularAdmin", state: "" }
      : { role: "unscopedAdmin", state: "" };
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

/**
 * A state's guidance overlay on a federal NOFO, if one exists for `stateCode`. Returns the
 * note text or null. Failures are swallowed — an overlay lookup must never block the summary.
 */
async function readStateOverlay(tableName, nofoName, stateCode) {
  if (!tableName || !nofoName || !stateCode) return null;
  try {
    const dynamoClient = new DynamoDBClient();
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName, state: stateCode }),
      })
    );
    if (!result.Item) return null;
    const row = unmarshall(result.Item);
    const note = typeof row.note === "string" ? row.note.trim() : "";
    return note ? { note, updatedAt: row.updated_at || null } : null;
  } catch (err) {
    console.warn(`Could not read state overlay for ${nofoName}/${stateCode}:`, err.message);
    return null;
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

    const callerScope = resolveCallerScope(event);
    try {
      assertUserCanAccessNofo(callerScope, effectiveScope, effectiveState);
    } catch (authError) {
      if (authError.code === "ACCESS_DENIED_STATE") {
        const stateName = effectiveState ? stateNameFromCode(effectiveState) : "another state";
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
    const summary = JSON.parse(fileContent);

    // A successful summary fetch is a user opening this grant — count it as a view. Best-effort.
    const viewerSub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    if (viewerSub) {
      await recordEvent({ eventType: "nofo_view", userId: viewerSub, state: callerScope.state, nofoName: basePath });
      await touchLastActive(viewerSub, callerScope.state);
    }

    // On a federal NOFO, merge in the viewer's own state's guidance overlay (if any). The
    // federal record is untouched; other states and stateless viewers see no overlay.
    if (effectiveScope === "federal" && callerScope.state) {
      const overlay = await readStateOverlay(
        process.env.NOFO_STATE_OVERLAY_TABLE_NAME, basePath, callerScope.state
      );
      if (overlay) {
        summary.stateGuidance = {
          state: callerScope.state,
          stateName: stateNameFromCode(callerScope.state),
          note: overlay.note,
          updatedAt: overlay.updatedAt,
        };
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "File retrieved successfully",
        data: summary,
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

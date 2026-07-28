/**
 * This Lambda function retrieves a 'questions.json' file from an S3 bucket based on a provided document key.
 * It checks if the document key is provided, retrieves the JSON file from S3, and returns its content.
 * Access is gated by the same state-scoping rule as the NOFO summary endpoint.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

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

// Admin-authored questions layered onto a state NOFO, from the (nofo_name, state) overlay row.
// Best-effort: a missing table/row or a read error yields no custom questions, never an error.
async function readCustomQuestions(tableName, nofoName, stateCode) {
  if (!tableName || !nofoName || !stateCode) return [];
  try {
    const dynamoClient = new DynamoDBClient();
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName, state: stateCode }),
      })
    );
    if (!result.Item) return [];
    const row = unmarshall(result.Item);
    return Array.isArray(row.customQuestions) ? row.customQuestions : [];
  } catch (err) {
    console.warn(`Could not read custom questions for ${nofoName}/${stateCode}:`, err.message);
    return [];
  }
}

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

export const handler = async (event) => {
  const s3Bucket = process.env.BUCKET; // Ensure BUCKET is set in environment variables
  const s3Client = new S3Client();

  try {
    // Get the filename/key from the event parameter
    const baseFileName = event.queryStringParameters?.documentKey;
    if (!baseFileName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          message: "Missing 'documentKey' in query parameters",
        }),
      };
    }

    const basePath = baseFileName.split("/")[0];

    const existingScope = await readNofoScope(process.env.NOFO_METADATA_TABLE_NAME, basePath);
    const effectiveScope = existingScope.scope || "federal";
    const effectiveState = existingScope.state;

    try {
      const callerScope = resolveCallerScope(event);
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

    // Load the parsed questions from S3. A state NOFO whose document had no questions has no
    // questions.json — treat that one case as "no parsed questions" so any admin-authored custom
    // questions can still be returned; any other S3 error is a genuine failure.
    let data = { questions: [] };
    try {
      const result = await s3Client.send(
        new GetObjectCommand({ Bucket: s3Bucket, Key: `${basePath}/questions.json` })
      );
      const fileContent = await streamToString(result.Body);
      data = JSON.parse(fileContent);
    } catch (s3Error) {
      if (s3Error?.name !== "NoSuchKey" && s3Error?.$metadata?.httpStatusCode !== 404) {
        throw s3Error;
      }
    }
    if (!Array.isArray(data.questions)) data.questions = [];

    // Layer in admin-authored custom questions for a state NOFO (keyed by the NOFO's own state).
    if (effectiveScope === "state" && effectiveState) {
      const custom = await readCustomQuestions(
        process.env.NOFO_STATE_OVERLAY_TABLE_NAME, basePath, effectiveState
      );
      for (const q of custom) {
        if (q && typeof q.question === "string") {
          data.questions.push({ id: q.id, question: q.question, helpText: q.helpText, source: "custom" });
        }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Questions file retrieved successfully",
        data,
      }),
    };
  } catch (error) {
    console.error("Error fetching questions file from S3:", error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message:
          "Failed to retrieve questions file from S3. Internal Server Error.",
      }),
    };
  }
};

// Helper function to convert stream data to a string
const streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
};

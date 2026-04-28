/**
 * Generates a presigned S3 URL for an admin NOFO upload and writes the
 * companion `<key>.metadata.json` sidecar so the Bedrock Knowledge Base tags
 * the document's scope/state on ingestion.
 *
 * Scope/state authorization rules:
 *   - `scope=federal`: allowed for Developer and Regular admin (Admin with no
 *     `custom:state`). State admins cannot upload federal NOFOs.
 *   - `scope=state, state=X`: allowed for Developer, Regular admin, or the
 *     Admin whose `custom:state` equals X.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const URL_EXPIRATION_SECONDS = 300;

const SUPPORTED_STATE_CODES = new Set(
  JSON.parse(process.env.SUPPORTED_STATES || "[]")
);

const s3 = new S3Client({
  region: "us-east-1",
  requestChecksumCalculation: "WHEN_REQUIRED",
});

const ddb = new DynamoDBClient({ region: "us-east-1" });

async function recordScopeInMetadataTable(documentIdentifier, scope, stateCode) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !documentIdentifier) return;

  const setExprs = ["#scope = :scope", "#state = :state", "updated_at = :now"];
  const exprNames = { "#scope": "scope", "#state": "state" };
  const exprValues = {
    ":scope": { S: scope },
    ":state": scope === "state" && stateCode ? { S: stateCode } : { NULL: true },
    ":now": { S: new Date().toISOString() },
  };

  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: documentIdentifier }),
        UpdateExpression: `SET ${setExprs.join(", ")}`,
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
      })
    );
  } catch (err) {
    // Don't fail the upload — the sidecar still carries scope/state.
    console.warn(
      `Could not record scope/state to NOFOMetadataTable for ${documentIdentifier}:`,
      err.message
    );
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => typeof r === "string");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((r) => typeof r === "string")
      : [];
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
    return state
      ? { role: "stateAdmin", state }
      : { role: "regularAdmin", state: "" };
  }
  return { role: "user", state };
}

function assertCanUpload(callerScope, scope, state) {
  if (callerScope.role === "developer" || callerScope.role === "regularAdmin") {
    return;
  }
  if (callerScope.role === "stateAdmin") {
    if (scope === "state" && state === callerScope.state) return;
    const err = new Error(
      scope === "federal"
        ? "State admins cannot upload federal NOFOs."
        : "State admins can only upload NOFOs for their own state."
    );
    err.statusCode = 403;
    throw err;
  }
  const err = new Error("Not authorized to upload NOFOs.");
  err.statusCode = 403;
  throw err;
}

export const handler = async (event) => {
  try {
    if (event?.requestContext?.http?.method === "OPTIONS") {
      return respond(200, {});
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { fileName, fileType } = body;
    if (!fileName || !fileType) {
      return respond(400, { message: "fileName and fileType are required" });
    }

    const scope = String(body.scope || "").trim().toLowerCase();
    if (scope !== "federal" && scope !== "state") {
      return respond(400, {
        message: "scope must be 'federal' or 'state'",
      });
    }

    let stateCode = "";
    if (scope === "state") {
      stateCode = String(body.state || "").trim().toUpperCase();
      if (!SUPPORTED_STATE_CODES.has(stateCode)) {
        return respond(400, {
          message: "state must be a supported state code when scope=state",
        });
      }
    }

    const callerScope = resolveCallerScope(event);
    assertCanUpload(callerScope, scope, stateCode);

    const bucket = process.env.BUCKET;

    const lastSlash = fileName.lastIndexOf("/");
    const documentIdentifier =
      lastSlash >= 0 ? fileName.substring(0, lastSlash) : fileName;
    const baseFileName =
      lastSlash >= 0 ? fileName.substring(lastSlash + 1) : fileName;

    const metadataAttributes = {
      documentType: "NOFO",
      documentIdentifier,
      bucket: "nofo",
      fileName: baseFileName,
      processedAt: new Date().toISOString(),
      scope,
      ...(scope === "state" ? { state: stateCode } : {}),
    };

    // Write the sidecar first so it is in place before the PDF arrives.
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${fileName}.metadata.json`,
        Body: JSON.stringify({ metadataAttributes }),
        ContentType: "application/json",
      })
    );

    // Persist scope/state to the metadata row so downstream sidecar writers
    // (e.g. publish) can preserve them when they overwrite the sidecar.
    await recordScopeInMetadataTable(documentIdentifier, scope, stateCode);

    const signedUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: fileName,
        ContentType: fileType,
      }),
      { expiresIn: URL_EXPIRATION_SECONDS }
    );

    return respond(200, { signedUrl });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    const statusCode = error?.statusCode || 500;
    return respond(statusCode, {
      message:
        statusCode === 500
          ? "An error occurred while generating the upload URL"
          : error.message,
    });
  }
};

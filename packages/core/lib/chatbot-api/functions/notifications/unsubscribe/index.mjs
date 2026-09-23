/**
 * Public one-click unsubscribe endpoint (no JWT). The signed token in the link IS the proof of
 * which user is asking to opt out — it carries the Cognito sub and an HMAC keyed by a shared
 * secret, so a caller can't unsubscribe an arbitrary account by guessing an id.
 *
 * POST /unsubscribe?token=...  → List-Unsubscribe-Post one-click (RFC 8058); sets frequency "off"
 * GET  /unsubscribe?token=...  → same effect, then a small human-facing confirmation page
 *
 * Opting out sets frequency to "off" (never deletes the record) so the last_sent watermark and the
 * user's saved categories/keywords survive for if they re-subscribe.
 */

import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { verifyUnsubscribeToken } from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const secretsClient = new SecretsManagerClient({ region });

const PREFS_TABLE = process.env.USER_NOTIFICATION_PREFS_TABLE_NAME;
const SECRET_ARN = process.env.UNSUBSCRIBE_SECRET_ARN;

const APP_NAME = process.env.DIGEST_APP_NAME || "GrantWell";
// An env value interpolated straight into a style attribute is an injection vector, so only a
// literal CSS hex color gets through.
const RAW_BRAND_COLOR = process.env.DIGEST_BRAND_COLOR || "";
const BRAND_COLOR = /^#[0-9a-fA-F]{3,8}$/.test(RAW_BRAND_COLOR) ? RAW_BRAND_COLOR : "#195C53";

// The signing secret rarely changes and the container is reused, so cache it across invocations.
let cachedSecret;
async function getSecret() {
  if (cachedSecret !== undefined) return cachedSecret;
  const res = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  cachedSecret = res.SecretString || "";
  return cachedSecret;
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || "GET";
  if (method === "OPTIONS") return page(200, "");

  if (!PREFS_TABLE || !SECRET_ARN) {
    return page(500, "Unsubscribe is not configured.");
  }

  const token = event?.queryStringParameters?.token || "";
  let userId = null;
  try {
    userId = verifyUnsubscribeToken(token, await getSecret());
  } catch (error) {
    console.error("Unsubscribe token check failed:", error);
  }
  if (!userId) {
    // Deliberately vague: don't reveal whether the id existed.
    return respond(event, 400, "This unsubscribe link is invalid or has expired.");
  }

  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: PREFS_TABLE,
        Key: marshall({ user_id: userId }),
        UpdateExpression: "SET frequency = :off, updated_at = :now",
        ExpressionAttributeValues: marshall({ ":off": "off", ":now": new Date().toISOString() }),
      })
    );
  } catch (error) {
    console.error(`Unsubscribe failed for ${userId}:`, error);
    return respond(event, 500, "Something went wrong. Please try again later.");
  }

  return respond(event, 200, "You've been unsubscribed from grant digest emails.");
};

// One-click POST (RFC 8058) wants a bare 200 with no body; a GET (someone clicking in a browser)
// gets a minimal HTML confirmation.
function respond(event, statusCode, message) {
  const method = event?.requestContext?.http?.method || "GET";
  if (method === "POST") {
    return { statusCode, headers: { "Content-Type": "text/plain" }, body: "" };
  }
  return page(statusCode, message);
}

function escapeHtml(value) {
  return String(value).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function page(statusCode, message) {
  const safe = escapeHtml(message);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Unsubscribe</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:520px;margin:64px auto;padding:0 20px;text-align:center;">
<h1 style="font-size:20px;color:${BRAND_COLOR};">${escapeHtml(APP_NAME)}</h1><p style="font-size:15px;">${safe}</p></body></html>`;
  return { statusCode, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

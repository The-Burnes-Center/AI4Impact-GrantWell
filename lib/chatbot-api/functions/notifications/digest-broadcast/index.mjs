/**
 * Developer-only digest trigger. Fires the REAL scheduled digest on demand instead of waiting for
 * the EventBridge cron: it async-invokes NotificationDigestFunction, which emails the recipients
 * their own personalized digest — real subject (no [TEST] prefix), a working unsubscribe link, and
 * the usual last_sent watermark advance. This is a real send, not a preview, so it's exactly what a
 * user would receive. Use it to exercise the full end-to-end flow in a non-prod environment.
 *
 * POST /notification-digest/broadcast?frequency=daily&scope=all → digest to every subscribed user
 * POST /notification-digest/broadcast?frequency=daily&scope=me  → digest to just the caller
 */

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const region = process.env.AWS_REGION || "us-east-1";
const lambdaClient = new LambdaClient({ region });

const DIGEST_FUNCTION_NAME = process.env.DIGEST_FUNCTION_NAME;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return respond(200, {});
  }

  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const roles = parseRoles(claims["custom:role"]);
  if (!roles.includes("Developer")) {
    return respond(403, { message: "Developer access required" });
  }
  if (!DIGEST_FUNCTION_NAME) {
    return respond(500, { message: "Digest broadcast is not configured" });
  }

  const frequency =
    event?.queryStringParameters?.frequency === "weekly" ? "weekly" : "daily";
  // Default to self so an accidental call can't blast every user; broadcasting is opt-in.
  const scope = event?.queryStringParameters?.scope === "all" ? "all" : "me";

  // For a self-send, target the caller by Cognito sub; broadcast leaves onlyUserId unset.
  const payload = { frequency };
  if (scope === "me") {
    const userId = claims.sub;
    if (!userId) {
      return respond(400, { message: "Could not identify the calling user" });
    }
    payload.onlyUserId = userId;
  }

  try {
    // Event (async) invoke: a full broadcast can take up to the digest Lambda's 15-minute timeout,
    // well past the API Gateway response window, so we fire-and-forget and return immediately.
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: DIGEST_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify(payload)),
      })
    );
    const who = scope === "all" ? "all subscribed users" : "you";
    return respond(202, {
      started: true,
      frequency,
      scope,
      message: `Started the ${frequency} digest for ${who}. Delivery happens in the background; nothing is sent if there are no matching grants.`,
    });
  } catch (error) {
    console.error("Digest broadcast invoke failed:", error);
    return respond(500, { message: "Could not start the digest" });
  }
};

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => typeof r === "string");
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === "string") : [];
  } catch {
    return [raw];
  }
}

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

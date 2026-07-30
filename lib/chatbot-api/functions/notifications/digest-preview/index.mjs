/**
 * Developer-only digest preview + test send. Runs the REAL selection: it reads the caller's own
 * notification prefs and the active NOFO pool, then applies the same watermark + matching logic
 * the scheduled digest uses — so the preview reflects exactly what this developer would receive.
 * Copy and branding come from the instance config (injected as env), not an editable store.
 *
 * GET  /notification-digest/preview?frequency=daily  → { rendered, count } (empty state when 0)
 * POST /notification-digest/preview?frequency=daily  → sends the digest; no-op when 0 matches
 */

import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { buildDigest, selectDigestNofos, selectDigestSections } from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const sesClient = new SESv2Client({ region });

const PREFS_TABLE = process.env.USER_NOTIFICATION_PREFS_TABLE_NAME;
const NOFO_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const APP_URL = process.env.DEPLOYMENT_URL || "";
const SENDER = process.env.NOTIFICATION_SENDER || "no-reply@grantwell.us";
const BRANDING = {
  appName: process.env.DIGEST_APP_NAME || "",
  brandColor: process.env.DIGEST_BRAND_COLOR || "",
  logoUrl: process.env.DIGEST_LOGO_URL || "",
  postalAddress: process.env.DIGEST_POSTAL_ADDRESS || "",
  supportEmail: process.env.DIGEST_SUPPORT_EMAIL || "",
};
// Sectioned digest (New / Closing soon / Still open + fallback send). Off by default; the preview
// can also force it on per-request with ?v2=1 so developers can eyeball it before it ships.
const DIGEST_V2 = process.env.DIGEST_V2 !== "false";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
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
  if (!PREFS_TABLE || !NOFO_TABLE) {
    return respond(500, { message: "Digest preview is not configured" });
  }

  const userId = claims.sub;
  if (!userId) {
    return respond(400, { message: "Could not identify the calling user" });
  }

  const method = event.requestContext?.http?.method || "GET";
  const frequency =
    event?.queryStringParameters?.frequency === "weekly" ? "weekly" : "daily";

  try {
    const prefs = (await getPrefs(userId)) || { user_id: userId };
    const activeNofos = await queryActiveNofos();
    const now = new Date();
    const useV2 = DIGEST_V2 || event?.queryStringParameters?.v2 === "1";

    let rendered;
    let sendCount;
    if (useV2) {
      const sections = selectDigestSections(activeNofos, prefs, frequency, now);
      sendCount = sections.total;
      rendered = buildDigest([], frequency, {
        appUrl: APP_URL,
        branding: BRANDING,
        sections,
        dateRange: { from: sections.since.toISOString(), to: now.toISOString() },
      });
    } else {
      const { matches, since } = selectDigestNofos(activeNofos, prefs, frequency, now);
      sendCount = matches.length;
      rendered = buildDigest(matches, frequency, {
        appUrl: APP_URL,
        branding: BRANDING,
        dateRange: { from: since.toISOString(), to: now.toISOString() },
      });
    }

    if (method === "POST") {
      if (sendCount === 0) {
        // Nothing relevant this window — send nothing (the real digest skips too).
        return respond(200, {
          sent: false,
          count: 0,
          message: "No relevant grants right now — nothing to send.",
        });
      }
      const email = claims.email;
      if (!email) {
        return respond(400, { message: "Your account has no email address" });
      }
      await sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: SENDER,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: { Data: `[TEST] ${rendered.subject}` },
              Body: { Text: { Data: rendered.text }, Html: { Data: rendered.html } },
            },
          },
        })
      );
      return respond(200, {
        sent: true,
        count: sendCount,
        message: `Test digest (${sendCount} grant${sendCount === 1 ? "" : "s"}) sent to ${email}`,
      });
    }

    return respond(200, { rendered, count: sendCount });
  } catch (error) {
    console.error("Digest preview error:", error);
    return respond(500, { message: "Digest preview request failed" });
  }
};

async function getPrefs(userId) {
  const res = await dynamoClient.send(
    new GetItemCommand({
      TableName: PREFS_TABLE,
      Key: marshall({ user_id: userId }),
    })
  );
  return res.Item ? unmarshall(res.Item) : null;
}

async function queryActiveNofos() {
  const out = [];
  let lastKey;
  do {
    const res = await dynamoClient.send(
      new QueryCommand({
        TableName: NOFO_TABLE,
        IndexName: "StatusIndex",
        KeyConditionExpression: "#status = :active",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: marshall({ ":active": "active" }),
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of res.Items || []) out.push(unmarshall(item));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

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

/**
 * NOFO digest Lambda.
 *
 * Invoked by two EventBridge rules — a daily and a weekly cron — each passing
 * { frequency: "daily" | "weekly" }. For every user whose prefs match that frequency,
 * it queries NOFOs that turned active since the user's last_sent watermark, filters by
 * the user's subscribed states / categories / keywords, and emails a single digest via
 * SES. last_sent is advanced only after a successful send.
 */

import {
  DynamoDBClient,
  ScanCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const cognitoClient = new CognitoIdentityProviderClient({ region });
const sesClient = new SESv2Client({ region });

const PREFS_TABLE = process.env.USER_NOTIFICATION_PREFS_TABLE_NAME;
const NOFO_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
const SENDER = process.env.NOTIFICATION_SENDER || "no-reply@grantwell.us";
const APP_URL = process.env.DEPLOYMENT_URL || "";

// A weekly digest reaches back a week even if last_sent is missing; daily reaches back a day.
const LOOKBACK_DAYS = { daily: 1, weekly: 7 };

export const handler = async (event) => {
  const frequency = event?.frequency === "weekly" ? "weekly" : "daily";
  if (!PREFS_TABLE || !NOFO_TABLE || !USER_POOL_ID) {
    throw new Error("Notification digest is not configured");
  }

  const now = new Date();
  const nowISO = now.toISOString();
  const stats = { candidates: 0, sent: 0, empty: 0, errors: 0 };

  const users = await scanPrefs(frequency);
  const activeNofos = await queryActiveNofos();

  for (const prefs of users) {
    stats.candidates++;
    try {
      const since = watermark(prefs.last_sent, frequency, now);
      const matches = activeNofos.filter(
        (nofo) => createdAfter(nofo, since) && matchesPrefs(nofo, prefs)
      );

      if (matches.length === 0) {
        stats.empty++;
        // Still advance the watermark so an idle user's next digest window starts here.
        await advanceWatermark(prefs.user_id, nowISO);
        continue;
      }

      const email = await resolveEmail(prefs.user_id);
      if (!email) {
        stats.errors++;
        continue;
      }

      await sendDigest(email, matches, frequency);
      await advanceWatermark(prefs.user_id, nowISO);
      stats.sent++;
    } catch (error) {
      stats.errors++;
      console.error(`Digest failed for user ${prefs.user_id}:`, error);
    }
  }

  console.log("Digest run complete:", frequency, stats);
  return { frequency, stats };
};

async function scanPrefs(frequency) {
  const out = [];
  let lastKey;
  do {
    const res = await dynamoClient.send(
      new ScanCommand({
        TableName: PREFS_TABLE,
        FilterExpression: "frequency = :f",
        ExpressionAttributeValues: marshall({ ":f": frequency }),
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of res.Items || []) out.push(unmarshall(item));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
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

function watermark(lastSent, frequency, now) {
  if (lastSent) {
    const d = new Date(lastSent);
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() - (LOOKBACK_DAYS[frequency] || 1));
  return fallback;
}

function createdAfter(nofo, since) {
  if (!nofo.created_at) return false;
  const d = new Date(nofo.created_at);
  return !isNaN(d.getTime()) && d > since;
}

function matchesPrefs(nofo, prefs) {
  const states = arr(prefs.states);
  const categories = arr(prefs.categories);
  const keywords = arr(prefs.keywords);

  // No filters at all → user gets every new active NOFO.
  if (!states.length && !categories.length && !keywords.length) return true;

  if (states.length) {
    const nofoState = String(nofo.state || "").toUpperCase();
    if (nofoState && states.includes(nofoState)) return true;
  }
  if (categories.length && nofo.category && categories.includes(nofo.category)) {
    return true;
  }
  if (keywords.length) {
    const haystack = `${nofo.nofo_name || ""} ${nofo.summary || ""}`.toLowerCase();
    if (keywords.some((k) => haystack.includes(k))) return true;
  }
  return false;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

async function resolveEmail(userId) {
  try {
    const res = await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
    );
    const attr = (res.UserAttributes || []).find((a) => a.Name === "email");
    return attr?.Value || null;
  } catch (error) {
    console.error(`Could not resolve email for ${userId}:`, error);
    return null;
  }
}

async function advanceWatermark(userId, iso) {
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: PREFS_TABLE,
      Key: marshall({ user_id: userId }),
      UpdateExpression: "SET last_sent = :ls",
      ExpressionAttributeValues: marshall({ ":ls": iso }),
    })
  );
}

async function sendDigest(email, nofos, frequency) {
  const label = frequency === "weekly" ? "weekly" : "daily";
  const lines = nofos
    .map((n) => {
      const name = n.nofo_name || "Untitled";
      const link = APP_URL ? `${APP_URL}/requirements/${encodeURIComponent(name)}` : "";
      return link ? `- ${name}: ${link}` : `- ${name}`;
    })
    .join("\n");

  const rows = nofos
    .map((n) => {
      const name = escapeHtml(n.nofo_name || "Untitled");
      const link = APP_URL
        ? `${APP_URL}/requirements/${encodeURIComponent(n.nofo_name || "")}`
        : "";
      return `<li>${link ? `<a href="${link}">${name}</a>` : name}</li>`;
    })
    .join("");

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: SENDER,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: `New grant opportunities — your ${label} digest` },
          Body: {
            Text: { Data: `New grant opportunities matching your preferences:\n\n${lines}\n` },
            Html: {
              Data: `<p>New grant opportunities matching your preferences:</p><ul>${rows}</ul>`,
            },
          },
        },
      },
    })
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
import { buildDigest, selectDigestNofos } from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const cognitoClient = new CognitoIdentityProviderClient({ region });
const sesClient = new SESv2Client({ region });

const PREFS_TABLE = process.env.USER_NOTIFICATION_PREFS_TABLE_NAME;
const NOFO_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
const SENDER = process.env.NOTIFICATION_SENDER || "no-reply@grantwell.us";
const APP_URL = process.env.DEPLOYMENT_URL || "";

// Branding is pulled from the instance config at deploy (injected as env), so the email
// matches the GrantWell UI. Not admin-editable — one source of truth is the instance config.
const BRANDING = {
  appName: process.env.DIGEST_APP_NAME || "",
  brandColor: process.env.DIGEST_BRAND_COLOR || "",
  logoUrl: process.env.DIGEST_LOGO_URL || "",
};

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
      const { matches, since } = selectDigestNofos(activeNofos, prefs, frequency, now);

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

      await sendDigest(email, matches, frequency, {
        dateRange: { from: since.toISOString(), to: nowISO },
      });
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

async function sendDigest(email, nofos, frequency, extra = {}) {
  const { subject, html, text } = buildDigest(nofos, frequency, {
    appUrl: APP_URL,
    branding: BRANDING,
    dateRange: extra.dateRange,
  });

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: SENDER,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: text },
            Html: { Data: html },
          },
        },
      },
    })
  );
}

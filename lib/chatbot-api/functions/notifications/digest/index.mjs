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
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  buildDigest,
  selectDigestNofos,
  selectDigestSections,
  makeUnsubscribeToken,
} from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const cognitoClient = new CognitoIdentityProviderClient({ region });
const sesClient = new SESv2Client({ region });
const secretsClient = new SecretsManagerClient({ region });

const PREFS_TABLE = process.env.USER_NOTIFICATION_PREFS_TABLE_NAME;
const NOFO_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
const SENDER = process.env.NOTIFICATION_SENDER || "no-reply@grantwell.us";
const APP_URL = process.env.DEPLOYMENT_URL || "";
const UNSUBSCRIBE_SECRET_ARN = process.env.UNSUBSCRIBE_SECRET_ARN || "";
// The unsubscribe endpoint's public base URL. Falls back to the app URL; the digest still sends
// (just without an unsubscribe link) if neither this nor the secret is configured.
const UNSUBSCRIBE_URL_BASE = process.env.UNSUBSCRIBE_URL_BASE || (APP_URL ? `${APP_URL}/unsubscribe` : "");

// Branding is pulled from the instance config at deploy (injected as env), so the email
// matches the GrantWell UI. Not admin-editable — one source of truth is the instance config.
const BRANDING = {
  appName: process.env.DIGEST_APP_NAME || "",
  brandColor: process.env.DIGEST_BRAND_COLOR || "",
  logoUrl: process.env.DIGEST_LOGO_URL || "",
  postalAddress: process.env.DIGEST_POSTAL_ADDRESS || "",
  supportEmail: process.env.DIGEST_SUPPORT_EMAIL || "",
};
// Sectioned digest with New / Closing soon / Still open fallback. Off by default so production keeps
// today's new-only behavior until this is flipped on deliberately.
const DIGEST_V2 = process.env.DIGEST_V2 === "true";

// Cached across warm invocations; the signing secret is stable.
let cachedUnsubscribeSecret;
async function getUnsubscribeSecret() {
  if (cachedUnsubscribeSecret !== undefined) return cachedUnsubscribeSecret;
  if (!UNSUBSCRIBE_SECRET_ARN) {
    cachedUnsubscribeSecret = "";
    return cachedUnsubscribeSecret;
  }
  try {
    const res = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: UNSUBSCRIBE_SECRET_ARN })
    );
    cachedUnsubscribeSecret = res.SecretString || "";
  } catch (error) {
    console.error("Could not load unsubscribe secret; sending without unsubscribe links:", error);
    cachedUnsubscribeSecret = "";
  }
  return cachedUnsubscribeSecret;
}

function unsubscribeUrlFor(userId, secret) {
  if (!secret || !UNSUBSCRIBE_URL_BASE) return "";
  const token = makeUnsubscribeToken(userId, secret);
  return token ? `${UNSUBSCRIBE_URL_BASE}?token=${encodeURIComponent(token)}` : "";
}

export const handler = async (event) => {
  const frequency = event?.frequency === "weekly" ? "weekly" : "daily";
  if (!PREFS_TABLE || !NOFO_TABLE || !USER_POOL_ID) {
    throw new Error("Notification digest is not configured");
  }

  const now = new Date();
  const stats = { candidates: 0, sent: 0, empty: 0, errors: 0 };
  const unsubscribeSecret = await getUnsubscribeSecret();

  const users = await queryPrefs(frequency);
  const activeNofos = await queryActiveNofos();
  // Watermark ceiling is the moment we read the NOFO set, not the (later) moment of each write.
  // Anchoring to `now` would skip any NOFO that turns active between this read and the watermark
  // update, dropping it from every future digest. Selection uses this same instant as its window.
  const watermarkISO = now.toISOString();

  for (const prefs of users) {
    stats.candidates++;
    try {
      // V2 sends when there's any relevant content (new OR closing-soon OR still-open); the classic
      // path sends only on new matches. Either way the watermark advances so the window moves on.
      let sendArgs = null;
      if (DIGEST_V2) {
        const sections = selectDigestSections(activeNofos, prefs, frequency, now);
        if (sections.total > 0) {
          sendArgs = {
            sections,
            dateRange: { from: sections.since.toISOString(), to: watermarkISO },
          };
        }
      } else {
        const { matches, since } = selectDigestNofos(activeNofos, prefs, frequency, now);
        if (matches.length > 0) {
          sendArgs = { matches, dateRange: { from: since.toISOString(), to: watermarkISO } };
        }
      }

      if (!sendArgs) {
        stats.empty++;
        // Still advance the watermark so an idle user's next digest window starts here.
        await advanceWatermark(prefs.user_id, watermarkISO);
        continue;
      }

      const email = await resolveEmail(prefs.user_id);
      if (!email) {
        stats.errors++;
        continue;
      }

      await sendDigest(email, frequency, {
        ...sendArgs,
        unsubscribeUrl: unsubscribeUrlFor(prefs.user_id, unsubscribeSecret),
      });
      await advanceWatermark(prefs.user_id, watermarkISO);
      stats.sent++;
    } catch (error) {
      stats.errors++;
      console.error(`Digest failed for user ${prefs.user_id}:`, error);
    }
  }

  console.log("Digest run complete:", frequency, stats);
  return { frequency, stats };
};

async function queryPrefs(frequency) {
  // Query the FrequencyIndex GSI instead of scanning the whole prefs table and filtering — the run
  // only cares about users on this cadence. `frequency` is a DynamoDB reserved word, hence the alias.
  const out = [];
  let lastKey;
  do {
    const res = await dynamoClient.send(
      new QueryCommand({
        TableName: PREFS_TABLE,
        IndexName: "FrequencyIndex",
        KeyConditionExpression: "#frequency = :f",
        ExpressionAttributeNames: { "#frequency": "frequency" },
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

async function sendDigest(email, frequency, args = {}) {
  const { subject, html, text } = buildDigest(args.matches || [], frequency, {
    appUrl: APP_URL,
    branding: BRANDING,
    sections: args.sections,
    dateRange: args.dateRange,
    unsubscribeUrl: args.unsubscribeUrl,
  });

  // RFC 8058 one-click unsubscribe: the headers let Gmail/Yahoo show a native "Unsubscribe" control
  // and are increasingly required for bulk-sender inbox placement. Only added when we have a URL.
  const headers = args.unsubscribeUrl
    ? [
        { Name: "List-Unsubscribe", Value: `<${args.unsubscribeUrl}>` },
        { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
      ]
    : undefined;

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
          ...(headers ? { Headers: headers } : {}),
        },
      },
    })
  );
}

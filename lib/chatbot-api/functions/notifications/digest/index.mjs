/**
 * NOFO digest Lambda.
 *
 * Invoked by two EventBridge Scheduler schedules — a daily and a weekly cron — each passing
 * { frequency: "daily" | "weekly" }. For every user whose prefs match that frequency,
 * it queries NOFOs that turned active since the user's last_sent watermark, filters by
 * the user's subscribed states / categories / keywords, and emails a single digest via
 * SES. last_sent is advanced only after a successful send.
 */

import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
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
// The unsubscribe endpoint's public base URL, injected by the CDK once the API exists.
const UNSUBSCRIBE_URL_BASE = process.env.UNSUBSCRIBE_URL_BASE || (APP_URL ? `${APP_URL}/unsubscribe` : "");
const SEND_LOG_TABLE = process.env.DIGEST_SEND_LOG_TABLE_NAME || "";
const SUPPRESSION_TABLE = process.env.DIGEST_SUPPRESSION_TABLE_NAME || "";
const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET || "";
const SEND_LOG_TTL_DAYS = 90;

// Branding is pulled from the instance config at deploy (injected as env), so the email
// matches the GrantWell UI. Not admin-editable — one source of truth is the instance config.
const BRANDING = {
  appName: process.env.DIGEST_APP_NAME || "",
  brandColor: process.env.DIGEST_BRAND_COLOR || "",
  logoUrl: process.env.DIGEST_LOGO_URL || "",
  postalAddress: process.env.DIGEST_POSTAL_ADDRESS || "",
  supportEmail: process.env.DIGEST_SUPPORT_EMAIL || "",
};
// Sectioned digest with New / Closing soon / Still open fallback. On by default; the CDK sets
// "false" only when the flat-list kill switch is used.
const DIGEST_V2 = process.env.DIGEST_V2 !== "false";

// Cached across warm invocations; the signing secret is stable.
let cachedUnsubscribeSecret;
async function getUnsubscribeSecret() {
  if (cachedUnsubscribeSecret !== undefined) return cachedUnsubscribeSecret;
  if (!UNSUBSCRIBE_SECRET_ARN) {
    cachedUnsubscribeSecret = "";
    return cachedUnsubscribeSecret;
  }
  // Fail closed: bulk mail with no one-click unsubscribe link violates CAN-SPAM and the
  // Gmail/Yahoo bulk-sender rules, so abort rather than send non-compliant mail.
  const res = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: UNSUBSCRIBE_SECRET_ARN })
  );
  cachedUnsubscribeSecret = res.SecretString || "";
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
  const stats = { candidates: 0, sent: 0, empty: 0, skipped: 0, suppressed: 0, errors: 0 };
  const unsubscribeSecret = await getUnsubscribeSecret();

  // `onlyUserId` targets one user (the "send to me" path) regardless of their stored cadence; absent
  // it, this is the normal run over everyone on this frequency.
  const onlyUserId = event?.onlyUserId;
  const users = onlyUserId
    ? await getPrefsForUser(onlyUserId)
    : await queryPrefs(frequency);
  const activeNofos = await queryActiveNofos();
  // Watermark ceiling is the moment we read the NOFO set, not the (later) moment of each write.
  // Anchoring to `now` would skip any NOFO that turns active between this read and the watermark
  // update, dropping it from every future digest. Selection uses this same instant as its window.
  const watermarkISO = now.toISOString();
  // Not watermarkISO: that's a per-invocation instant, so two overlapping runs would write
  // different keys and both mail the user. Bucketing to the cadence makes them collide.
  const runWindow = `${frequency}#${sendWindowKey(now, frequency)}`;

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

      const matchCount = sendArgs.sections ? sendArgs.sections.total : sendArgs.matches.length;

      if (await isSuppressed(email)) {
        console.log(`Skipping suppressed address for user ${prefs.user_id}`);
        await writeSendLog(prefs.user_id, runWindow, frequency, matchCount, {
          status: "suppressed",
        });
        // Advance anyway: a suppressed address never accepts mail, and not advancing would pin
        // the watermark and re-select the same NOFOs forever.
        await advanceWatermark(prefs.user_id, watermarkISO);
        stats.suppressed++;
        continue;
      }

      // The developer "send to me" path is an explicit manual request, so it must not be swallowed
      // by the claim the scheduled run already took for this window.
      if (!onlyUserId && !(await claimSend(prefs.user_id, runWindow, frequency, matchCount))) {
        stats.skipped++;
        continue;
      }

      const unsubscribeUrl = unsubscribeUrlFor(prefs.user_id, unsubscribeSecret);
      if (!unsubscribeUrl) {
        throw new Error("Refusing to send: no one-click unsubscribe URL available");
      }

      try {
        const messageId = await sendDigest(email, frequency, { ...sendArgs, unsubscribeUrl });
        await updateSendLog(prefs.user_id, runWindow, { status: "sent", messageId });
      } catch (error) {
        // Release the claim: holding it would block every retry until the window rolls over, which
        // for the weekly cadence means silently skipping the user for a whole week.
        await releaseClaim(prefs.user_id, runWindow, error);
        throw error;
      }
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

async function getPrefsForUser(userId) {
  const res = await dynamoClient.send(
    new GetItemCommand({
      TableName: PREFS_TABLE,
      Key: marshall({ user_id: userId }),
    })
  );
  return res.Item ? [unmarshall(res.Item)] : [];
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

async function isSuppressed(email) {
  if (!SUPPRESSION_TABLE) return false;
  const res = await dynamoClient.send(
    new GetItemCommand({
      TableName: SUPPRESSION_TABLE,
      Key: marshall({ email: email.toLowerCase() }),
    })
  );
  return Boolean(res.Item);
}

function sendLogExpiry() {
  return Math.floor(Date.now() / 1000) + SEND_LOG_TTL_DAYS * 86400;
}

async function writeSendLog(userId, sentAt, frequency, matchCount, extra = {}) {
  if (!SEND_LOG_TABLE) return;
  await dynamoClient.send(
    new PutItemCommand({
      TableName: SEND_LOG_TABLE,
      Item: marshall(
        {
          user_id: userId,
          sent_at: sentAt,
          frequency,
          match_count: matchCount,
          expires_at: sendLogExpiry(),
          ...extra,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

// Stable per-cadence bucket: UTC date for daily, ISO year-week for weekly.
function sendWindowKey(now, frequency) {
  const iso = now.toISOString().slice(0, 10);
  if (frequency !== "weekly") return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  // Shift to the Thursday of this ISO week, whose year and week number define the week.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Claims (user, window) so a retry or double-fire can't mail the user twice.
async function claimSend(userId, sentAt, frequency, matchCount) {
  if (!SEND_LOG_TABLE) return true;
  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: SEND_LOG_TABLE,
        Item: marshall({
          user_id: userId,
          sent_at: sentAt,
          frequency,
          match_count: matchCount,
          status: "sent",
          expires_at: sendLogExpiry(),
        }),
        ConditionExpression: "attribute_not_exists(user_id) AND attribute_not_exists(sent_at)",
      })
    );
    return true;
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      console.log(`Digest already claimed for user ${userId} at ${sentAt}; skipping`);
      return false;
    }
    throw error;
  }
}

async function updateSendLog(userId, sentAt, { status, messageId, error }) {
  if (!SEND_LOG_TABLE) return;
  const names = { "#status": "status" };
  const values = { ":status": status };
  const sets = ["#status = :status"];
  if (messageId) {
    names["#message_id"] = "message_id";
    values[":message_id"] = messageId;
    sets.push("#message_id = :message_id");
  }
  if (error) {
    names["#error"] = "error";
    values[":error"] = String(error).slice(0, 1000);
    sets.push("#error = :error");
  }
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: SEND_LOG_TABLE,
        Key: marshall({ user_id: userId, sent_at: sentAt }),
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: marshall(values),
      })
    );
  } catch (logError) {
    console.error(`Could not update send log for ${userId}:`, logError);
  }
}

// Drops the claim so the next run can retry, keeping the failure visible in CloudWatch instead.
async function releaseClaim(userId, sentAt, error) {
  console.error(`Digest send failed for ${userId} at ${sentAt}:`, error);
  if (!SEND_LOG_TABLE) return;
  try {
    await dynamoClient.send(
      new DeleteItemCommand({
        TableName: SEND_LOG_TABLE,
        Key: marshall({ user_id: userId, sent_at: sentAt }),
      })
    );
  } catch (logError) {
    console.error(`Could not release send claim for ${userId}:`, logError);
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

  const res = await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: SENDER,
      Destination: { ToAddresses: [email] },
      ...(SES_CONFIGURATION_SET ? { ConfigurationSetName: SES_CONFIGURATION_SET } : {}),
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
  return res.MessageId || "";
}

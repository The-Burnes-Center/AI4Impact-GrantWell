/**
 * SES bounce/complaint/delivery events, via the digest config set's SNS topic.
 *
 * A hard bounce or complaint writes the recipient to the suppression table — the gate the digest
 * checks before every send — then best-effort flips that user's prefs to "off". The suppression row
 * is what actually stops mail, so failing to resolve the user is logged, not fatal.
 *
 * Transient bounces aren't suppressed: SES retries them, and a full mailbox isn't a reason to stop
 * mailing a valid address.
 */

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const cognitoClient = new CognitoIdentityProviderClient({ region });

const SUPPRESSION_TABLE = process.env.DIGEST_SUPPRESSION_TABLE_NAME;
const PREFS_TABLE = process.env.USER_NOTIFICATION_PREFS_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;

async function resolveUserId(email) {
  if (!USER_POOL_ID) return null;
  const res = await cognitoClient.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      // Cognito's filter grammar can only escape `\"`, with no way to express a literal backslash,
      // so strip both rather than risk an unterminated filter. Values over the 256-char Filter
      // limit can't be looked up at all; the suppression row is written either way.
      Filter: `email = "${email.replace(/["\\]/g, "").slice(0, 200)}"`,
      Limit: 2,
    })
  );
  const users = res.Users || [];
  if (users.length !== 1) {
    console.log(
      `Cannot resolve ${email} to a single user (${users.length} matches); skipping prefs update`
    );
    return null;
  }
  return users[0].Attributes?.find((a) => a.Name === "sub")?.Value || null;
}

async function suppress(email, reason, detail) {
  const address = email.toLowerCase();
  await dynamoClient.send(
    new PutItemCommand({
      TableName: SUPPRESSION_TABLE,
      Item: marshall(
        {
          email: address,
          reason,
          suppressed_at: new Date().toISOString(),
          detail,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
  console.log(`Suppressed ${address} (${reason}${detail ? `/${detail}` : ""})`);

  let userId = null;
  try {
    userId = await resolveUserId(address);
  } catch (error) {
    console.error(`Cognito lookup failed for ${address}:`, error);
  }
  if (!userId) return;

  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: PREFS_TABLE,
        Key: marshall({ user_id: userId }),
        UpdateExpression:
          "SET #frequency = :frequency, updated_at = :updated_at",
        ExpressionAttributeNames: { "#frequency": "frequency" },
        ExpressionAttributeValues: marshall({
          ":frequency": "off",
          ":updated_at": new Date().toISOString(),
        }),
      })
    );
  } catch (error) {
    console.error(`Could not turn off prefs for ${userId}:`, error);
  }
}

function recipientsOf(list) {
  return (list || [])
    .map((r) => (typeof r === "string" ? r : r?.emailAddress))
    .filter(Boolean);
}

async function handleNotification(notification) {
  const type = notification.eventType || notification.notificationType;

  if (type === "Bounce") {
    const bounce = notification.bounce || {};
    const recipients = recipientsOf(bounce.bouncedRecipients);
    if (bounce.bounceType !== "Permanent") {
      console.log(
        `Transient bounce (${bounce.bounceType}/${bounce.bounceSubType}) for ${recipients.join(", ")}; not suppressing`
      );
      return;
    }
    for (const email of recipients) {
      await suppress(email, "bounce", bounce.bounceSubType);
    }
    return;
  }

  if (type === "Complaint") {
    const complaint = notification.complaint || {};
    for (const email of recipientsOf(complaint.complainedRecipients)) {
      await suppress(email, "complaint", complaint.complaintFeedbackType);
    }
    return;
  }

  if (type === "Delivery") {
    const recipients = recipientsOf(notification.delivery?.recipients);
    console.log(`Delivered to ${recipients.join(", ")}`);
    return;
  }

  console.log(`Ignoring SES event type ${type}`);
}

export const handler = async (event) => {
  if (!SUPPRESSION_TABLE || !PREFS_TABLE) {
    console.error("SES feedback handler is not configured; dropping event");
    return;
  }

  // SNS batches are all-or-nothing on throw, so isolate per record.
  for (const record of event?.Records || []) {
    try {
      await handleNotification(JSON.parse(record.Sns.Message));
    } catch (error) {
      console.error("Failed to process SES feedback record:", error);
    }
  }
};

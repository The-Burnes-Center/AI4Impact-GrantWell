/**
 * Weekday processing-queue email. EventBridge Scheduler runs it at 09:00 Eastern; when reviews are
 * waiting it sends one email to the addresses in an SSM String parameter that CDK never creates, so
 * the list stays out of the repo and can change without a deploy.
 */

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  OPEN_REVIEW_STATUSES,
  compareByDeadline,
  deadlineLabel,
  escapeDigestHtml,
  grantDeadline,
  readGrantMetadata,
} from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const sesClient = new SESv2Client({ region });
const ssmClient = new SSMClient({ region });

/** Pinned by LOG_MARKERS.queueEmailSendFailed; rewording it disarms the alarm. */
export const SEND_FAILED = "Processing queue email send failed";

const STATUS_LABELS = {
  pending_review: "Pending Review",
  failed: "Failed",
  needs_reupload: "Needs Re-upload",
};
const CHIP_COLORS = { due_soon: "#b91c1c", upcoming: "#b45309", expired: "#4b5563" };
const LIST_CAP = 50;

export const handler = async () => {
  const waiting = await waitingGrants();
  if (waiting.length === 0) {
    console.log("Processing queue is empty; no email sent");
    return { sent: false, waiting: 0 };
  }

  const parameterName = process.env.RECIPIENTS_PARAMETER;
  const recipients = await readRecipients(parameterName);
  if (recipients.length === 0) {
    console.log(`No processing-queue email recipients in SSM parameter ${parameterName}; no email sent`);
    return { sent: false, waiting: waiting.length };
  }

  const { subject, html, text } = buildQueueEmail(waiting, {
    appName: process.env.DIGEST_APP_NAME,
    brandColor: process.env.DIGEST_BRAND_COLOR,
    logoUrl: process.env.DIGEST_LOGO_URL,
    siteUrl: process.env.DEPLOYMENT_URL,
    deploymentId: process.env.DEPLOYMENT_ID,
  });

  try {
    const configurationSet = process.env.SES_CONFIGURATION_SET;
    const res = await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.NOTIFICATION_SENDER,
        Destination: { ToAddresses: recipients },
        ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: { Text: { Data: text }, Html: { Data: html } },
          },
        },
      })
    );
    console.log(`Processing queue email sent to ${recipients.length} recipient(s)`, {
      waiting: waiting.length,
      messageId: res.MessageId,
    });
    return { sent: true, waiting: waiting.length, recipients: recipients.length };
  } catch (error) {
    console.error(`${SEND_FAILED}:`, error);
    throw error;
  }
};

/** One entry per grant with an open review, the longest-waiting review standing for it. */
async function waitingGrants() {
  const reviews = [];
  for (const status of OPEN_REVIEW_STATUSES) {
    let lastKey;
    do {
      const result = await dynamoClient.send(
        new QueryCommand({
          TableName: process.env.REVIEW_TABLE_NAME,
          IndexName: "StatusIndex",
          KeyConditionExpression: "#s = :status",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: marshall({ ":status": status }),
          ExclusiveStartKey: lastKey,
        })
      );
      reviews.push(...(result.Items || []).map((item) => unmarshall(item)));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }

  const byGrant = new Map();
  for (const review of reviews) {
    const kept = byGrant.get(review.nofo_name);
    if (!kept || String(review.created_at || "") < String(kept.created_at || "")) byGrant.set(review.nofo_name, review);
  }
  const grants = [...byGrant.values()];
  const metaByName = await readGrantMetadata(dynamoClient, process.env.NOFO_METADATA_TABLE_NAME, grants.map((g) => g.nofo_name));
  const now = new Date();
  return grants
    .map((g) => ({ ...g, ...grantDeadline(metaByName.get(g.nofo_name), now) }))
    .sort(compareByDeadline);
}

async function readRecipients(parameterName) {
  if (!parameterName) return [];
  let value;
  try {
    const res = await ssmClient.send(new GetParameterCommand({ Name: parameterName }));
    value = res.Parameter?.Value || "";
  } catch (error) {
    if (error?.name === "ParameterNotFound") return [];
    throw error;
  }
  return [...new Set(value.split(",").map((s) => s.trim()).filter((s) => s.includes("@")))];
}

function formatDate(value, timeZone) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (!value || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
}

/**
 * grants: waiting grants in send order, each with nofo_name, status, created_at and grantDeadline's
 * deadline/daysLeft/urgency. Returns { subject, html, text }.
 */
export function buildQueueEmail(grants, opts = {}) {
  const appName = opts.appName || "GrantWell";
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(opts.brandColor || "") ? opts.brandColor : "#195C53";
  const logoUrl = /^https?:\/\//.test(opts.logoUrl || "") ? opts.logoUrl : "";
  const siteUrl = (opts.siteUrl || "").replace(/\/+$/, "");
  const queueUrl = siteUrl ? `${siteUrl}/admin?view=needs-attention` : "";
  let host = siteUrl;
  try {
    host = new URL(siteUrl).host;
  } catch {
    // Not a URL; show it as given.
  }
  const deployment = [host, opts.deploymentId ? `(${opts.deploymentId})` : ""].filter(Boolean).join(" ") || appName;

  const count = grants.length;
  const grantWord = count === 1 ? "grant" : "grants";
  const expiredCount = grants.filter((g) => g.urgency === "expired").length;
  const shown = grants.slice(0, LIST_CAP);
  const hidden = count - shown.length;

  const subject = `${appName}: ${count} ${grantWord} waiting in the processing queue`;
  const headline = `${count} ${grantWord} waiting for review`;
  const intro = "Soonest deadline first.";
  const expiredLine =
    expiredCount > 0
      ? `${expiredCount} ${expiredCount === 1 ? "is for a grant" : "are for grants"} whose deadline has passed. "Close all expired" in the queue closes those reviews in one step.`
      : "";
  const footer = `You're on the processing-queue list for ${deployment}; ask a developer to change it.`;

  const metaFor = (g) => {
    const parts = [g.deadline ? `Deadline: ${formatDate(g.deadline, "UTC")}` : "No deadline on file"];
    parts.push(`Status: ${STATUS_LABELS[g.status] || g.status}`);
    const since = formatDate(g.created_at, "America/New_York");
    if (since) parts.push(`In queue since ${since}`);
    return parts;
  };

  const textRows = shown
    .map((g) => {
      const label = deadlineLabel(g);
      return `- ${g.nofo_name}${label ? ` [${label}]` : ""}\n  ${metaFor(g).join(" · ")}`;
    })
    .join("\n");
  const moreText = hidden > 0 ? `\n+${hidden} more in the queue\n` : "";
  const text = [
    headline,
    "",
    intro,
    ...(expiredLine ? ["", expiredLine] : []),
    "",
    textRows,
    moreText,
    queueUrl ? `Open the processing queue: ${queueUrl}` : "",
    "",
    footer,
    "",
  ].join("\n");

  const chip = (g) => {
    const label = deadlineLabel(g);
    if (!label) return "";
    return ` <span style="display:inline-block;background:${CHIP_COLORS[g.urgency]};color:#fff;font-size:11px;font-weight:600;padding:1px 6px;border-radius:10px;vertical-align:middle;">${escapeDigestHtml(label)}</span>`;
  };
  const rows = shown
    .map(
      (g) =>
        `<tr><td style="padding:6px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;"><tr><td style="border:1px solid #e0e0e0;border-radius:8px;padding:14px 16px;background:#ffffff;"><span style="font-size:15px;font-weight:700;line-height:1.3;">${escapeDigestHtml(g.nofo_name)}</span>${chip(g)}<div style="color:#5a5a5a;font-size:13px;margin-top:6px;">${metaFor(g).map(escapeDigestHtml).join(" &middot; ")}</div></td></tr></table></td></tr>`
    )
    .join("");
  const moreHtml = hidden > 0 ? `<tr><td style="padding:10px 0 2px;font-size:14px;color:#4b5563;">+${hidden} more in the queue</td></tr>` : "";
  const expiredHtml = expiredLine
    ? `<p style="font-size:14px;margin:12px 0 0;padding:10px 12px;background:#f3f4f6;border-radius:6px;color:#374151;">${escapeDigestHtml(expiredLine)}</p>`
    : "";
  const buttonHtml = queueUrl
    ? `<p style="margin:20px 0 4px;"><a href="${escapeDigestHtml(queueUrl)}" style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:10px 18px;border-radius:6px;">Open the processing queue</a></p>`
    : "";
  const logoImg = logoUrl
    ? `<img src="${escapeDigestHtml(logoUrl)}" alt="${escapeDigestHtml(appName)}" width="141" height="28" style="width:141px;height:28px;vertical-align:middle;border:0;" />`
    : "";
  const titleHtml = `<span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.01em;vertical-align:middle;${logoImg ? "margin-left:10px;" : ""}">Processing queue</span>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr><td style="background:${brandColor};padding:16px 20px;border-radius:8px 8px 0 0;">${logoImg}${titleHtml}</td></tr>
    <tr><td style="padding:20px;">
      <p style="font-size:17px;font-weight:700;margin:0 0 4px;color:#1f2937;">${escapeDigestHtml(headline)}</p>
      <p style="font-size:15px;margin-top:0;color:#4b5563;">${escapeDigestHtml(intro)}</p>
      ${expiredHtml}
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:8px;">${rows}${moreHtml}</table>
      ${buttonHtml}
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">${escapeDigestHtml(footer)}</p>
    </td></tr>
  </table>
</div>`;

  return { subject, html, text };
}

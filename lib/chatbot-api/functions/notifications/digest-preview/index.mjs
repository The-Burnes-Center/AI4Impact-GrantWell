/**
 * Developer-only digest preview + test send. Read-only: the digest's copy and branding come
 * from the instance config (injected as env), not from any editable store, so the preview
 * shows exactly what users receive.
 *
 * GET  /notification-digest/preview?frequency=daily  → { rendered } (real template, sample data)
 * POST /notification-digest/preview?frequency=daily  → sends the sample digest to the caller's email
 */

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { buildDigest } from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const sesClient = new SESv2Client({ region });

const APP_URL = process.env.DEPLOYMENT_URL || "";
const SENDER = process.env.NOTIFICATION_SENDER || "no-reply@grantwell.us";
const BRANDING = {
  appName: process.env.DIGEST_APP_NAME || "",
  brandColor: process.env.DIGEST_BRAND_COLOR || "",
  logoUrl: process.env.DIGEST_LOGO_URL || "",
};

const SAMPLE_NOFOS = [
  {
    nofo_name: "Community Development Block Grant 2026",
    agency: "Dept. of Housing & Urban Development",
    category: "Community Development",
    expiration_date: "2026-08-15",
  },
  {
    nofo_name: "Rural Broadband Infrastructure Program",
    agency: "Dept. of Agriculture",
    category: "Infrastructure Investment and Jobs Act",
    expiration_date: "2026-09-01",
  },
  {
    nofo_name: "Workforce Innovation & Opportunity Fund",
    agency: "Dept. of Labor",
    category: "Employment, Labor, and Training",
    expiration_date: "2026-07-30",
  },
];

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

  const method = event.requestContext?.http?.method || "GET";
  const frequency =
    event?.queryStringParameters?.frequency === "weekly" ? "weekly" : "daily";

  try {
    const rendered = buildDigest(SAMPLE_NOFOS, frequency, {
      appUrl: APP_URL,
      branding: BRANDING,
    });

    if (method === "POST") {
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
      return respond(200, { message: `Test digest sent to ${email}` });
    }

    return respond(200, { rendered });
  } catch (error) {
    console.error("Digest preview error:", error);
    return respond(500, { message: "Digest preview request failed" });
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

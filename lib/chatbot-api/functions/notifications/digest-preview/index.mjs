/**
 * Developer-only digest preview + editable copy/branding + test send.
 *
 * GET  /notification-digest/preview?frequency=daily
 *        Returns { config, rendered } — saved copy/branding plus the real template
 *        rendered with sample data. Optional query params (subject/intro/footer/
 *        appName/brandColor/logoUrl) give a live, unsaved preview.
 * PUT  /notification-digest/preview   body: { subject, intro, footer, appName, brandColor, logoUrl }
 *        Persists config to the shared CONFIG row; returns { config, rendered }.
 * POST /notification-digest/preview?frequency=daily
 *        Sends the sample digest (with saved config) to the caller's own email.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { buildDigest } from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });
const sesClient = new SESv2Client({ region });

const CONFIG_TABLE = process.env.FEATURE_ROLLOUT_TABLE_NAME;
const APP_URL = process.env.DEPLOYMENT_URL || "";
const SENDER = process.env.NOTIFICATION_SENDER || "no-reply@grantwell.us";
const CONFIG_KEY = { featureKey: "notification-digest", subjectKey: "CONFIG" };

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
  "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST",
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
    if (method === "PUT") {
      const config = normalizeConfig(parseBody(event.body));
      await saveConfig(config);
      return respond(200, { config, rendered: render(frequency, config) });
    }

    if (method === "POST") {
      const email = claims.email;
      if (!email) {
        return respond(400, { message: "Your account has no email address" });
      }
      const config = await loadConfig();
      const { subject, html, text } = render(frequency, config);
      await sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: SENDER,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: { Data: `[TEST] ${subject}` },
              Body: { Text: { Data: text }, Html: { Data: html } },
            },
          },
        })
      );
      return respond(200, { message: `Test digest sent to ${email}` });
    }

    // GET — optional live overrides via query params (unsaved preview).
    const saved = await loadConfig();
    const overrides = normalizeConfig(event?.queryStringParameters || {});
    const effective = mergeConfig(saved, overrides);
    return respond(200, { config: saved, rendered: render(frequency, effective) });
  } catch (error) {
    console.error("Digest preview error:", error);
    return respond(500, { message: "Digest preview request failed" });
  }
};

function render(frequency, config) {
  // Empty strings fall back to template defaults (buildDigest treats "" as absent).
  const copy = {};
  if (config.subject) copy.subject = config.subject;
  if (config.intro) copy.intro = config.intro;
  if (config.footer) copy.footer = config.footer;
  return buildDigest(SAMPLE_NOFOS, frequency, {
    appUrl: APP_URL,
    copy,
    branding: {
      appName: config.appName,
      brandColor: config.brandColor,
      logoUrl: config.logoUrl,
    },
  });
}

async function loadConfig() {
  if (!CONFIG_TABLE) return emptyConfig();
  const res = await dynamoClient.send(
    new GetItemCommand({ TableName: CONFIG_TABLE, Key: marshall(CONFIG_KEY) })
  );
  if (!res.Item) return emptyConfig();
  const item = unmarshall(res.Item);
  return {
    subject: item.subject || "",
    intro: item.intro || "",
    footer: item.footer || "",
    appName: item.appName || "",
    brandColor: item.brandColor || "",
    logoUrl: item.logoUrl || "",
  };
}

async function saveConfig(config) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: CONFIG_TABLE,
      Item: marshall({
        ...CONFIG_KEY,
        ...config,
        updatedAt: new Date().toISOString(),
      }),
    })
  );
}

function emptyConfig() {
  return { subject: "", intro: "", footer: "", appName: "", brandColor: "", logoUrl: "" };
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeConfig(src) {
  return {
    subject: str(src.subject),
    intro: str(src.intro),
    footer: str(src.footer),
    appName: str(src.appName),
    brandColor: str(src.brandColor),
    logoUrl: str(src.logoUrl),
  };
}

function mergeConfig(base, overrides) {
  const out = { ...base };
  for (const k of Object.keys(overrides)) {
    if (overrides[k]) out[k] = overrides[k];
  }
  return out;
}

function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
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

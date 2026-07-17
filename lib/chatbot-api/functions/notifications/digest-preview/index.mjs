/**
 * Developer-only digest preview. Renders the REAL digest template (from the shared
 * template module the send path uses) with sample NOFOs, so developers can see how the
 * email looks without triggering a send. Returns { subject, html, text }.
 */

import { buildDigest } from "grantwell-shared";

const APP_URL = process.env.DEPLOYMENT_URL || "";

const SAMPLE_NOFOS = [
  { nofo_name: "Community Development Block Grant 2026" },
  { nofo_name: "Rural Broadband Infrastructure Program" },
  { nofo_name: "Workforce Innovation & Opportunity Fund" },
];

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return respond(200, {});
  }

  const roles = parseRoles(
    event?.requestContext?.authorizer?.jwt?.claims?.["custom:role"]
  );
  if (!roles.includes("Developer")) {
    return respond(403, { message: "Developer access required" });
  }

  const frequency =
    event?.queryStringParameters?.frequency === "weekly" ? "weekly" : "daily";
  const digest = buildDigest(SAMPLE_NOFOS, frequency, { appUrl: APP_URL });
  return respond(200, digest);
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

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { touchLastActive } from "grantwell-shared";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });

const TABLE_NAME = process.env.ANALYTICS_TABLE_NAME;
const PROFILE_SK = "PROFILE";
const MAX_FIELD = 200;
// The deployment's Region choices; empty means no Region question.
const REGIONS = JSON.parse(process.env.REGIONS || "[]");
// The structured profile step's choices (types as [name, organization, location]); null for the
// Department / Organization / Role form.
const FORM = process.env.PROFILE_FORM ? JSON.parse(process.env.PROFILE_FORM) : null;
// Must match MAX_RECENTLY_VIEWED in the web app's recently-viewed helper.
const MAX_RECENTLY_VIEWED = 6;
const MAX_RECENTLY_VIEWED_INPUT = 25;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PUT",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return respond(200, {});
    }
    if (!TABLE_NAME) {
      return respond(500, { message: "User profile is not configured" });
    }

    const { userId, state } = getUserContext(event);
    const method = event.requestContext?.http?.method || "GET";
    const path = event.requestContext?.http?.path || event.rawPath || "";
    const isRecentlyViewed = path.replace(/\/+$/, "").endsWith("/recently-viewed");

    if (isRecentlyViewed) {
      if (method === "GET") {
        return respond(200, { items: await getRecentlyViewed(userId) });
      }
      if (method === "PUT") {
        const body = parseBody(event.body);
        const incoming = validateRecentlyViewed(body.items);
        const items =
          body.mode === "replace"
            ? incoming.slice(0, MAX_RECENTLY_VIEWED)
            : mergeRecentlyViewed(incoming, await getRecentlyViewed(userId));
        await putRecentlyViewed(userId, items);
        return respond(200, { items });
      }
      return respond(405, { message: "Method not allowed" });
    }

    if (method === "GET") {
      // Reading the profile is a real sign of life; keep last_active fresh here.
      await touchLastActive(userId, state);
      return respond(200, await getProfile(userId));
    }
    if (method === "PUT") {
      const body = parseBody(event.body);
      const fields = validateProfile(body);
      await putProfile(userId, { ...fields, state });
      return respond(200, await getProfile(userId));
    }
    return respond(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("User profile error:", error);
    return respond(error?.statusCode || 500, {
      message: error?.message || "User profile request failed",
    });
  }
};

function getUserContext(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const userId = claims.sub || claims["cognito:username"] || "";
  if (!userId) {
    const error = new Error("Authenticated user is missing");
    error.statusCode = 401;
    throw error;
  }
  return {
    userId: String(userId),
    state: String(claims["custom:state"] || "").trim().toUpperCase(),
  };
}

function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function cleanField(value, label) {
  const v = String(value ?? "").trim();
  if (!v) {
    const error = new Error(`${label} is required`);
    error.statusCode = 400;
    throw error;
  }
  return v.slice(0, MAX_FIELD);
}

// Agency, Organization and Role/Title are all required (hard-block profile gate), and Region too
// when the deployment asks it.
function validateProfile(body) {
  if (FORM) return validateFormProfile(body);
  const fields = {
    agency: cleanField(body.agency, "Agency"),
    organization: cleanField(body.organization, "Organization"),
    jobTitle: cleanField(body.jobTitle, "Role/Title"),
  };
  if (REGIONS.length === 0) return fields;
  const region = cleanField(body.region, "Region");
  if (!REGIONS.includes(region)) throw badRequest("Region must be one of the listed regions");
  return { ...fields, region };
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function formType(name) {
  const t = FORM.types.find(([n]) => n === name);
  return t ? { name: t[0], organization: t[1], location: t[2] } : null;
}

function validateFormProfile(body) {
  const type = formType(String(body.applicantType ?? "").trim());
  if (!type) throw badRequest("Applicant type must be one of the listed types");
  const fields = { applicantType: type.name, jobTitle: cleanField(body.jobTitle, "Role"), organization: "", locations: [] };
  if (type.organization === "entity") {
    fields.organization = cleanField(body.organization, "Entity");
    if (!FORM.entities.includes(fields.organization)) throw badRequest("Entity must be one of the listed entities");
  } else if (type.organization === "name") {
    fields.organization = cleanField(body.organization, "Organization name");
  }
  if (type.location) {
    const picked = Array.isArray(body.locations) ? [...new Set(body.locations.map((l) => String(l ?? "").trim()))] : [];
    if (picked.length === 0) throw badRequest("Choose at least one location");
    if (picked.includes(FORM.all) ? picked.length > 1 : !picked.every((l) => FORM.locations.includes(l))) {
      throw badRequest(`Locations must be ${FORM.all} or listed locations`);
    }
    fields.locations = picked;
  }
  return fields;
}

function formProfileComplete({ applicantType, organization, jobTitle, locations }) {
  const type = formType(applicantType);
  if (!type || !jobTitle) return false;
  if (type.organization === "entity" && !FORM.entities.includes(organization)) return false;
  if (type.organization === "name" && !organization) return false;
  if (!type.location) return true;
  if (locations.length === 0) return false;
  return locations.includes(FORM.all) ? locations.length === 1 : locations.every((l) => FORM.locations.includes(l));
}

async function getProfile(userId) {
  const response = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: `USER#${userId}`, sk: PROFILE_SK }),
    })
  );
  const item = response.Item ? unmarshall(response.Item) : {};
  const agency = typeof item.agency === "string" ? item.agency : "";
  const organization = typeof item.organization === "string" ? item.organization : "";
  const jobTitle = typeof item.job_title === "string" ? item.job_title : "";
  const region = typeof item.region === "string" ? item.region : "";
  if (FORM) {
    const fields = {
      applicantType: typeof item.applicant_type === "string" ? item.applicant_type : "",
      organization,
      jobTitle,
      locations: Array.isArray(item.locations) ? item.locations.filter((l) => typeof l === "string") : [],
    };
    // Rows saved by the old form have no applicant type, so those users answer the new one.
    return { ...fields, state: typeof item.state === "string" ? item.state : "", profileComplete: formProfileComplete(fields) };
  }
  return {
    agency,
    organization,
    jobTitle,
    region,
    state: typeof item.state === "string" ? item.state : "",
    // A region dropped from the config counts as missing, so the user picks again.
    profileComplete: Boolean(agency && organization && jobTitle && (REGIONS.length === 0 || REGIONS.includes(region))),
  };
}

async function putProfile(userId, fields) {
  if (FORM) return putFormProfile(userId, fields);
  const iso = new Date().toISOString();
  // UpdateItem (not Put) so we never touch last_active_at / ttl on the same row. This row is a
  // PROFILE row — it must never carry a ttl.
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: `USER#${userId}`, sk: PROFILE_SK }),
      UpdateExpression:
        "SET agency = :a, organization = :o, job_title = :j, #st = :s, profile_completed_at = :t, updated_at = :t" +
        (fields.region ? ", #rg = :r" : ""),
      ExpressionAttributeNames: { "#st": "state", ...(fields.region && { "#rg": "region" }) },
      ExpressionAttributeValues: marshall(
        {
          ":a": fields.agency,
          ":o": fields.organization,
          ":j": fields.jobTitle,
          ":s": fields.state || "",
          ":t": iso,
          ":r": fields.region,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

// Clears the old form's Department and Region, and any answer the new type doesn't ask.
async function putFormProfile(userId, fields) {
  const iso = new Date().toISOString();
  const set = ["applicant_type = :a", "job_title = :j", "#st = :s", "profile_completed_at = :t", "updated_at = :t"];
  const remove = ["agency", "#rg"];
  if (fields.organization) set.push("organization = :o");
  else remove.push("organization");
  if (fields.locations.length) set.push("locations = :l");
  else remove.push("locations");
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: `USER#${userId}`, sk: PROFILE_SK }),
      UpdateExpression: `SET ${set.join(", ")} REMOVE ${remove.join(", ")}`,
      ExpressionAttributeNames: { "#st": "state", "#rg": "region" },
      ExpressionAttributeValues: marshall(
        {
          ":a": fields.applicantType,
          ":j": fields.jobTitle,
          ":s": fields.state || "",
          ":t": iso,
          ...(fields.organization && { ":o": fields.organization }),
          ...(fields.locations.length && { ":l": fields.locations }),
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

function validateRecentlyViewed(input) {
  if (!Array.isArray(input)) {
    const error = new Error("items must be an array");
    error.statusCode = 400;
    throw error;
  }
  const out = [];
  for (const raw of input.slice(0, MAX_RECENTLY_VIEWED_INPUT)) {
    const label = String(raw?.label ?? "").trim().slice(0, MAX_FIELD);
    const value = String(raw?.value ?? "").trim().slice(0, MAX_FIELD);
    if (!label || !value) continue;
    const parsed = Date.parse(raw?.lastViewed ?? "");
    out.push({
      label,
      value,
      lastViewed: Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString(),
    });
  }
  return out;
}

function mergeRecentlyViewed(incoming, stored) {
  const byValue = new Map();
  for (const item of [...incoming, ...stored]) {
    const existing = byValue.get(item.value);
    if (!existing || item.lastViewed > existing.lastViewed) {
      byValue.set(item.value, item);
    }
  }
  return [...byValue.values()]
    .sort((a, b) => (a.lastViewed < b.lastViewed ? 1 : a.lastViewed > b.lastViewed ? -1 : 0))
    .slice(0, MAX_RECENTLY_VIEWED);
}

async function getRecentlyViewed(userId) {
  const response = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: `USER#${userId}`, sk: PROFILE_SK }),
      ProjectionExpression: "recently_viewed",
    })
  );
  const item = response.Item ? unmarshall(response.Item) : {};
  return Array.isArray(item.recently_viewed) ? validateRecentlyViewed(item.recently_viewed) : [];
}

async function putRecentlyViewed(userId, items) {
  // UpdateItem, never PutItem: a PROFILE row must never gain a ttl or lose last_active_at.
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: `USER#${userId}`, sk: PROFILE_SK }),
      UpdateExpression: "SET recently_viewed = :r, updated_at = :t",
      ExpressionAttributeValues: marshall(
        { ":r": items, ":t": new Date().toISOString() },
        { removeUndefinedValues: true }
      ),
    })
  );
}

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

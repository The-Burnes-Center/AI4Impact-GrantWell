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

// Agency, Organization and Role/Title are all required (hard-block profile gate).
function validateProfile(body) {
  return {
    agency: cleanField(body.agency, "Agency"),
    organization: cleanField(body.organization, "Organization"),
    jobTitle: cleanField(body.jobTitle, "Role/Title"),
  };
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
  return {
    agency,
    organization,
    jobTitle,
    state: typeof item.state === "string" ? item.state : "",
    // Complete only once all three collected fields are present.
    profileComplete: Boolean(agency && organization && jobTitle),
  };
}

async function putProfile(userId, fields) {
  const iso = new Date().toISOString();
  // UpdateItem (not Put) so we never touch last_active_at / ttl on the same row. This row is a
  // PROFILE row — it must never carry a ttl.
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ pk: `USER#${userId}`, sk: PROFILE_SK }),
      UpdateExpression:
        "SET agency = :a, organization = :o, job_title = :j, #st = :s, profile_completed_at = :t, updated_at = :t",
      ExpressionAttributeNames: { "#st": "state" },
      ExpressionAttributeValues: marshall(
        {
          ":a": fields.agency,
          ":o": fields.organization,
          ":j": fields.jobTitle,
          ":s": fields.state || "",
          ":t": iso,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

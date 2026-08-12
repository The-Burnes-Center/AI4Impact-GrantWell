import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });

const TABLE_NAME = process.env.USER_NOTIFICATION_PREFS_TABLE_NAME;
const FREQUENCIES = new Set(["off", "daily", "weekly"]);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PUT",
  "Content-Type": "application/json",
};

const defaultPrefs = () => ({
  frequency: "off",
  state: "",
  categories: [],
  keywords: [],
  last_sent: null,
});

export const handler = async (event) => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return respond(200, {});
    }
    if (!TABLE_NAME) {
      return respond(500, { message: "Notification preferences are not configured" });
    }

    const { userId, state } = getUserContext(event);
    const method = event.requestContext?.http?.method || "GET";

    if (method === "GET") {
      return respond(200, await getPrefs(userId));
    }
    if (method === "PUT") {
      const body = parseBody(event.body);
      const prefs = validatePrefs(body);
      // State is fixed to the user's assigned custom:state, not client-chosen.
      await putPrefs(userId, { ...prefs, state });
      return respond(200, await getPrefs(userId));
    }
    return respond(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("Notification prefs error:", error);
    return respond(error?.statusCode || 500, {
      message: error?.message || "Notification preferences request failed",
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

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
}

function validatePrefs(body) {
  const frequency = String(body.frequency || "off");
  if (!FREQUENCIES.has(frequency)) {
    const error = new Error("frequency must be one of: off, daily, weekly");
    error.statusCode = 400;
    throw error;
  }
  return {
    frequency,
    categories: stringArray(body.categories),
    keywords: stringArray(body.keywords).map((k) => k.toLowerCase()),
  };
}

async function getPrefs(userId) {
  const response = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ user_id: userId }),
    })
  );
  if (!response.Item) {
    return defaultPrefs();
  }
  const item = unmarshall(response.Item);
  return {
    frequency: FREQUENCIES.has(item.frequency) ? item.frequency : "off",
    state: typeof item.state === "string" ? item.state : "",
    categories: Array.isArray(item.categories) ? item.categories : [],
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    last_sent: item.last_sent || null,
  };
}

async function putPrefs(userId, prefs) {
  // UpdateItem, not PutItem: a full overwrite would clobber last_sent and race the unsubscribe
  // Lambda, silently reverting a just-recorded opt-out.
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ user_id: userId }),
      UpdateExpression:
        "SET #frequency = :frequency, #state = :state, categories = :categories, keywords = :keywords, updated_at = :updated_at",
      ExpressionAttributeNames: {
        "#frequency": "frequency",
        "#state": "state",
      },
      ExpressionAttributeValues: marshall({
        ":frequency": prefs.frequency,
        ":state": prefs.state || "",
        ":categories": prefs.categories,
        ":keywords": prefs.keywords,
        ":updated_at": new Date().toISOString(),
      }),
    })
  );
}

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

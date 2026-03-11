import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const TABLE_NAME = process.env.FEATURE_ROLLOUT_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
const CONFIG_SUBJECT_KEY = "CONFIG";
const FEATURE_ROLLOUT_MODES = new Set(["all", "allowlisted", "disabled"]);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PATCH,PUT,DELETE",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return respond(200, {});
    }

    if (!TABLE_NAME || !USER_POOL_ID) {
      return respond(500, { message: "Feature rollouts are not configured" });
    }

    const userContext = getUserContext(event);
    const method = event.requestContext?.http?.method || "GET";
    const rawPath = event.rawPath || "";
    const featureKey = event.pathParameters?.featureKey;

    if (rawPath === "/feature-rollouts/me" && method === "GET") {
      const access = await getFeatureAccess("ai-grant-search", userContext.email);
      return respond(200, {
        email: userContext.email,
        roles: userContext.roles,
        canManageFeatureRollouts: hasRole(userContext.roles, "Developer"),
        features: {
          aiGrantSearch: access,
        },
      });
    }

    requireDeveloperManager(userContext.roles);

    if (!featureKey) {
      return respond(400, { message: "Feature key is required" });
    }

    if (rawPath.endsWith("/users") && method === "GET") {
      const query = event.queryStringParameters?.query || "";
      const role = event.queryStringParameters?.role || "";
      const [users, allowlistedUsers] = await Promise.all([
        searchUsers(query, role),
        listAllowlistedUsers(featureKey),
      ]);
      const allowlistSet = new Set(allowlistedUsers.map((item) => item.email));
      return respond(200, {
        featureKey,
        query,
        role,
        users: users.map((user) => ({
          ...user,
          hasAccess: allowlistSet.has(user.email),
        })),
      });
    }

    if (rawPath.includes("/users/") && (method === "PUT" || method === "DELETE")) {
      const email = normalizeEmail(decodeURIComponent(event.pathParameters?.email || ""));
      if (!email) {
        return respond(400, { message: "Email is required" });
      }
      if (method === "PUT") {
        await grantUserAccess(featureKey, email, userContext.email);
      } else {
        await revokeUserAccess(featureKey, email);
      }

      const access = await getFeatureAccess(featureKey, email);
      return respond(200, {
        featureKey,
        email,
        access,
      });
    }

    if (method === "GET") {
      const [config, users] = await Promise.all([
        getFeatureConfig(featureKey),
        listAllowlistedUsers(featureKey),
      ]);
      return respond(200, {
        featureKey,
        ...config,
        users,
      });
    }

    if (method === "PATCH") {
      const body = parseBody(event.body);
      if (!FEATURE_ROLLOUT_MODES.has(body.mode)) {
        return respond(400, { message: "mode must be one of: all, allowlisted, disabled" });
      }
      await putFeatureConfig(featureKey, body.mode, userContext.email);
      const updated = await getFeatureConfig(featureKey);
      return respond(200, {
        featureKey,
        ...updated,
      });
    }

    return respond(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("Feature rollout error:", error);
    const statusCode = error?.statusCode || 500;
    return respond(statusCode, {
      message: error?.message || "Feature rollout request failed",
    });
  }
};

function parseBody(body) {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function parseRoles(rawRoles) {
  if (Array.isArray(rawRoles)) {
    return rawRoles.filter((role) => typeof role === "string");
  }
  if (typeof rawRoles !== "string" || rawRoles.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawRoles);
    return Array.isArray(parsed)
      ? parsed.filter((role) => typeof role === "string")
      : [];
  } catch {
    return [rawRoles];
  }
}

function getUserContext(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const email = normalizeEmail(claims.email || claims["cognito:username"] || "");
  if (!email) {
    const error = new Error("Authenticated user email is missing");
    error.statusCode = 401;
    throw error;
  }

  return {
    email,
    roles: parseRoles(claims["custom:role"]),
  };
}

function hasAllRoles(roles, requiredRoles) {
  const roleSet = new Set(roles);
  return requiredRoles.every((role) => roleSet.has(role));
}

function hasRole(roles, requiredRole) {
  return new Set(roles).has(requiredRole);
}

function requireDeveloperManager(roles) {
  if (!hasRole(roles, "Developer")) {
    const error = new Error("User is not authorized to manage feature rollouts");
    error.statusCode = 403;
    throw error;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildUserSubjectKey(email) {
  return `USER#${normalizeEmail(email)}`;
}

async function getFeatureConfig(featureKey) {
  const response = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: {
        featureKey: { S: featureKey },
        subjectKey: { S: CONFIG_SUBJECT_KEY },
      },
    })
  );

  if (!response.Item) {
    return {
      mode: "disabled",
      updatedAt: null,
      updatedBy: null,
    };
  }

  const item = unmarshall(response.Item);
  const mode = resolveFeatureRolloutMode(item);
  return {
    mode,
    updatedAt: item.updatedAt || null,
    updatedBy: item.updatedBy || null,
  };
}

async function putFeatureConfig(featureKey, mode, updatedBy) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        featureKey: { S: featureKey },
        subjectKey: { S: CONFIG_SUBJECT_KEY },
        mode: { S: mode },
        updatedAt: { S: new Date().toISOString() },
        updatedBy: { S: updatedBy },
      },
    })
  );
}

async function listAllowlistedUsers(featureKey) {
  const response = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "featureKey = :featureKey AND begins_with(subjectKey, :subjectPrefix)",
      ExpressionAttributeValues: {
        ":featureKey": { S: featureKey },
        ":subjectPrefix": { S: "USER#" },
      },
    })
  );

  return (response.Items || [])
    .map((item) => unmarshall(item))
    .map((item) => ({
      email: normalizeEmail(item.email),
      grantedAt: item.grantedAt || null,
      grantedBy: item.grantedBy || null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function grantUserAccess(featureKey, email, grantedBy) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        featureKey: { S: featureKey },
        subjectKey: { S: buildUserSubjectKey(email) },
        email: { S: email },
        grantedAt: { S: new Date().toISOString() },
        grantedBy: { S: grantedBy },
      },
    })
  );
}

async function revokeUserAccess(featureKey, email) {
  await dynamoClient.send(
    new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: {
        featureKey: { S: featureKey },
        subjectKey: { S: buildUserSubjectKey(email) },
      },
    })
  );
}

async function getFeatureAccess(featureKey, email) {
  const [config, accessResponse] = await Promise.all([
    getFeatureConfig(featureKey),
    dynamoClient.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          featureKey: { S: featureKey },
          subjectKey: { S: buildUserSubjectKey(email) },
        },
      })
    ),
  ]);

  const allowed = Boolean(accessResponse.Item);
  const canUse = config.mode === "all" || (config.mode === "allowlisted" && allowed);
  return {
    mode: config.mode,
    isAllowlisted: allowed,
    canUse,
  };
}

function resolveFeatureRolloutMode(item) {
  if (FEATURE_ROLLOUT_MODES.has(item.mode)) {
    return item.mode;
  }

  // Backward-compatibility with the earlier boolean rollout format.
  if (item.enabled === true) {
    return "allowlisted";
  }

  return "disabled";
}

async function searchUsers(query, roleFilter) {
  const trimmedQuery = String(query || "").trim();
  const normalizedRoleFilter = normalizeRoleFilter(roleFilter);
  const command = new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Limit: 25,
    ...(trimmedQuery
      ? {
          Filter: `email ^= "${escapeFilterValue(trimmedQuery.toLowerCase())}"`,
        }
      : {}),
  });

  const response = await cognitoClient.send(command);
  return (response.Users || [])
    .map((user) => mapCognitoUser(user))
    .filter((user) => Boolean(user.email))
    .filter((user) => matchesRoleFilter(user.roles, normalizedRoleFilter))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function mapCognitoUser(user) {
  const attributes = Object.fromEntries(
    (user.Attributes || []).map((attribute) => [attribute.Name, attribute.Value || ""])
  );
  return {
    username: user.Username || "",
    email: normalizeEmail(attributes.email),
    status: user.UserStatus || "UNKNOWN",
    enabled: user.Enabled !== false,
    roles: parseRoles(attributes["custom:role"]),
  };
}

function normalizeRoleFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["admin", "developer"].includes(normalized) ? normalized : "user";
}

function matchesRoleFilter(roles, roleFilter) {
  const normalizedRoles = roles.map((role) => role.toLowerCase());
  if (roleFilter === "admin") {
    return normalizedRoles.includes("admin");
  }
  if (roleFilter === "developer") {
    return normalizedRoles.includes("developer");
  }

  return !normalizedRoles.includes("admin") && !normalizedRoles.includes("developer");
}

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

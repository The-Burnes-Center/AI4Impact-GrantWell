import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const USER_POOL_ID = process.env.USER_POOL_ID;
const ALLOWED_ROLE_PRESETS = new Map([
  ["user", ["User"]],
  ["admin", ["Admin"]],
  ["developer", ["Developer"]],
]);

const US_STATES = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PATCH",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return respond(200, {});
    }

    if (!USER_POOL_ID) {
      return respond(500, { message: "User management is not configured" });
    }

    const userContext = getUserContext(event);
    requireUserManager(userContext.roles);

    const method = event.requestContext?.http?.method || "GET";

    if (method === "GET") {
      const limit = normalizeLimit(event.queryStringParameters?.limit);
      const paginationToken = normalizePaginationToken(event.queryStringParameters?.paginationToken);
      const result = await listUsers(limit, paginationToken);
      return respond(200, result);
    }

    if (method === "PATCH") {
      const username = decodeURIComponent(event.pathParameters?.username || "").trim();
      const body = parseBody(event.body);
      const hasRolePreset = Object.prototype.hasOwnProperty.call(body, "rolePreset");
      const hasState = Object.prototype.hasOwnProperty.call(body, "state");

      if (!username) {
        return respond(400, { message: "Username is required" });
      }

      if (!hasRolePreset && !hasState) {
        return respond(400, { message: "Request must include rolePreset and/or state" });
      }

      const userAttributes = [];
      let nextRoles;

      if (hasRolePreset) {
        const rolePreset = String(body.rolePreset || "").trim().toLowerCase();
        nextRoles = ALLOWED_ROLE_PRESETS.get(rolePreset);
        if (!nextRoles) {
          return respond(400, { message: "rolePreset must be one of: user, admin, developer" });
        }
        requireRoleAssignmentPermission(userContext.roles, rolePreset);
        userAttributes.push({
          Name: "custom:role",
          Value: JSON.stringify(nextRoles),
        });
      }

      let nextState;
      if (hasState) {
        const rawState = body.state;
        nextState = rawState == null ? "" : String(rawState).trim();
        if (nextState && !US_STATES.has(nextState)) {
          return respond(400, { message: "state must be a US state name or empty" });
        }
        userAttributes.push({
          Name: "custom:state",
          Value: nextState,
        });
      }

      await cognitoClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          UserAttributes: userAttributes,
        })
      );

      return respond(200, {
        username,
        ...(nextRoles ? { roles: nextRoles } : {}),
        ...(hasState ? { state: nextState } : {}),
      });
    }

    return respond(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("User management error:", error);
    return respond(error?.statusCode || 500, {
      message: error?.message || "User management request failed",
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
  return {
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

function requireUserManager(roles) {
  if (!hasRole(roles, "Admin") && !hasRole(roles, "Developer")) {
    const error = new Error("User is not authorized to manage users");
    error.statusCode = 403;
    throw error;
  }
}

function requireRoleAssignmentPermission(roles, rolePreset) {
  const isDeveloperAssignment = rolePreset === "developer";
  if (isDeveloperAssignment && !hasRole(roles, "Developer")) {
    const error = new Error("Only developers can assign developer access");
    error.statusCode = 403;
    throw error;
  }
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.min(parsed, 60);
}

function normalizePaginationToken(value) {
  const token = String(value || "").trim();
  return token.length > 0 ? token : undefined;
}

async function listUsers(limit, paginationToken) {
  const response = await cognitoClient.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: limit,
      ...(paginationToken ? { PaginationToken: paginationToken } : {}),
    })
  );

  const users = (response.Users || [])
    .map((user) => mapCognitoUser(user))
    .filter((user) => Boolean(user.email))
    .sort((a, b) => a.email.localeCompare(b.email));

  return {
    users,
    nextPaginationToken: response.PaginationToken || null,
    pageSize: limit,
  };
}

function mapCognitoUser(user) {
  const attributes = Object.fromEntries(
    (user.Attributes || []).map((attribute) => [attribute.Name, attribute.Value || ""])
  );

  return {
    username: user.Username || "",
    email: String(attributes.email || "").trim().toLowerCase(),
    status: user.UserStatus || "UNKNOWN",
    enabled: user.Enabled !== false,
    roles: parseRoles(attributes["custom:role"]),
    state: String(attributes["custom:state"] || "").trim(),
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

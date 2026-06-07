import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
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

const SUPPORTED_STATE_CODES = new Set(
  JSON.parse(process.env.SUPPORTED_STATES || "[]")
);

// Map legacy full-name values ("California") to canonical codes on read.
const LEGACY_NAME_TO_CODE = {
  "California": "CA",
  "Colorado": "CO",
  "Rhode Island": "RI",
};

// ListUsers can't filter by custom attributes, so a state admin's view is built
// by scanning pages and filtering in memory. Bound the scan to stay safe.
const MAX_LIST_PAGES = 50;

function normalizeStoredStateCode(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (SUPPORTED_STATE_CODES.has(upper)) return upper;
  return LEGACY_NAME_TO_CODE[trimmed] || "";
}

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PATCH,DELETE",
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

    const actor = getActorContext(event);
    const scope = requireUserManager(actor);

    const method = event.requestContext?.http?.method || "GET";

    if (method === "GET") {
      return await handleList(scope, event);
    }
    if (method === "POST") {
      return await handleCreate(scope, parseBody(event.body));
    }
    if (method === "PATCH") {
      return await handleUpdate(scope, actor, event);
    }
    if (method === "DELETE") {
      return await handleDelete(scope, actor, event);
    }

    return respond(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("User management error:", error);
    return respond(error?.statusCode || 500, {
      message: error?.message || "User management request failed",
    });
  }
};

async function handleList(scope, event) {
  if (scope.kind === "stateAdmin") {
    const users = await listUsersInState(scope.state);
    return respond(200, { users, nextPaginationToken: null, pageSize: users.length });
  }

  const limit = normalizeLimit(event.queryStringParameters?.limit);
  const paginationToken = normalizePaginationToken(event.queryStringParameters?.paginationToken);
  const result = await listUsers(limit, paginationToken);
  return respond(200, result);
}

async function handleCreate(scope, body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return respond(400, { message: "A valid email address is required" });
  }

  const stateCode = resolveCreateState(scope, body.state);

  const userAttributes = [
    { Name: "email", Value: email },
    { Name: "email_verified", Value: "true" },
    { Name: "custom:role", Value: JSON.stringify(["User"]) },
  ];
  if (stateCode) {
    userAttributes.push({ Name: "custom:state", Value: stateCode });
  }

  try {
    const response = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: userAttributes,
        DesiredDeliveryMediums: ["EMAIL"],
      })
    );

    return respond(201, {
      username: response.User?.Username || email,
      email,
      roles: ["User"],
      state: stateCode,
    });
  } catch (error) {
    if (error?.name === "UsernameExistsException") {
      return respond(409, { message: "A user with this email already exists" });
    }
    throw error;
  }
}

async function handleUpdate(scope, actor, event) {
  const username = decodeURIComponent(event.pathParameters?.username || "").trim();
  if (!username) {
    return respond(400, { message: "Username is required" });
  }

  const body = parseBody(event.body);
  const hasRolePreset = Object.prototype.hasOwnProperty.call(body, "rolePreset");
  const hasState = Object.prototype.hasOwnProperty.call(body, "state");
  if (!hasRolePreset && !hasState) {
    return respond(400, { message: "Request must include rolePreset and/or state" });
  }

  // Changing your own role/state through this API is never allowed: it would let
  // a state admin clear their own state and become a platform admin.
  if (isSelf(actor, username)) {
    return respond(403, {
      message: "You cannot change your own role or state. Ask another administrator.",
    });
  }

  const target = await getTargetUser(username);
  if (!target) {
    return respond(404, { message: "User not found" });
  }
  assertCanManageTarget(scope, target);

  const userAttributes = [];
  let nextRoles;
  let nextState;

  if (hasRolePreset) {
    const rolePreset = String(body.rolePreset || "").trim().toLowerCase();
    nextRoles = ALLOWED_ROLE_PRESETS.get(rolePreset);
    if (!nextRoles) {
      return respond(400, { message: "rolePreset must be one of: user, admin, developer" });
    }
    requireRoleAssignmentPermission(scope, rolePreset);
    userAttributes.push({ Name: "custom:role", Value: JSON.stringify(nextRoles) });
  }

  if (hasState) {
    const requested = String(body.state == null ? "" : body.state).trim().toUpperCase();
    if (requested && !SUPPORTED_STATE_CODES.has(requested)) {
      return respond(400, { message: "state must be a supported state code or empty" });
    }
    if (scope.kind === "stateAdmin" && requested !== scope.state) {
      return respond(403, { message: "State admins cannot change a user's state" });
    }
    nextState = requested;
    userAttributes.push({ Name: "custom:state", Value: nextState });
  }

  // A state admin's writes always pin the user to their state, even on a role-only
  // change, so a stateless user can't be promoted into a platform admin.
  if (scope.kind === "stateAdmin" && nextState === undefined) {
    nextState = scope.state;
    userAttributes.push({ Name: "custom:state", Value: nextState });
  }

  if (hasRolePreset) {
    await assertNotLastPrivilegedUser(target, nextRoles);
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
    ...(nextState !== undefined ? { state: nextState } : {}),
  });
}

async function handleDelete(scope, actor, event) {
  const username = decodeURIComponent(event.pathParameters?.username || "").trim();
  if (!username) {
    return respond(400, { message: "Username is required" });
  }
  if (isSelf(actor, username)) {
    return respond(403, { message: "You cannot delete your own account" });
  }

  const target = await getTargetUser(username);
  if (!target) {
    return respond(404, { message: "User not found" });
  }
  assertCanManageTarget(scope, target);
  await assertNotLastPrivilegedUser(target, []);

  await cognitoClient.send(
    new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    })
  );

  return respond(200, { username, deleted: true });
}

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

function getActorContext(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  return {
    username: String(claims["cognito:username"] || "").trim(),
    roles: parseRoles(claims["custom:role"]),
    state: normalizeStoredStateCode(claims["custom:state"]),
  };
}

// Developer wins over a state claim; an Admin with a state is scoped to it.
function getActorScope(actor) {
  if (hasRole(actor.roles, "Developer")) {
    return { kind: "developer", state: "" };
  }
  if (hasRole(actor.roles, "Admin")) {
    return actor.state
      ? { kind: "stateAdmin", state: actor.state }
      : { kind: "platformAdmin", state: "" };
  }
  return { kind: "none", state: "" };
}

function requireUserManager(actor) {
  const scope = getActorScope(actor);
  if (scope.kind === "none") {
    const error = new Error("User is not authorized to manage users");
    error.statusCode = 403;
    throw error;
  }
  return scope;
}

function hasRole(roles, requiredRole) {
  return new Set(roles).has(requiredRole);
}

function isSelf(actor, username) {
  return Boolean(actor.username) && actor.username === username;
}

function assertCanManageTarget(scope, target) {
  if (scope.kind === "developer") {
    return;
  }

  // Only a developer may manage another developer.
  if (hasRole(target.roles, "Developer")) {
    const error = new Error("Only developers can manage developer accounts");
    error.statusCode = 403;
    throw error;
  }

  if (scope.kind === "stateAdmin" && target.state !== scope.state) {
    const error = new Error("You can only manage users in your state");
    error.statusCode = 403;
    throw error;
  }
}

function requireRoleAssignmentPermission(scope, rolePreset) {
  if (rolePreset === "developer" && scope.kind !== "developer") {
    const error = new Error("Only developers can assign developer access");
    error.statusCode = 403;
    throw error;
  }
}

// Best-effort guard against locking the org out by removing its last developer
// or last platform admin. nextRoles is [] for a delete.
async function assertNotLastPrivilegedUser(target, nextRoles) {
  const nextRoleSet = new Set(nextRoles || []);
  const losesDeveloper = hasRole(target.roles, "Developer") && !nextRoleSet.has("Developer");
  const losesPlatformAdmin =
    hasRole(target.roles, "Admin") && !target.state && !nextRoleSet.has("Admin");

  if (!losesDeveloper && !losesPlatformAdmin) {
    return;
  }

  const { developers, platformAdmins } = await countPrivilegedUsers();

  if (losesDeveloper && developers <= 1) {
    const error = new Error("Cannot remove the last developer");
    error.statusCode = 409;
    throw error;
  }
  if (losesPlatformAdmin && platformAdmins <= 1) {
    const error = new Error("Cannot remove the last platform administrator");
    error.statusCode = 409;
    throw error;
  }
}

async function countPrivilegedUsers() {
  let developers = 0;
  let platformAdmins = 0;
  let paginationToken;
  let pages = 0;

  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
        ...(paginationToken ? { PaginationToken: paginationToken } : {}),
      })
    );
    for (const user of response.Users || []) {
      const mapped = mapCognitoUser(user);
      if (hasRole(mapped.roles, "Developer")) {
        developers += 1;
      } else if (hasRole(mapped.roles, "Admin") && !mapped.state) {
        platformAdmins += 1;
      }
    }
    paginationToken = response.PaginationToken;
    pages += 1;
  } while (paginationToken && pages < MAX_LIST_PAGES);

  return { developers, platformAdmins };
}

function resolveCreateState(scope, rawState) {
  if (scope.kind === "stateAdmin") {
    return scope.state;
  }

  const next = String(rawState == null ? "" : rawState).trim().toUpperCase();
  if (next && !SUPPORTED_STATE_CODES.has(next)) {
    const error = new Error("state must be a supported state code or empty");
    error.statusCode = 400;
    throw error;
  }
  return next;
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

async function listUsersInState(stateCode) {
  const collected = [];
  let paginationToken;
  let pages = 0;

  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
        ...(paginationToken ? { PaginationToken: paginationToken } : {}),
      })
    );
    for (const user of response.Users || []) {
      const mapped = mapCognitoUser(user);
      if (mapped.email && mapped.state === stateCode) {
        collected.push(mapped);
      }
    }
    paginationToken = response.PaginationToken;
    pages += 1;
  } while (paginationToken && pages < MAX_LIST_PAGES);

  if (paginationToken) {
    console.warn(
      `listUsersInState hit the ${MAX_LIST_PAGES}-page cap for state ${stateCode}; results may be truncated.`
    );
  }

  return collected.sort((a, b) => a.email.localeCompare(b.email));
}

async function getTargetUser(username) {
  try {
    const response = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
    return mapAdminGetUser(response);
  } catch (error) {
    if (error?.name === "UserNotFoundException") {
      return null;
    }
    throw error;
  }
}

function mapCognitoUser(user) {
  return mapAttributes(user.Username, user.UserStatus, user.Enabled, user.Attributes);
}

// AdminGetUser exposes attributes as UserAttributes (top level), unlike ListUsers.
function mapAdminGetUser(response) {
  return mapAttributes(
    response.Username,
    response.UserStatus,
    response.Enabled,
    response.UserAttributes
  );
}

function mapAttributes(username, status, enabled, rawAttributes) {
  const attributes = Object.fromEntries(
    (rawAttributes || []).map((attribute) => [attribute.Name, attribute.Value || ""])
  );

  return {
    username: username || "",
    email: String(attributes.email || "").trim().toLowerCase(),
    status: status || "UNKNOWN",
    enabled: enabled !== false,
    roles: parseRoles(attributes["custom:role"]),
    state: normalizeStoredStateCode(attributes["custom:state"]),
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

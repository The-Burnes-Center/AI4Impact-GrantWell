import { mockClient } from "aws-sdk-client-mock";
import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);
const lambda = mockClient(LambdaClient);

const ENV = {
  USER_POOL_ID: "pool",
  SUPPORTED_STATES: JSON.stringify([{ code: "MA" }, { code: "RI" }]),
  CHAT_HISTORY_TABLE_NAME: "chats",
  DRAFT_TABLE_NAME: "drafts",
  DRAFT_VERSION_TABLE_NAME: "versions",
  ANALYTICS_TABLE_NAME: "analytics",
  USER_NOTIFICATION_PREFS_TABLE_NAME: "prefs",
  USER_DOCUMENTS_BUCKET: "user-docs",
  SYNC_KB_FUNCTION_NAME: "sync-kb",
  OUTCOME_TABLE_NAME: "outcomes",
};

async function load(env: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ...ENV, ...env })) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import("../../lib/chatbot-api/functions/user-management/users/index.mjs")).handler;
}

const ACTORS = {
  developer: { roles: ["Developer"], state: "" },
  platformAdmin: { roles: ["PlatformAdmin"], state: "" },
  legacyAdmin: { roles: ["Admin"], state: "" },
  stateAdmin: { roles: ["Admin"], state: "MA" },
} as const;
type Actor = keyof typeof ACTORS;

type Account = { roles: string[]; state: string };
const TARGETS: Record<string, Account> = {
  user: { roles: ["User"], state: "MA" },
  statelessUser: { roles: ["User"], state: "" },
  maAdmin: { roles: ["Admin"], state: "MA" },
  statelessAdmin: { roles: ["Admin"], state: "" },
  platformAdmin: { roles: ["PlatformAdmin"], state: "" },
  developer: { roles: ["Developer"], state: "" },
};

const cognitoUser = (username: string, account: Account) => ({
  Username: username,
  UserStatus: "CONFIRMED",
  Enabled: true,
  Attributes: [
    { Name: "sub", Value: `sub-${username}` },
    { Name: "email", Value: `${username}@x.org` },
    { Name: "custom:role", Value: JSON.stringify(account.roles) },
    { Name: "custom:state", Value: account.state },
  ],
});

// The pool: the target plus enough other developers and platform admins that the last-admin guard
// stays out of the way unless a test shrinks it.
function servePool(target: Account, others: Account[] = [TARGETS.developer, TARGETS.developer, TARGETS.platformAdmin, TARGETS.platformAdmin]) {
  const { Attributes, ...rest } = cognitoUser("target", target);
  cognito.on(AdminGetUserCommand).resolves({ ...rest, UserAttributes: Attributes });
  const pool = [cognitoUser("target", target), ...others.map((a, i) => cognitoUser(`other${i}`, a))];
  cognito.on(ListUsersCommand).callsFake((input) => {
    const start = Number(input.PaginationToken ?? 0);
    const end = start + 60;
    return { Users: pool.slice(start, end), PaginationToken: end < pool.length ? String(end) : undefined };
  });
  cognito.on(AdminUpdateUserAttributesCommand).resolves({});
  cognito.on(AdminDeleteUserCommand).resolves({});
}

const call = (handler: any, actor: Actor, method: string, routeKey: string, body?: unknown, context?: unknown) =>
  handler(
    {
      routeKey,
      pathParameters: { username: "target" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      requestContext: {
        http: { method },
        authorizer: {
          jwt: {
            claims: {
              "cognito:username": "actor",
              sub: "sub-actor",
              "custom:role": JSON.stringify(ACTORS[actor].roles),
              "custom:state": ACTORS[actor].state,
            },
          },
        },
      },
    },
    context
  ).then((r: { statusCode: number; body: string }) => ({ status: r.statusCode, body: JSON.parse(r.body) }));

const patch = (handler: any, actor: Actor, body: unknown, context?: unknown) =>
  call(handler, actor, "PATCH", "PATCH /user-management/users/{username}/roles", body, context);
const remove = (handler: any, actor: Actor, context?: unknown) =>
  call(handler, actor, "DELETE", "DELETE /user-management/users/{username}", undefined, context);

const written = () => {
  const calls = cognito.commandCalls(AdminUpdateUserAttributesCommand);
  return calls.length ? Object.fromEntries(calls[0].args[0].input.UserAttributes!.map((a) => [a.Name, a.Value])) : null;
};

beforeEach(() => {
  cognito.reset();
  ddb.reset();
  s3.reset();
  lambda.reset();
  ddb.onAnyCommand().resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  s3.on(ListObjectVersionsCommand).resolves({});
  lambda.on(InvokeCommand).resolves({});
});

describe("a stateless admin is a platform admin", () => {
  describe("creating one through the role editor", () => {
    it.each<[Actor, string, Record<string, unknown>, number]>([
      // Escalation paths: an admin role with no state, by role change, by clearing the state, or both.
      ["platformAdmin", "statelessUser", { rolePreset: "admin" }, 403],
      ["platformAdmin", "statelessUser", { rolePreset: "admin", state: "" }, 403],
      ["platformAdmin", "maAdmin", { state: "" }, 403],
      ["platformAdmin", "user", { rolePreset: "admin", state: "" }, 403],
      ["legacyAdmin", "statelessUser", { rolePreset: "admin" }, 403],
      ["legacyAdmin", "maAdmin", { state: "" }, 403],
      ["stateAdmin", "maAdmin", { state: "" }, 403],
      ["stateAdmin", "user", { rolePreset: "admin", state: "" }, 403],
      // The same changes with a state are fine.
      ["platformAdmin", "statelessUser", { rolePreset: "admin", state: "RI" }, 200],
      ["platformAdmin", "maAdmin", { state: "RI" }, 200],
      ["legacyAdmin", "user", { rolePreset: "admin" }, 200],
      ["stateAdmin", "user", { rolePreset: "admin" }, 200],
      ["stateAdmin", "statelessUser", { rolePreset: "admin" }, 403],
      // A developer may make one.
      ["developer", "statelessUser", { rolePreset: "admin" }, 200],
      ["developer", "maAdmin", { state: "" }, 200],
    ])("%s on a %s with %j gets %i", async (actor, target, body, status) => {
      const handler = await load();
      servePool(TARGETS[target]);
      const res = await patch(handler, actor, body);
      expect(res.status).toBe(status);
      if (status !== 200) expect(written()).toBeNull();
    });

    it("keeps a state admin's promotion in their state", async () => {
      const handler = await load();
      servePool(TARGETS.user);
      expect((await patch(handler, "stateAdmin", { rolePreset: "admin" })).status).toBe(200);
      expect(written()).toEqual({ "custom:role": '["Admin"]', "custom:state": "MA" });
    });

    it("refuses it with the legacy rule off too", async () => {
      const handler = await load({ LEGACY_STATELESS_ADMIN_IS_PLATFORM: "false" });
      servePool(TARGETS.statelessUser);
      expect((await patch(handler, "platformAdmin", { rolePreset: "admin" })).status).toBe(403);
      expect(written()).toBeNull();
    });
  });

  describe("changing or deleting an existing one", () => {
    it.each<[Actor, string]>([
      ["platformAdmin", "statelessAdmin"],
      ["legacyAdmin", "statelessAdmin"],
      ["platformAdmin", "platformAdmin"],
      ["platformAdmin", "developer"],
      ["stateAdmin", "statelessAdmin"],
    ])("refuses %s changing, deleting or resetting a %s", async (actor, target) => {
      const handler = await load();
      servePool(TARGETS[target]);
      expect((await patch(handler, actor, { rolePreset: "user" })).status).toBe(403);
      expect((await patch(handler, actor, { state: "MA" })).status).toBe(403);
      expect((await remove(handler, actor)).status).toBe(403);
      expect((await call(handler, actor, "POST", "POST /user-management/users/{username}/mfa-reset")).status).toBe(403);
      expect(written()).toBeNull();
      expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
    });

    it("lets a developer demote, scope or delete a stateless admin", async () => {
      const handler = await load();
      servePool(TARGETS.statelessAdmin);
      expect((await patch(handler, "developer", { rolePreset: "user" })).status).toBe(200);
      expect((await patch(handler, "developer", { state: "MA" })).status).toBe(200);
      expect((await remove(handler, "developer")).status).toBe(200);
      expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(1);
    });

    it("still lets a platform admin manage a state-scoped admin", async () => {
      const handler = await load();
      servePool(TARGETS.maAdmin);
      expect((await patch(handler, "platformAdmin", { rolePreset: "user" })).status).toBe(200);
      expect((await remove(handler, "platformAdmin")).status).toBe(200);
    });
  });

  describe("on a single-state deployment", () => {
    const single = { SINGLE_STATE: "MA", SUPPORTED_STATES: JSON.stringify([{ code: "MA" }]) };

    it("treats a stateless admin as an admin of the state", async () => {
      const handler = await load(single);
      servePool(TARGETS.statelessUser);
      expect((await patch(handler, "legacyAdmin", { rolePreset: "admin" })).status).toBe(200);
      expect(written()).toEqual({ "custom:role": '["Admin"]', "custom:state": "MA" });
    });

    it("lets a platform admin edit a stateless admin and pins them to the state", async () => {
      const handler = await load(single);
      servePool(TARGETS.statelessAdmin, [TARGETS.developer]);
      expect((await patch(handler, "platformAdmin", { rolePreset: "admin" })).status).toBe(200);
      expect(written()).toEqual({ "custom:role": '["Admin"]', "custom:state": "MA" });
    });
  });
});

describe("last developer and platform admin guard", () => {
  it("refuses removing the last platform admin, counting stateless admins", async () => {
    const handler = await load();
    servePool(TARGETS.statelessAdmin, [TARGETS.developer]);
    expect((await patch(handler, "developer", { rolePreset: "user" })).status).toBe(409);
    expect((await patch(handler, "developer", { state: "MA" })).status).toBe(409);
    expect((await remove(handler, "developer")).status).toBe(409);
    expect(written()).toBeNull();
  });

  it("allows it while another stateless admin remains", async () => {
    const handler = await load();
    servePool(TARGETS.platformAdmin, [TARGETS.developer, TARGETS.statelessAdmin]);
    expect((await patch(handler, "developer", { rolePreset: "user" })).status).toBe(200);
  });

  it("refuses removing the last developer", async () => {
    const handler = await load();
    servePool(TARGETS.developer, [TARGETS.platformAdmin]);
    expect((await patch(handler, "developer", { rolePreset: "platformadmin" })).status).toBe(409);
    expect((await remove(handler, "developer")).status).toBe(409);
  });

  it("counts past 50 pages", async () => {
    const handler = await load();
    const users = Array.from({ length: 3100 }, () => TARGETS.user);
    servePool(TARGETS.platformAdmin, [...users, TARGETS.platformAdmin, TARGETS.developer]);
    expect((await remove(handler, "developer")).status).toBe(200);
    expect(cognito.commandCalls(ListUsersCommand).length).toBeGreaterThan(50);

    cognito.reset();
    servePool(TARGETS.platformAdmin, [...users, TARGETS.developer]);
    expect((await remove(handler, "developer")).status).toBe(409);
  });

  it("refuses the change when time runs out before every account is counted", async () => {
    const handler = await load();
    servePool(TARGETS.platformAdmin, [...Array.from({ length: 300 }, () => TARGETS.user), TARGETS.platformAdmin]);
    let remaining = 30000;
    const context = { getRemainingTimeInMillis: () => (remaining -= 5000) };
    const res = await remove(handler, "developer", context);
    expect(res.status).toBe(503);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
  });
});

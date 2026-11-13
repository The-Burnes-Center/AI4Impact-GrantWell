import { mockClient } from "aws-sdk-client-mock";
import { AdminCreateUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);

async function load(env: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({
    USER_POOL_ID: "pool",
    SUPPORTED_STATES: JSON.stringify([{ code: "MA" }, { code: "RI" }]),
    ...env,
  }))
    vi.stubEnv(k, v);
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

const invite = (handler: any, actor: Actor, body: Record<string, unknown>) =>
  handler({
    routeKey: "POST /user-management/users",
    body: JSON.stringify({ email: "New@Example.org", ...body }),
    requestContext: {
      http: { method: "POST" },
      authorizer: {
        jwt: {
          claims: {
            "cognito:username": "actor",
            "custom:role": JSON.stringify(ACTORS[actor].roles),
            "custom:state": ACTORS[actor].state,
          },
        },
      },
    },
  }).then((r: { statusCode: number; body: string }) => ({ status: r.statusCode, body: JSON.parse(r.body) }));

const created = () => {
  const calls = cognito.commandCalls(AdminCreateUserCommand);
  if (calls.length === 0) return null;
  const attrs = Object.fromEntries(calls[0].args[0].input.UserAttributes!.map((a) => [a.Name, a.Value]));
  return { role: JSON.parse(attrs["custom:role"]!), state: attrs["custom:state"] ?? "", email: attrs.email };
};

beforeEach(() => {
  cognito.reset();
  cognito.on(AdminCreateUserCommand).resolves({ User: { Username: "new-uuid" } });
});

describe("inviting a user with a role", () => {
  it("defaults to User when no role is given", async () => {
    const handler = await load();
    const res = await invite(handler, "platformAdmin", { state: "RI" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: "new-uuid", email: "new@example.org", roles: ["User"], state: "RI" });
    expect(created()).toEqual({ role: ["User"], state: "RI", email: "new@example.org" });
  });

  it.each<[Actor, string, string, number, { role: string[]; state: string } | null]>([
    ["developer", "user", "", 201, { role: ["User"], state: "" }],
    ["developer", "admin", "RI", 201, { role: ["Admin"], state: "RI" }],
    ["developer", "platformadmin", "", 201, { role: ["PlatformAdmin"], state: "" }],
    ["developer", "developer", "", 201, { role: ["Developer"], state: "" }],
    ["platformAdmin", "user", "", 201, { role: ["User"], state: "" }],
    ["platformAdmin", "admin", "MA", 201, { role: ["Admin"], state: "MA" }],
    ["platformAdmin", "platformadmin", "", 403, null],
    ["platformAdmin", "developer", "", 403, null],
    ["legacyAdmin", "admin", "RI", 201, { role: ["Admin"], state: "RI" }],
    ["legacyAdmin", "platformadmin", "", 403, null],
    ["legacyAdmin", "developer", "", 403, null],
    ["stateAdmin", "user", "", 201, { role: ["User"], state: "MA" }],
    ["stateAdmin", "admin", "RI", 201, { role: ["Admin"], state: "MA" }],
    ["stateAdmin", "platformadmin", "", 403, null],
    ["stateAdmin", "developer", "MA", 403, null],
  ])("%s inviting %s (state %j) gets %i", async (actor, rolePreset, state, status, expected) => {
    const handler = await load();
    const res = await invite(handler, actor, { rolePreset, state });
    expect(res.status).toBe(status);
    expect(created()).toEqual(expected && { ...expected, email: "new@example.org" });
  });

  it("refuses a platform admin with a state", async () => {
    const handler = await load();
    const res = await invite(handler, "developer", { rolePreset: "platformadmin", state: "MA" });
    expect(res.status).toBe(400);
    expect(created()).toBeNull();
  });

  it.each(["platformAdmin", "legacyAdmin"] as const)(
    "refuses %s inviting an admin with no state, which would be a platform admin",
    async (actor) => {
      const handler = await load();
      for (const state of [undefined, ""]) {
        const res = await invite(handler, actor, { rolePreset: "admin", ...(state === undefined ? {} : { state }) });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/^Choose a state for an admin/);
      }
      expect(created()).toBeNull();
    }
  );

  it("refuses the stateless admin even with the legacy rule off", async () => {
    const handler = await load({ LEGACY_STATELESS_ADMIN_IS_PLATFORM: "false" });
    expect((await invite(handler, "platformAdmin", { rolePreset: "admin" })).status).toBe(403);
    expect(created()).toBeNull();
  });

  it("lets a developer invite an admin with no state", async () => {
    const handler = await load();
    expect((await invite(handler, "developer", { rolePreset: "admin" })).status).toBe(201);
    expect(created()).toEqual({ role: ["Admin"], state: "", email: "new@example.org" });
  });

  it("refuses an unknown role", async () => {
    const handler = await load();
    expect((await invite(handler, "developer", { rolePreset: "owner" })).status).toBe(400);
    expect(created()).toBeNull();
  });

  describe("on a single-state deployment", () => {
    it("pins every invite to the state and has no platform admin", async () => {
      const handler = await load({ SINGLE_STATE: "MA", SUPPORTED_STATES: JSON.stringify([{ code: "MA" }]) });
      expect((await invite(handler, "developer", { rolePreset: "platformadmin" })).status).toBe(400);
      expect(created()).toBeNull();

      const res = await invite(handler, "developer", { rolePreset: "admin" });
      expect(res.status).toBe(201);
      expect(created()).toEqual({ role: ["Admin"], state: "MA", email: "new@example.org" });
    });
  });
});

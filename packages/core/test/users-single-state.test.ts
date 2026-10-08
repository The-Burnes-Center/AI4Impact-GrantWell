import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { planBackfill } from "../scripts/backfill-single-state.mjs";

const aws = vi.hoisted(() => {
  class Command {
    constructor(public input: any) {}
  }
  const command = (name: string) => ({ [name]: class extends Command {} })[name];
  const sent: { name: string; input: any }[] = [];
  const users: Record<string, { state: string; roles: string[] }> = {};
  return { command, sent, users };
});

vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: class {
    async send(cmd: any) {
      aws.sent.push({ name: cmd.constructor.name, input: cmd.input });
      if (cmd.constructor.name === "AdminGetUserCommand") {
        const user = aws.users[cmd.input.Username];
        if (!user) throw Object.assign(new Error("not found"), { name: "UserNotFoundException" });
        return {
          Username: cmd.input.Username,
          UserStatus: "CONFIRMED",
          Enabled: true,
          UserAttributes: [
            { Name: "email", Value: `${cmd.input.Username}@mass.gov` },
            { Name: "custom:role", Value: JSON.stringify(user.roles) },
            { Name: "custom:state", Value: user.state },
          ],
        };
      }
      if (cmd.constructor.name === "ListUsersCommand") return { Users: [] };
      if (cmd.constructor.name === "AdminCreateUserCommand") return { User: { Username: cmd.input.Username, Attributes: cmd.input.UserAttributes } };
      return {};
    }
  },
  ...Object.fromEntries(
    [
      "AdminCreateUserCommand",
      "AdminDeleteSoftwareTokenCommand",
      "AdminDeleteUserCommand",
      "AdminGetUserCommand",
      "AdminUpdateUserAttributesCommand",
      "AdminUserGlobalSignOutCommand",
      "ListUsersCommand",
    ].map((n) => [n, aws.command(n)])
  ),
}));

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  process.env.USER_POOL_ID = "us-east-1_test";
  process.env.SUPPORTED_STATES = JSON.stringify([{ code: "MA" }]);
  process.env.SINGLE_STATE = "MA";
  ({ handler } = await import("../lib/chatbot-api/functions/user-management/users/index.mjs"));
});

beforeEach(() => {
  aws.sent.length = 0;
  for (const k of Object.keys(aws.users)) delete aws.users[k];
  aws.users["plain"] = { state: "", roles: ["User"] };
  aws.users["ma-user"] = { state: "MA", roles: ["User"] };
});

const call = (method: string, body: object, username?: string, actor = { roles: ["Developer"], state: "MA" }) =>
  handler({
    routeKey: username ? `${method} /user-management/users/{username}` : `${method} /user-management/users`,
    pathParameters: username ? { username } : {},
    body: JSON.stringify(body),
    requestContext: {
      http: { method },
      authorizer: { jwt: { claims: { "cognito:username": "dev", "custom:role": JSON.stringify(actor.roles), "custom:state": actor.state } } },
    },
  });
const stateWrites = () =>
  aws.sent
    .filter((c) => c.name === "AdminUpdateUserAttributesCommand" || c.name === "AdminCreateUserCommand")
    .flatMap((c) => c.input.UserAttributes.filter((a: any) => a.Name === "custom:state").map((a: any) => a.Value));

describe("users on a single-state deployment", () => {
  it("creates every user in the state, ignoring a requested one", async () => {
    expect((await call("POST", { email: "new@mass.gov", state: "" })).statusCode).toBeLessThan(300);
    expect(stateWrites()).toEqual(["MA"]);
  });

  it("refuses Platform Admin", async () => {
    const res = await call("PATCH", { rolePreset: "platformadmin" }, "ma-user");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/single-state/);
  });

  it("refuses any other state", async () => {
    expect((await call("PATCH", { state: "" }, "ma-user")).statusCode).toBe(400);
    expect((await call("PATCH", { state: "RI" }, "ma-user")).statusCode).toBe(400);
  });

  it("pins the state on a role change for a user who lacks it, for Admin and Developer alike", async () => {
    expect((await call("PATCH", { rolePreset: "admin" }, "plain")).statusCode).toBe(200);
    expect(stateWrites()).toEqual(["MA"]);
    aws.sent.length = 0;
    aws.users["plain2"] = { state: "", roles: ["User"] };
    expect((await call("PATCH", { rolePreset: "developer" }, "plain2")).statusCode).toBe(200);
    expect(stateWrites()).toEqual(["MA"]);
  });

  it("doesn't rewrite the state when it's already set", async () => {
    expect((await call("PATCH", { rolePreset: "admin" }, "ma-user")).statusCode).toBe(200);
    expect(stateWrites()).toEqual([]);
  });
});

describe("backfill plan", () => {
  const u = (name: string, state?: string) => ({
    Username: name,
    Attributes: [{ Name: "email", Value: `${name}@mass.gov` }, ...(state !== undefined ? [{ Name: "custom:state", Value: state }] : [])],
  });

  it("picks everyone without the state, whatever their role, and skips those who have it", () => {
    const plan = planBackfill([u("a"), u("b", ""), u("c", "MA"), u("d", "ma"), u("e", "Massachusetts"), u("f", "RI")], "MA");
    expect(plan.map((p) => p.username)).toEqual(["a", "b", "e", "f"]);
  });
});

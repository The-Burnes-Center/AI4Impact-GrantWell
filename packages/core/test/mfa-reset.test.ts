import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => {
  class Command {
    constructor(public input: any) {}
  }
  const command = (name: string) => ({ [name]: class extends Command {} })[name];
  const sent: { name: string; input: any }[] = [];
  const users: Record<string, { state: string; roles: string[] }> = {};
  class Client {
    async send(cmd: any) {
      sent.push({ name: cmd.constructor.name, input: cmd.input });
      if (cmd.constructor.name === "AdminGetUserCommand") {
        const user = users[cmd.input.Username];
        if (!user) throw Object.assign(new Error("not found"), { name: "UserNotFoundException" });
        return {
          Username: cmd.input.Username,
          UserStatus: "CONFIRMED",
          Enabled: true,
          UserAttributes: [
            { Name: "email", Value: `${cmd.input.Username}@example.com` },
            { Name: "custom:role", Value: JSON.stringify(user.roles) },
            { Name: "custom:state", Value: user.state },
          ],
        };
      }
      return {};
    }
  }
  return { command, sent, users, Client };
});

// The runtime SDK mock deliberately lacks AdminDeleteSoftwareTokenCommand, like the real
// nodejs24.x runtime: the handler must take it from the pinned bundle.
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: aws.Client,
  ...Object.fromEntries(
    [
      "AdminCreateUserCommand",
      "AdminDeleteUserCommand",
      "AdminGetUserCommand",
      "AdminUpdateUserAttributesCommand",
      "AdminUserGlobalSignOutCommand",
      "ListUsersCommand",
    ].map((n) => [n, aws.command(n)])
  ),
}));

vi.mock("../lib/chatbot-api/functions/user-management/users/vendor/cognito-client.mjs", () => ({
  CognitoIdentityProviderClient: aws.Client,
  AdminDeleteSoftwareTokenCommand: aws.command("AdminDeleteSoftwareTokenCommand"),
}));

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  process.env.USER_POOL_ID = "us-east-1_test";
  process.env.SUPPORTED_STATES = JSON.stringify([{ code: "MA" }, { code: "RI" }]);
  ({ handler } = await import("../lib/chatbot-api/functions/user-management/users/index.mjs"));
});

beforeEach(() => {
  aws.sent.length = 0;
  for (const k of Object.keys(aws.users)) delete aws.users[k];
  aws.users["ma-user"] = { state: "MA", roles: ["User"] };
  aws.users["ri-user"] = { state: "RI", roles: ["User"] };
});

const reset = (username: string, actor: { username: string; roles: string[]; state?: string }) =>
  handler({
    routeKey: "POST /user-management/users/{username}/mfa-reset",
    pathParameters: { username },
    requestContext: {
      http: { method: "POST" },
      authorizer: {
        jwt: {
          claims: {
            "cognito:username": actor.username,
            "custom:role": JSON.stringify(actor.roles),
            "custom:state": actor.state ?? "",
          },
        },
      },
    },
  });

const writes = () => aws.sent.filter((c) => c.name !== "AdminGetUserCommand").map((c) => c.name);

describe("MFA reset", () => {
  it("deletes the authenticator, then signs the user out everywhere", async () => {
    const res = await reset("ma-user", { username: "dev", roles: ["Developer"] });
    expect(res.statusCode).toBe(200);
    expect(writes()).toEqual(["AdminDeleteSoftwareTokenCommand", "AdminUserGlobalSignOutCommand"]);
    expect(aws.sent.at(-2)!.input).toEqual({ UserPoolId: "us-east-1_test", Username: "ma-user" });
  });

  it("lets a state admin reset a user in their own state", async () => {
    const res = await reset("ma-user", { username: "ma-admin", roles: ["Admin"], state: "MA" });
    expect(res.statusCode).toBe(200);
  });

  it("refuses a state admin for another state's user", async () => {
    const res = await reset("ri-user", { username: "ma-admin", roles: ["Admin"], state: "MA" });
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });

  it("refuses resetting yourself", async () => {
    aws.users["ma-admin"] = { state: "MA", roles: ["Admin"] };
    const res = await reset("ma-admin", { username: "ma-admin", roles: ["Admin"], state: "MA" });
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });

  it("refuses a plain user", async () => {
    const res = await reset("ma-user", { username: "someone", roles: ["User"], state: "MA" });
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });

  it("does not create a user on the reset route", async () => {
    await reset("ma-user", { username: "dev", roles: ["Developer"] });
    expect(writes()).not.toContain("AdminCreateUserCommand");
  });
});

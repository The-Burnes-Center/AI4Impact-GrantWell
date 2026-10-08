import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => {
  class Command {
    constructor(public input: any) {}
  }
  const command = (name: string) => ({ [name]: class extends Command {} })[name];
  const pages: any[][] = [];
  const sent: { name: string; input: any }[] = [];
  return { command, pages, sent };
});

vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: class {
    async send(cmd: any) {
      aws.sent.push({ name: cmd.constructor.name, input: cmd.input });
      if (cmd.constructor.name !== "ListUsersCommand") return {};
      const page = Number(cmd.input.PaginationToken ?? 0);
      return {
        Users: aws.pages[page] ?? [],
        PaginationToken: page + 1 < aws.pages.length ? String(page + 1) : undefined,
      };
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
  process.env.SUPPORTED_STATES = JSON.stringify([{ code: "MA" }, { code: "RI" }]);
  ({ handler } = await import("../lib/chatbot-api/functions/user-management/users/index.mjs"));
});

const user = (username: string, email: string, state: string) => ({
  Username: username,
  UserStatus: "CONFIRMED",
  Enabled: true,
  Attributes: [
    { Name: "email", Value: email },
    { Name: "custom:role", Value: JSON.stringify(["User"]) },
    { Name: "custom:state", Value: state },
  ],
});

beforeEach(() => {
  aws.sent.length = 0;
  aws.pages.length = 0;
  aws.pages.push(
    [user("u1", "jane.smith@mass.gov", "MA"), user("u2", "bob@ri.gov", "RI")],
    [user("u3", "Smithers@ri.gov", "RI"), user("u4", "al@mass.gov", "MA")]
  );
});

const list = (query: string | undefined, actor: { roles: string[]; state?: string }) =>
  handler({
    routeKey: "GET /user-management/users",
    queryStringParameters: query === undefined ? {} : { query },
    requestContext: {
      http: { method: "GET" },
      authorizer: {
        jwt: {
          claims: {
            "cognito:username": "actor",
            "custom:role": JSON.stringify(actor.roles),
            "custom:state": actor.state ?? "",
          },
        },
      },
    },
  });

const emails = async (res: Promise<{ statusCode: number; body: string }>) => {
  const r = await res;
  expect(r.statusCode).toBe(200);
  return JSON.parse(r.body).users.map((u: any) => u.email);
};

describe("user search", () => {
  it("matches any part of the email across every page, case-insensitively", async () => {
    expect(await emails(list(" SMITH ", { roles: ["Developer"] }))).toEqual(["jane.smith@mass.gov", "smithers@ri.gov"]);
  });

  it("matches the username too", async () => {
    expect(await emails(list("u4", { roles: ["Developer"] }))).toEqual(["al@mass.gov"]);
  });

  it("keeps a state admin inside their state", async () => {
    expect(await emails(list("smith", { roles: ["Admin"], state: "MA" }))).toEqual(["jane.smith@mass.gov"]);
    expect(await emails(list(undefined, { roles: ["Admin"], state: "MA" }))).toEqual(["al@mass.gov", "jane.smith@mass.gov"]);
  });

  it("returns no pagination token for a search", async () => {
    const res = await list("gov", { roles: ["Developer"] });
    expect(JSON.parse(res.body).nextPaginationToken).toBeNull();
  });

  it("still pages normally without a query", async () => {
    const res = await list("", { roles: ["Developer"] });
    expect(JSON.parse(res.body).nextPaginationToken).toBe("1");
    expect(aws.sent.filter((c) => c.name === "ListUsersCommand")).toHaveLength(1);
  });

  it("refuses a plain user", async () => {
    expect((await list("smith", { roles: ["User"], state: "MA" })).statusCode).toBe(403);
  });
});

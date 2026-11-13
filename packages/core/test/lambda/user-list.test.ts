import { mockClient } from "aws-sdk-client-mock";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);

async function load() {
  vi.unstubAllEnvs();
  vi.stubEnv("USER_POOL_ID", "pool");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA" }, { code: "RI" }]));
  vi.resetModules();
  return (await import("../../lib/chatbot-api/functions/user-management/users/index.mjs")).handler;
}

type CognitoUser = { Username: string; UserStatus: string; Enabled: boolean; Attributes: { Name: string; Value: string }[] };

const cognitoUser = (username: string, email: string | null, opts: { state?: string; roles?: string[]; status?: string; enabled?: boolean } = {}): CognitoUser => ({
  Username: username,
  UserStatus: opts.status ?? "CONFIRMED",
  Enabled: opts.enabled ?? true,
  Attributes: [
    ...(email ? [{ Name: "email", Value: email }] : []),
    { Name: "custom:role", Value: JSON.stringify(opts.roles ?? ["User"]) },
    { Name: "custom:state", Value: opts.state ?? "" },
  ],
});

// Serves the users 60 to a page in the order given, like Cognito (which has no defined order).
function servePages(users: CognitoUser[], pageSize = 60) {
  cognito.on(ListUsersCommand).callsFake((input) => {
    const start = Number(input.PaginationToken ?? 0);
    const end = start + Math.min(input.Limit ?? 60, pageSize);
    return { Users: users.slice(start, end), PaginationToken: end < users.length ? String(end) : undefined };
  });
}

const list = (handler: any, actor: { roles: string[]; state?: string }, params: Record<string, string> = {}, context?: unknown) =>
  handler(
    {
      routeKey: "GET /user-management/users",
      queryStringParameters: params,
      requestContext: {
        http: { method: "GET" },
        authorizer: {
          jwt: {
            claims: { "cognito:username": "actor", "custom:role": JSON.stringify(actor.roles), "custom:state": actor.state ?? "" },
          },
        },
      },
    },
    context
  ).then((r: { statusCode: number; body: string }) => ({ status: r.statusCode, body: JSON.parse(r.body) }));

// A deterministic shuffle so pages arrive out of order.
const shuffled = <T,>(items: T[]) => items.map((v, i) => ({ v, k: (i * 7919) % 101 })).sort((a, b) => a.k - b.k).map(({ v }) => v);

const pad = (n: number) => String(n).padStart(3, "0");

beforeEach(() => cognito.reset());

describe("admin user list", () => {
  it("returns every user across pages, sorted by email, in one response", async () => {
    const handler = await load();
    const users = shuffled(Array.from({ length: 150 }, (_, i) => cognitoUser(`u${i}`, `person${pad(i)}@example.org`)));
    servePages(users);

    const { status, body } = await list(handler, { roles: ["Developer"] }, { limit: "25", paginationToken: "60" });

    expect(status).toBe(200);
    expect(body.users).toHaveLength(150);
    expect(body.users.map((u: any) => u.email)).toEqual(Array.from({ length: 150 }, (_, i) => `person${pad(i)}@example.org`));
    expect(body).toMatchObject({ nextPaginationToken: null, pageSize: 150, truncated: false });
    expect(cognito.commandCalls(ListUsersCommand)).toHaveLength(3);
    expect(cognito.commandCalls(ListUsersCommand)[0].args[0].input.PaginationToken).toBeUndefined();
  });

  it("gives the same order on every load", async () => {
    const handler = await load();
    const users = Array.from({ length: 70 }, (_, i) => cognitoUser(`u${i}`, `p${pad(i)}@example.org`));
    servePages(shuffled(users));
    const first = (await list(handler, { roles: ["PlatformAdmin"] })).body.users.map((u: any) => u.email);
    cognito.reset();
    servePages([...users].reverse());
    const second = (await list(handler, { roles: ["PlatformAdmin"] })).body.users.map((u: any) => u.email);
    expect(second).toEqual(first);
  });

  it("keeps users without an email, after the others, ordered by username", async () => {
    const handler = await load();
    servePages([cognitoUser("zed", null), cognitoUser("b", "b@x.org"), cognitoUser("abc", null), cognitoUser("a", "A@x.org")]);
    const { body } = await list(handler, { roles: ["Developer"] });
    expect(body.users.map((u: any) => [u.username, u.email])).toEqual([
      ["a", "a@x.org"],
      ["b", "b@x.org"],
      ["abc", ""],
      ["zed", ""],
    ]);
  });

  it("lists invited and disabled users with their status", async () => {
    const handler = await load();
    servePages([
      cognitoUser("i", "invited@x.org", { status: "FORCE_CHANGE_PASSWORD" }),
      cognitoUser("d", "disabled@x.org", { enabled: false }),
    ]);
    const { body } = await list(handler, { roles: ["Developer"] });
    expect(body.users.map((u: any) => [u.email, u.status, u.enabled])).toEqual([
      ["disabled@x.org", "CONFIRMED", false],
      ["invited@x.org", "FORCE_CHANGE_PASSWORD", true],
    ]);
  });

  it("shows a state admin only their state, from every page", async () => {
    const handler = await load();
    const users = shuffled(
      Array.from({ length: 130 }, (_, i) =>
        cognitoUser(`u${i}`, `p${pad(i)}@x.org`, { state: i % 2 ? "MA" : "RI", roles: i === 3 ? ["Admin"] : ["User"] })
      )
    );
    servePages([...users, cognitoUser("legacy", "legacy@x.org", { roles: ["Admin"] }), cognitoUser("pa", "pa@x.org", { roles: ["PlatformAdmin"] })]);
    const { body } = await list(handler, { roles: ["Admin"], state: "MA" });
    expect(body.users).toHaveLength(65);
    expect(body.users.every((u: any) => u.state === "MA")).toBe(true);
    expect(body.users.map((u: any) => u.email)).toEqual([...body.users.map((u: any) => u.email)].sort());
  });

  it("shows platform admins and developers every account, including stateless and privileged ones", async () => {
    const handler = await load();
    servePages([
      cognitoUser("dev", "dev@x.org", { roles: ["Developer"] }),
      cognitoUser("pa", "pa@x.org", { roles: ["PlatformAdmin"] }),
      cognitoUser("legacy", "legacy@x.org", { roles: ["Admin"] }),
      cognitoUser("ma", "ma@x.org", { roles: ["Admin"], state: "MA" }),
    ]);
    for (const roles of [["Developer"], ["PlatformAdmin"], ["Admin"]]) {
      const { status, body } = await list(handler, { roles });
      expect(status).toBe(200);
      expect(body.users.map((u: any) => u.email)).toEqual(["dev@x.org", "legacy@x.org", "ma@x.org", "pa@x.org"]);
    }
  });

  it("searches every page and sorts the matches", async () => {
    const handler = await load();
    const users = shuffled(Array.from({ length: 125 }, (_, i) => cognitoUser(`u${i}`, `${i % 5 === 0 ? "match" : "other"}${pad(i)}@x.org`)));
    servePages(users);
    const { body } = await list(handler, { roles: ["Developer"] }, { query: "MATCH" });
    expect(body.users).toHaveLength(25);
    expect(body.users.map((u: any) => u.email)).toEqual([...body.users.map((u: any) => u.email)].sort());
  });

  it("stops at the page cap and says the list is truncated", async () => {
    const handler = await load();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    servePages(Array.from({ length: 3100 }, (_, i) => cognitoUser(`u${i}`, `p${String(i).padStart(4, "0")}@x.org`)));
    const { body } = await list(handler, { roles: ["Developer"] });
    expect(body.users).toHaveLength(3000);
    expect(body.truncated).toBe(true);
    expect(cognito.commandCalls(ListUsersCommand)).toHaveLength(50);
  });

  it("stops early when the Lambda is running out of time", async () => {
    const handler = await load();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    servePages(Array.from({ length: 300 }, (_, i) => cognitoUser(`u${i}`, `p${pad(i)}@x.org`)));
    let remaining = 30000;
    const context = { getRemainingTimeInMillis: () => (remaining -= 12500) };
    const { body } = await list(handler, { roles: ["Developer"] }, {}, context);
    expect(body.truncated).toBe(true);
    expect(cognito.commandCalls(ListUsersCommand)).toHaveLength(2);
  });
});

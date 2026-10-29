import { mockClient } from "aws-sdk-client-mock";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  BatchGetItemCommand,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);

const REGIONS = ["Region 1", "Region 2"];

async function load(fn: "user-profile" | "users", env: Record<string, string>) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ANALYTICS_TABLE_NAME: "analytics", USER_POOL_ID: "pool", ...env })) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import(`../../lib/chatbot-api/functions/user-management/${fn}/index.mjs`)).handler;
}

const claims = { sub: "sub-1", "cognito:username": "sub-1", "custom:role": '["Developer"]', "custom:state": "CO" };
const call = (handler: any, method: string, body?: unknown, routeKey = "PUT /user-profile") =>
  handler({
    routeKey,
    rawPath: "/user-profile",
    requestContext: { http: { method, path: "/user-profile" }, authorizer: { jwt: { claims } } },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  }).then((r: { statusCode: number; body: string }) => ({ status: r.statusCode, body: JSON.parse(r.body) }));

const org = { agency: "DOT", organization: "Denver", jobTitle: "Manager" };

beforeEach(() => {
  cognito.reset();
  ddb.reset();
});

describe("user profile with regions", () => {
  it("requires a listed region and stores it", async () => {
    const handler = await load("user-profile", { REGIONS: JSON.stringify(REGIONS) });
    ddb.on(GetItemCommand).resolves({ Item: marshall({ ...org, job_title: "Manager", region: "Region 2" }) });
    ddb.on(UpdateItemCommand).resolves({});

    expect((await call(handler, "PUT", org)).status).toBe(400);
    expect((await call(handler, "PUT", { ...org, region: "Region 9" })).status).toBe(400);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);

    const saved = await call(handler, "PUT", { ...org, region: "Region 2" });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ region: "Region 2", profileComplete: true });
    const update = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(update.UpdateExpression).toContain("#rg = :r");
    expect(update.ExpressionAttributeNames).toMatchObject({ "#rg": "region" });
    expect(unmarshall(update.ExpressionAttributeValues!)[":r"]).toBe("Region 2");
  });

  it("counts a profile without a listed region as incomplete", async () => {
    const handler = await load("user-profile", { REGIONS: JSON.stringify(REGIONS) });
    ddb.on(GetItemCommand).resolves({ Item: marshall({ agency: "DOT", organization: "Denver", job_title: "Manager", region: "Old" }) });
    ddb.on(UpdateItemCommand).resolves({});
    expect((await call(handler, "GET")).body).toMatchObject({ region: "Old", profileComplete: false });
  });

  it("ignores region on a deployment without regions", async () => {
    const handler = await load("user-profile", {});
    ddb.on(GetItemCommand).resolves({ Item: marshall({ agency: "DOT", organization: "Denver", job_title: "Manager" }) });
    ddb.on(UpdateItemCommand).resolves({});
    expect((await call(handler, "GET")).body.profileComplete).toBe(true);
    expect((await call(handler, "PUT", { ...org, region: "Region 9" })).status).toBe(200);
    const update = ddb.commandCalls(UpdateItemCommand).at(-1)!.args[0].input;
    expect(update.UpdateExpression).not.toContain("#rg");
  });
});

describe("admin user list with regions", () => {
  const cognitoUser = (sub: string, email: string) => ({
    Username: sub,
    UserStatus: "CONFIRMED",
    Enabled: true,
    Attributes: [
      { Name: "sub", Value: sub },
      { Name: "email", Value: email },
      { Name: "custom:role", Value: '["User"]' },
    ],
  });
  const list = (handler: any) => call(handler, "GET", undefined, "GET /user-management/users");

  beforeEach(() => {
    cognito.on(ListUsersCommand).resolves({ Users: [cognitoUser("a", "a@x.org"), cognitoUser("b", "b@x.org")] });
  });

  it("adds each user's region from their profile row", async () => {
    const handler = await load("users", { REGIONS_ENABLED: "true" });
    ddb.on(BatchGetItemCommand).resolves({ Responses: { analytics: [marshall({ pk: "USER#a", region: "Region 1" })] } });
    const { body } = await list(handler);
    expect(body.users.map((u: any) => [u.email, u.region])).toEqual([["a@x.org", "Region 1"], ["b@x.org", ""]]);
    expect(ddb.commandCalls(BatchGetItemCommand)[0].args[0].input.RequestItems!.analytics.Keys).toHaveLength(2);
  });

  it("still lists users when the lookup fails", async () => {
    const handler = await load("users", { REGIONS_ENABLED: "true" });
    ddb.on(BatchGetItemCommand).rejects(new Error("throttled"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await list(handler);
    expect(status).toBe(200);
    expect(body.users.map((u: any) => u.region)).toEqual(["", ""]);
  });

  it("reads no profiles on a deployment without regions", async () => {
    const handler = await load("users", {});
    const { body } = await list(handler);
    expect(body.users[0]).not.toHaveProperty("region");
    expect(ddb.commandCalls(BatchGetItemCommand)).toHaveLength(0);
  });
});

import { mockClient } from "aws-sdk-client-mock";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { BatchGetItemCommand, DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);

const FORM = JSON.stringify({
  types: [
    ["State Government / Agency", "entity", false],
    ["501(c)(3) Nonprofit", "name", true],
    ["Individual / Public", "none", true],
  ],
  entities: ["Department of Transportation (CDOT)", "Department of Revenue (DOR)"],
  all: "Statewide / Multi-County",
  locations: ["Adams", "Denver"],
});

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

const nonprofit = { applicantType: "501(c)(3) Nonprofit", organization: "Mile High Youth", jobTitle: "Lead", locations: ["Denver"] };

beforeEach(() => {
  cognito.reset();
  ddb.reset();
  ddb.on(GetItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
});

describe("user profile with the structured profile step", () => {
  it("counts a row saved by the old form as incomplete", async () => {
    const handler = await load("user-profile", { PROFILE_FORM: FORM });
    ddb.on(GetItemCommand).resolves({ Item: marshall({ agency: "DOT", organization: "Denver", job_title: "Manager", region: "Region 1" }) });
    const { body } = await call(handler, "GET");
    expect(body).toMatchObject({ applicantType: "", organization: "Denver", jobTitle: "Manager", locations: [], profileComplete: false });
    expect(body).not.toHaveProperty("agency");
  });

  it("saves a nonprofit's answers and clears the old Department and Region", async () => {
    const handler = await load("user-profile", { PROFILE_FORM: FORM });
    const { status } = await call(handler, "PUT", nonprofit);
    expect(status).toBe(200);
    const input = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(input.UpdateExpression).toMatch(/REMOVE agency, #rg$/);
    expect(input.ExpressionAttributeNames).toMatchObject({ "#rg": "region" });
    expect(unmarshall(input.ExpressionAttributeValues!)).toMatchObject({
      ":a": "501(c)(3) Nonprofit",
      ":o": "Mile High Youth",
      ":j": "Lead",
      ":l": ["Denver"],
      ":s": "CO",
    });
  });

  it("removes the organization and locations a type doesn't ask", async () => {
    const handler = await load("user-profile", { PROFILE_FORM: FORM });
    await call(handler, "PUT", { applicantType: "State Government / Agency", organization: "Department of Revenue (DOR)", jobTitle: "Analyst", locations: ["Denver"] });
    const input = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(input.UpdateExpression).toContain("organization = :o");
    expect(input.UpdateExpression).toMatch(/REMOVE agency, #rg, locations$/);
    await call(handler, "PUT", { applicantType: "Individual / Public", organization: "ignored", jobTitle: "Resident", locations: ["Statewide / Multi-County"] });
    expect(ddb.commandCalls(UpdateItemCommand)[1].args[0].input.UpdateExpression).toMatch(/REMOVE agency, #rg, organization$/);
  });

  it.each([
    [{ ...nonprofit, applicantType: "Club" }, /Applicant type/],
    [{ ...nonprofit, organization: " " }, /Organization name is required/],
    [{ ...nonprofit, jobTitle: "" }, /Role is required/],
    [{ ...nonprofit, locations: [] }, /at least one location/],
    [{ ...nonprofit, locations: ["Denver", "Statewide / Multi-County"] }, /Locations must be/],
    [{ ...nonprofit, locations: ["Boulder"] }, /Locations must be/],
    [{ applicantType: "State Government / Agency", organization: "Department of Fun", jobTitle: "x", locations: [] }, /Entity must be/],
  ])("rejects %j", async (body, message) => {
    const handler = await load("user-profile", { PROFILE_FORM: FORM });
    const res = await call(handler, "PUT", body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
  });

  it("reads a complete profile back", async () => {
    const handler = await load("user-profile", { PROFILE_FORM: FORM });
    ddb.on(GetItemCommand).resolves({
      Item: marshall({ applicant_type: "501(c)(3) Nonprofit", organization: "Mile High Youth", job_title: "Lead", locations: ["Statewide / Multi-County"], state: "CO" }),
    });
    const { body } = await call(handler, "GET");
    expect(body).toEqual({ ...nonprofit, locations: ["Statewide / Multi-County"], state: "CO", profileComplete: true });
  });
});

describe("user list with the structured profile step", () => {
  const cognitoUser = (sub: string, email: string) => ({
    Username: sub,
    Enabled: true,
    UserStatus: "CONFIRMED",
    Attributes: [
      { Name: "sub", Value: sub },
      { Name: "email", Value: email },
      { Name: "custom:state", Value: "CO" },
      { Name: "custom:role", Value: '["User"]' },
    ],
  });

  it("adds each user's applicant type, organization and locations", async () => {
    cognito.on(ListUsersCommand).resolves({ Users: [cognitoUser("a", "a@x.org"), cognitoUser("b", "b@x.org")] });
    const handler = await load("users", { PROFILE_FORM_ENABLED: "true" });
    ddb.on(BatchGetItemCommand).resolves({
      Responses: { analytics: [marshall({ pk: "USER#a", applicant_type: "501(c)(3) Nonprofit", organization: "Mile High Youth", locations: ["Adams"] })] },
    });
    const { body } = await call(handler, "GET", undefined, "GET /user-management/users");
    expect(body.users.map((u: any) => [u.email, u.applicantType, u.organization, u.locations])).toEqual([
      ["a@x.org", "501(c)(3) Nonprofit", "Mile High Youth", ["Adams"]],
      ["b@x.org", "", "", []],
    ]);
    expect(ddb.commandCalls(BatchGetItemCommand)[0].args[0].input.RequestItems!.analytics.ProjectionExpression).toBe(
      "pk, applicant_type, organization, locations"
    );
  });
});

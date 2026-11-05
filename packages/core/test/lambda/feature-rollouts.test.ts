import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ddb = mockClient(DynamoDBClient);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("FEATURE_ROLLOUT_TABLE_NAME", "rollouts");
  vi.stubEnv("USER_POOL_ID", "pool-1");
  ({ handler } = await import("../../lib/chatbot-api/functions/user-management/feature-rollouts/index.mjs"));
});

beforeEach(() => {
  ddb.reset();
  ddb.on(GetItemCommand).callsFake(({ Key }) => {
    const { featureKey, subjectKey } = unmarshall(Key);
    if (subjectKey === "CONFIG") return { Item: marshall({ featureKey, subjectKey, mode: "allowlisted" }) };
    return subjectKey === "USER#ana@example.org" ? { Item: marshall({ featureKey, subjectKey }) } : {};
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const me = (claims: Record<string, string>) =>
  handler({ rawPath: "/feature-rollouts/me", requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims } } } });

describe("a user's own feature access", () => {
  it("comes from their verified email", async () => {
    const res = await me({ email: "Ana@Example.org", email_verified: "true" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      email: "ana@example.org",
      features: { aiGrantSearch: { isAllowlisted: true, canUse: true } },
    });
  });

  it("is refused for an email that isn't verified, without reading the allowlist", async () => {
    for (const claims of [{ email: "ana@example.org", email_verified: "false" }, { email: "ana@example.org" }]) {
      expect((await me(claims)).statusCode).toBe(401);
    }
    expect(ddb.calls()).toHaveLength(0);
  });
});

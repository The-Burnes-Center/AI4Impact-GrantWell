import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const TITAN_PROFILE = "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/titan-grant-search";

const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  vi.stubEnv("TITAN_MODEL_ID", TITAN_PROFILE);
  vi.stubEnv("FEATURE_ROLLOUT_TABLE_NAME", "rollouts");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("OPENSEARCH_ENDPOINT", "abc.us-east-1.aoss.amazonaws.com");
  vi.stubEnv("OPENSEARCH_INDEX", "kb-index");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  ({ handler } = await import("../../lib/chatbot-api/functions/landing-page/ai-grant-search/index.mjs"));
});

const rollout = (mode: string, allowlisted = false) => {
  ddb.on(GetItemCommand, { TableName: "rollouts", Key: { featureKey: { S: "ai-grant-search" }, subjectKey: { S: "CONFIG" } } })
    .resolves({ Item: marshall({ featureKey: "ai-grant-search", subjectKey: "CONFIG", mode }) });
  ddb.on(GetItemCommand, { TableName: "rollouts", Key: { featureKey: { S: "ai-grant-search" }, subjectKey: { S: "USER#ana@example.org" } } })
    .resolves(allowlisted ? { Item: marshall({ featureKey: "ai-grant-search", subjectKey: "USER#ana@example.org" }) } : {});
};

let errors: ReturnType<typeof vi.spyOn>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  bedrock.reset();
  ddb.reset();
  rollout("all");
  ddb.on(ScanCommand).resolves({ Items: [marshall({ nofo_name: "Bridge Repair Program" }), marshall({ nofo_name: "Library Grants" })] });
  ddb.on(QueryCommand).resolves({ Items: [] });
  bedrock.on(InvokeModelCommand).resolves({
    body: new TextEncoder().encode(JSON.stringify({ embedding: new Array(1024).fill(0.01) })) as any,
  });
  fetchMock = vi.fn(async () => ({ ok: false, status: 503, text: async () => "unavailable" }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

const search = (body: object, claims: Record<string, unknown> = { email: "Ana@Example.org", sub: "u1" }) =>
  handler({ requestContext: { authorizer: { jwt: { claims } } }, body: JSON.stringify(body) });

describe("AI grant search", () => {
  it("embeds the query through the Titan inference profile from TITAN_MODEL_ID", async () => {
    await search({ query: "bridge repair" });
    const calls = bedrock.commandCalls(InvokeModelCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.modelId).toBe(TITAN_PROFILE);
    expect(JSON.parse(calls[0].args[0].input.body as string)).toEqual({ inputText: "bridge repair", dimensions: 1024, normalize: true });
  });

  it("logs grantSearchFailed and still answers from name matches when OpenSearch fails", async () => {
    const res = await search({ query: "bridge repair" });
    expect(res.statusCode).toBe(200);
    const { results } = JSON.parse(res.body);
    expect(results.map((r: any) => r.name)).toEqual(["Bridge Repair Program"]);
    expect(errors.mock.calls.some(([line]) => line === LOG_MARKERS.grantSearchFailed[0])).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://abc.us-east-1.aoss.amazonaws.com/kb-index/_search");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/aoss\/aws4_request/);
  });

  it("answers 401 without an email claim", async () => {
    const res = await search({ query: "bridge repair" }, { sub: "u1" });
    expect(res.statusCode).toBe(401);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("answers 403 to a user who isn't allowlisted while the rollout is allowlist-only", async () => {
    ddb.reset();
    rollout("allowlisted", false);
    expect((await search({ query: "bridge repair" })).statusCode).toBe(403);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("lets an allowlisted user search, matching the email case-insensitively", async () => {
    ddb.reset();
    rollout("allowlisted", true);
    ddb.on(ScanCommand).resolves({ Items: [] });
    ddb.on(QueryCommand).resolves({ Items: [] });
    expect((await search({ query: "bridge repair" })).statusCode).toBe(200);
  });

  it("answers 403 when the feature is disabled", async () => {
    ddb.reset();
    rollout("disabled", true);
    expect((await search({ query: "bridge repair" })).statusCode).toBe(403);
  });

  it("rejects queries shorter than 3 characters", async () => {
    const res = await search({ query: " a " });
    expect(res.statusCode).toBe(400);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("drops closed grants when the query asks for open ones", async () => {
    ddb.on(ScanCommand).resolves({
      Items: [
        marshall({ nofo_name: "Bridge Repair Program", status: "active", expiration_date: "2099-01-01" }),
        marshall({ nofo_name: "Bridge Repair Legacy", status: "archived" }),
      ],
    });
    // A fresh container: the metadata cache would otherwise hold the previous test's scan.
    vi.resetModules();
    ({ handler } = await import("../../lib/chatbot-api/functions/landing-page/ai-grant-search/index.mjs"));
    const res = await search({ query: "open bridge repair" });
    expect(JSON.parse(res.body).results.map((r: any) => r.name)).toEqual(["Bridge Repair Program"]);
  });
});

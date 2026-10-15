import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { marshall } from "@aws-sdk/util-dynamodb";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const ws = mockClient(ApiGatewayManagementApiClient);
const kb = mockClient(BedrockAgentRuntimeClient);
const bedrock = mockClient(BedrockRuntimeClient);
const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);
const s3 = mockClient(S3Client);
const sfn = mockClient(SFNClient);

let chatHandler: (event: any) => Promise<any>;
let draftHandler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("KB_ID", "kb-1");
  vi.stubEnv("SESSION_HANDLER", "session-fn");
  vi.stubEnv("WEBSOCKET_API_ENDPOINT", "https://ws.example");
  vi.stubEnv("USER_POOL_ID", "pool-1");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("SONNET_MODEL_ID", "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/chat");
  vi.stubEnv("DAILY_USAGE_TABLE_NAME", "usage");
  vi.stubEnv("CHAT_MESSAGES_PER_DAY", "100");
  vi.stubEnv("APPLICATIONS_PER_DAY", "10");
  vi.stubEnv("DRAFT_GENERATION_STATE_MACHINE_ARN", "arn:aws:states:us-east-1:111111111111:stateMachine:draft");
  vi.stubEnv("DRAFT_GENERATION_JOBS_TABLE_NAME", "jobs");
  ({ handler: chatHandler } = await import("../../lib/chatbot-api/functions/websocket-chat/index.mjs"));
  ({ handler: draftHandler } = await import("../../lib/chatbot-api/gateway/api-routes/draft-generation/index.mjs"));
});

const answer = (text: string) => ({
  body: (async function* () {
    for (const e of [
      { type: "content_block_delta", delta: { type: "text_delta", text } },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ]) {
      yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(e)) } };
    }
  })(),
}) as any;

const capReached = () =>
  new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} });

let warnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const m of [ws, kb, bedrock, cognito, ddb, lambda, s3, sfn]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
  s3.on(ListObjectsV2Command).resolves({});
  ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Grant A", scope: "federal" }) });
  ddb.on(PutItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ Payload: new TextEncoder().encode(JSON.stringify({ body: "{}" })) as any });
  bedrock.on(InvokeModelWithResponseStreamCommand).resolves(answer("Here is the answer."));
  sfn.on(StartExecutionCommand).resolves({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});

const withRoles = (roles: string[]) =>
  cognito.on(AdminGetUserCommand).resolves({
    UserAttributes: roles.length ? [{ Name: "custom:role", Value: JSON.stringify(roles) }] : [],
  });

const chat = () =>
  chatHandler({
    requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
    body: JSON.stringify({
      data: { userMessage: "Am I eligible?", session_id: "s1", chatHistory: [], documentIdentifier: "Grant A" },
    }),
  });

const posted = () => ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));

const generate = (roles?: string[]) =>
  draftHandler({
    requestContext: {
      http: { method: "POST" },
      authorizer: { jwt: { claims: { sub: "user-1", ...(roles && { "custom:role": JSON.stringify(roles) }) } } },
    },
    body: JSON.stringify({ query: "Generate all sections", documentIdentifier: "Grant A", sessionId: "s1" }),
  });

const today = () => new Date().toISOString().slice(0, 10);

describe("daily chat message cap", () => {
  it("counts the message for the user and UTC day, and answers while under the cap", async () => {
    withRoles([]);
    await chat();

    const [update] = ddb.commandCalls(UpdateItemCommand);
    expect(update.args[0].input).toMatchObject({ TableName: "usage", Key: { pk: { S: `user-1#${today()}` } } });
    expect(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)).toHaveLength(1);
    expect(posted()).toContain("Here is the answer.");
  });

  it("adds one only while the count is under the configured cap, and expires the row", async () => {
    withRoles([]);
    await chat();

    const input = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(input.UpdateExpression).toBe("ADD #count :one SET #ttl = :ttl");
    expect(input.ConditionExpression).toBe("attribute_not_exists(#count) OR #count < :cap");
    expect(input.ExpressionAttributeNames).toEqual({ "#count": "chat_messages", "#ttl": "ttl" });
    expect(input.ExpressionAttributeValues![":one"]).toEqual({ N: "1" });
    expect(input.ExpressionAttributeValues![":cap"]).toEqual({ N: "100" });
    const ttl = Number(input.ExpressionAttributeValues![":ttl"].N);
    expect(ttl * 1000).toBeGreaterThan(Date.now() + 24 * 3600 * 1000);
    expect(ttl * 1000).toBeLessThanOrEqual(Date.now() + 48 * 3600 * 1000);
  });

  it("at the cap, tells the user and never calls the model", async () => {
    withRoles([]);
    ddb.on(UpdateItemCommand).rejects(capReached());
    await chat();

    expect(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)).toHaveLength(0);
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);
    expect(posted()).toEqual([
      "<!LIMIT!>You've reached today's limit of 100 chat messages. You can chat again tomorrow.",
    ]);
    expect(ws.commandCalls(DeleteConnectionCommand)).toHaveLength(1);
    expect(warnings.mock.calls.some(([line]) => String(line).startsWith(`${LOG_MARKERS.chatCapReached[0]} for user-1`))).toBe(true);
  });

  it.each(["Admin", "PlatformAdmin", "Developer"])("doesn't count or cap a %s", async (role) => {
    withRoles([role]);
    ddb.on(UpdateItemCommand).rejects(capReached());
    await chat();

    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
    expect(posted()).toContain("Here is the answer.");
  });

  it("answers when the counter can't be reached", async () => {
    withRoles([]);
    ddb.on(UpdateItemCommand).rejects(Object.assign(new Error("Service unavailable"), { name: "InternalServerError" }));
    await chat();

    expect(posted()).toContain("Here is the answer.");
  });
});

describe("daily generated application cap", () => {
  it("counts the application for the user and UTC day, and starts it while under the cap", async () => {
    const res = await generate();

    expect(res.statusCode).toBe(200);
    const input = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(input).toMatchObject({ TableName: "usage", Key: { pk: { S: `user-1#${today()}` } } });
    expect(input.UpdateExpression).toBe("ADD #count :one SET #ttl = :ttl");
    expect(input.ConditionExpression).toBe("attribute_not_exists(#count) OR #count < :cap");
    expect(input.ExpressionAttributeNames).toEqual({ "#count": "applications", "#ttl": "ttl" });
    expect(input.ExpressionAttributeValues![":cap"]).toEqual({ N: "10" });
    expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(1);
  });

  it("at the cap, answers 429 with the limit message and starts nothing", async () => {
    ddb.on(UpdateItemCommand).rejects(capReached());
    const res = await generate();

    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body)).toEqual({
      error: "DAILY_LIMIT_REACHED",
      message: "You've reached today's limit of 10 generated applications. You can generate more tomorrow.",
    });
    expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(0);
    expect(warnings.mock.calls.some(([line]) => String(line).startsWith(`${LOG_MARKERS.applicationCapReached[0]} for user-1`))).toBe(true);
  });

  it.each(["Admin", "PlatformAdmin", "Developer"])("doesn't count or cap a %s", async (role) => {
    ddb.on(UpdateItemCommand).rejects(capReached());
    const res = await generate([role]);

    expect(res.statusCode).toBe(200);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
    expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(1);
  });

  it("starts the application when the counter can't be reached", async () => {
    ddb.on(UpdateItemCommand).rejects(Object.assign(new Error("Service unavailable"), { name: "InternalServerError" }));
    const res = await generate();

    expect(res.statusCode).toBe(200);
  });
});

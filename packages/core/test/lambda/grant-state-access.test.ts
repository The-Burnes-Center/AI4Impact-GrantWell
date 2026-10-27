import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ws = mockClient(ApiGatewayManagementApiClient);
const kb = mockClient(BedrockAgentRuntimeClient);
const bedrock = mockClient(BedrockRuntimeClient);
const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);
const s3 = mockClient(S3Client);
const sfn = mockClient(SFNClient);

type Handler = (event: any) => Promise<any>;
let chatHandler: Handler;
let draftHandler: Handler;
let summaryHandler: Handler;
let questionsHandler: Handler;

beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }, { code: "NY", name: "New York" }]));
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("USER_POOL_ID", "pool-1");
  vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
  vi.stubEnv("KB_ID", "kb-1");
  vi.stubEnv("SESSION_HANDLER", "session-fn");
  vi.stubEnv("WEBSOCKET_API_ENDPOINT", "https://ws.example");
  vi.stubEnv("SONNET_MODEL_ID", "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/chat");
  vi.stubEnv("DRAFT_GENERATION_STATE_MACHINE_ARN", "arn:aws:states:us-east-1:111111111111:stateMachine:draft");
  vi.stubEnv("DRAFT_GENERATION_JOBS_TABLE_NAME", "jobs");
  vi.stubEnv("BUCKET", "nofo-bucket");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  ({ handler: chatHandler } = await import("../../lib/chatbot-api/functions/websocket-chat/index.mjs"));
  ({ handler: draftHandler } = await import("../../lib/chatbot-api/gateway/api-routes/draft-generation/index.mjs"));
  ({ handler: summaryHandler } = await import("../../lib/chatbot-api/functions/landing-page/retrieveNOFOSummary/index.mjs"));
  ({ handler: questionsHandler } = await import("../../lib/chatbot-api/functions/landing-page/retrieveNOFOQuestions/index.mjs"));
});

const answer = () => ({
  body: (async function* () {
    for (const e of [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Here is what I found." } },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ]) {
      yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(e)) } };
    }
  })(),
}) as any;

const grants: Record<string, Record<string, unknown>> = {
  "NY Grant": { nofo_name: "NY Grant", scope: "state", state: "NY" },
  "MA Grant": { nofo_name: "MA Grant", scope: "state", state: "MA" },
  "Federal Grant": { nofo_name: "Federal Grant", scope: "federal" },
  "Legacy Grant": { nofo_name: "Legacy Grant" },
};

let warns: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const m of [ws, kb, bedrock, cognito, ddb, lambda, s3, sfn]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
  bedrock.on(InvokeModelWithResponseStreamCommand).callsFake(answer);
  lambda.on(InvokeCommand).resolves({ Payload: new TextEncoder().encode(JSON.stringify({ body: "{}" })) as any });
  ddb.on(GetItemCommand).callsFake((input) => {
    const row = grants[input.Key?.nofo_name?.S];
    return row ? { Item: marshall(row) } : {};
  });
  ddb.on(PutItemCommand).resolves({});
  s3.on(ListObjectsV2Command).resolves({});
  s3.on(GetObjectCommand).callsFake(() => ({ Body: Readable.from([Buffer.from(JSON.stringify({ questions: [] }))]) }));
  sfn.on(StartExecutionCommand).resolves({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  warns = vi.spyOn(console, "warn").mockImplementation(() => {});
});

function signedInAs(role: string | null, state: string) {
  const attrs = [{ Name: "custom:state", Value: state }];
  if (role) attrs.push({ Name: "custom:role", Value: JSON.stringify([role]) });
  cognito.on(AdminGetUserCommand).resolves({ UserAttributes: attrs });
  return { "custom:state": state, ...(role ? { "custom:role": JSON.stringify([role]) } : {}) };
}

const chat = (documentIdentifier: string) =>
  chatHandler({
    requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
    body: JSON.stringify({ data: { userMessage: "Am I eligible?", session_id: "s1", chatHistory: [], documentIdentifier } }),
  });

const chatDenied = () => {
  const posted = ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));
  return posted.some((d) => d.startsWith("<!ACCESS_DENIED!>"));
};

const draft = (claims: Record<string, string>, documentIdentifier: string) =>
  draftHandler({
    requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "user-1", ...claims } } } },
    body: JSON.stringify({ query: "Write the draft", documentIdentifier, sessionId: "s1" }),
  });

const landing = (handler: Handler, claims: Record<string, string>, documentKey: string) =>
  handler({
    queryStringParameters: { documentKey },
    requestContext: { authorizer: { jwt: { claims: { sub: "user-1", ...claims } } } },
  });

describe("chat grant access", () => {
  it("denies another state's grant sent with the trailing slash", async () => {
    signedInAs(null, "MA");
    await chat("NY Grant/");
    expect(chatDenied()).toBe(true);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("allows the user's own state's grant and a federal grant", async () => {
    signedInAs(null, "MA");
    await chat("MA Grant/");
    await chat("Federal Grant/");
    await chat("Legacy Grant/");
    expect(chatDenied()).toBe(false);
    expect(bedrock.calls()).toHaveLength(3);
  });

  it("denies a grant with no metadata row for a normal user but lets a Developer in", async () => {
    signedInAs(null, "MA");
    await chat("Unknown Grant/");
    expect(chatDenied()).toBe(true);

    ws.resetHistory();
    signedInAs("Developer", "MA");
    await chat("Unknown Grant/");
    expect(chatDenied()).toBe(false);
    expect(bedrock.calls()).toHaveLength(1);
  });

  it("denies when the metadata table can't be read", async () => {
    signedInAs(null, "MA");
    ddb.on(GetItemCommand).rejects(new Error("Throttled"));
    await chat("Federal Grant/");
    expect(chatDenied()).toBe(true);
    expect(warns).toHaveBeenCalled();
  });

  it("lists the user's uploads for the grant when the identifier ends in a slash", async () => {
    signedInAs(null, "MA");
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "user-1/MA Grant/budget.pdf" }] });
    await chat("MA Grant/");
    expect(s3.commandCalls(ListObjectsV2Command)[0].args[0].input.Prefix).toBe("user-1/MA Grant/");
    const request = JSON.parse(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)[0].args[0].input.body as string);
    expect(JSON.stringify(request.system)).toContain("- budget.pdf");
  });
});

describe("draft generation grant access", () => {
  it("denies another state's grant sent with the trailing slash", async () => {
    const res = await draft(signedInAs(null, "MA"), "NY Grant/");
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("ACCESS_DENIED_STATE");
    expect(sfn.calls()).toHaveLength(0);
  });

  it("allows the user's own state's grant and a federal grant", async () => {
    const claims = signedInAs(null, "MA");
    expect((await draft(claims, "MA Grant/")).statusCode).toBe(200);
    expect((await draft(claims, "Federal Grant/")).statusCode).toBe(200);
    expect((await draft(claims, "Legacy Grant/")).statusCode).toBe(200);
  });

  it("denies a grant with no metadata row for a normal user but lets a Developer in", async () => {
    expect((await draft(signedInAs(null, "MA"), "Unknown Grant/")).statusCode).toBe(403);
    expect((await draft(signedInAs("Developer", "MA"), "Unknown Grant/")).statusCode).toBe(200);
  });

  it("denies when the metadata table can't be read", async () => {
    ddb.on(GetItemCommand).rejects(new Error("Throttled"));
    expect((await draft(signedInAs(null, "MA"), "Federal Grant/")).statusCode).toBe(403);
    expect(sfn.calls()).toHaveLength(0);
  });
});

describe.each([
  ["summary", () => summaryHandler, "summary.json"],
  ["questions", () => questionsHandler, "questions.json"],
])("grant %s access", (_name, handler, file) => {
  it("denies another state's grant", async () => {
    const res = await landing(handler(), signedInAs(null, "MA"), `NY Grant/${file}`);
    expect(res.statusCode).toBe(403);
    expect(s3.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it("allows the user's own state's grant and a federal grant", async () => {
    const claims = signedInAs(null, "MA");
    expect((await landing(handler(), claims, `MA Grant/${file}`)).statusCode).toBe(200);
    expect((await landing(handler(), claims, `Federal Grant/${file}`)).statusCode).toBe(200);
    expect((await landing(handler(), claims, `Legacy Grant/${file}`)).statusCode).toBe(200);
  });

  it("denies a grant with no metadata row for a normal user but lets a Developer in", async () => {
    expect((await landing(handler(), signedInAs(null, "MA"), `Unknown Grant/${file}`)).statusCode).toBe(403);
    expect((await landing(handler(), signedInAs("Developer", "MA"), `Unknown Grant/${file}`)).statusCode).toBe(200);
  });

  it("denies when the metadata table can't be read", async () => {
    ddb.on(GetItemCommand).rejects(new Error("Throttled"));
    expect((await landing(handler(), signedInAs(null, "MA"), `Federal Grant/${file}`)).statusCode).toBe(403);
  });
});

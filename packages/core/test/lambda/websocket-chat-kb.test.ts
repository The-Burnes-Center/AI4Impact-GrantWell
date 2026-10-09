import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const ws = mockClient(ApiGatewayManagementApiClient);
const kb = mockClient(BedrockAgentRuntimeClient);
const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);

let handler: (event: any) => Promise<any>;
beforeAll(async () => {
  vi.stubEnv("KB_ID", "kb-1");
  vi.stubEnv("SESSION_HANDLER", "session-fn");
  vi.stubEnv("WEBSOCKET_API_ENDPOINT", "https://ws.example");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("SONNET_MODEL_ID", "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/chat");
  ({ handler } = await import("../../lib/chatbot-api/functions/websocket-chat/index.mjs"));
});

function stream(events: object[]) {
  return {
    body: (async function* () {
      for (const e of events) yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(e)) } };
    })(),
  } as any;
}
const toolUse = () =>
  stream([
  { type: "content_block_start", content_block: { type: "tool_use", id: "t1", name: "query_db" } },
  { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"query":"eligibility"}' } },
  { type: "message_delta", delta: { stop_reason: "tool_use" } },
]);
const answer = (text: string) =>
  stream([
    { type: "content_block_delta", delta: { type: "text_delta", text } },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ]);

const sessionPayload = (body: object) => new TextEncoder().encode(JSON.stringify({ body: JSON.stringify(body) }));

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const m of [ws, kb, bedrock, ddb, lambda]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  ddb.on(GetItemCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ Payload: sessionPayload({}) as any });
  bedrock.on(InvokeModelWithResponseStreamCommand).resolvesOnce(toolUse()).resolves(answer("You qualify."));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

const chat = () =>
  handler({
    requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
    body: JSON.stringify({
      data: { userMessage: "Am I eligible?", session_id: "s1", chatHistory: [], documentIdentifier: "Grant A" },
    }),
  });

const toolResultSentBack = () => {
  const second = JSON.parse(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)[1].args[0].input.body as string);
  return second.messages.at(-1).content[0].content as string;
};

describe("chat knowledge-base search", () => {
  it("passes passages above the 0.5 score from the active grant's folder to the model", async () => {
    kb.on(RetrieveCommand).resolves({
      retrievalResults: [
        { content: { text: "Cities may apply." }, score: 0.8, location: { s3Location: { uri: "s3://nofos/Grant A/NOFO-File-PDF" } } },
        { content: { text: "Weak match." }, score: 0.4, location: { s3Location: { uri: "s3://nofos/Grant A/NOFO-File-PDF" } } },
        { content: { text: "Another grant." }, score: 0.9, location: { s3Location: { uri: "s3://nofos/Grant B/NOFO-File-PDF" } } },
      ],
    } as any);

    await chat();

    expect(toolResultSentBack()).toBe("Cities may apply.");
    const filter = kb.commandCalls(RetrieveCommand)[0].args[0].input.retrievalConfiguration!.vectorSearchConfiguration!.filter;
    expect(JSON.stringify(filter)).toContain('"documentIdentifier","value":"Grant A"');
  });

  it("logs kbRetrieveFailed and tells the model the search failed when retrieval throws", async () => {
    kb.on(RetrieveCommand).rejects(Object.assign(new Error("Service unavailable"), { name: "ServiceUnavailableException" }));

    await chat();

    const marker = LOG_MARKERS.kbRetrieveFailed[0];
    expect(errors.mock.calls.some(([line]) => String(line).includes(marker))).toBe(true);
    expect(toolResultSentBack()).toMatch(/^The search failed with an error for the active grant \(Grant A\)/);
    const posted = ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));
    expect(posted).toContain("You qualify.");
    expect(posted.some((d) => d.startsWith("<!ERROR!>"))).toBe(false);
  });

  it("ignores a spoofed user_id and searches the authenticated user's documents", async () => {
    kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
    await handler({
      requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
      body: JSON.stringify({
        data: { userMessage: "q", user_id: "victim", session_id: "s1", chatHistory: [], documentIdentifier: "Grant A" },
      }),
    });
    const filters = kb.commandCalls(RetrieveCommand).map((c) => JSON.stringify(c.args[0].input.retrievalConfiguration));
    expect(filters.some((f) => f.includes('"userId","value":"user-1"'))).toBe(true);
    expect(filters.some((f) => f.includes("victim"))).toBe(false);
  });

  it("refuses a message without an authenticated principal", async () => {
    const res = await handler({ requestContext: { connectionId: "c1", routeKey: "getChatbotResponse" }, body: "{}" });
    expect(res.statusCode).toBe(401);
    expect(bedrock.calls()).toHaveLength(0);
  });
});

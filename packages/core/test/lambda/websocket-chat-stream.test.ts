import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { haikuJudge } from "./chat-verify-fakes";

const ws = mockClient(ApiGatewayManagementApiClient);
const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);
const s3 = mockClient(S3Client);

let handler: (event: any) => Promise<any>;
beforeAll(async () => {
  vi.stubEnv("SESSION_HANDLER", "session-fn");
  vi.stubEnv("WEBSOCKET_API_ENDPOINT", "https://ws.example");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
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
const text = (t: string) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } });
const tool = (id: string, query: string) => [
  { type: "content_block_start", content_block: { type: "tool_use", id, name: "query_db" } },
  { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: JSON.stringify({ query }) } },
  { type: "content_block_stop" },
];
const stop = (reason: string) => ({ type: "message_delta", delta: { stop_reason: reason } });

const event = (data: object = {}) => ({
  requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
  body: JSON.stringify({ data: { userMessage: "Give me an overview", session_id: "s1", documentIdentifier: "Grant A", ...data } }),
});

const ERROR = "<!ERROR!>: Something went wrong while answering. Try again in a moment.";
const posted = () => ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));
const invokes = () => lambda.commandCalls(InvokeCommand).map((c) => c.args[0].input);
const saves = () =>
  invokes()
    .filter((i) => i.InvocationType !== "Event")
    .map((i) => JSON.parse(JSON.parse(String(i.Payload)).body ?? "{}"))
    .filter((b) => b.operation === "update_session");

beforeEach(() => {
  for (const m of [ws, bedrock, ddb, lambda, s3]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  ddb.on(GetItemCommand).resolves({ Item: { nofo_name: { S: "Grant A" }, scope: { S: "federal" } } });
  lambda.on(InvokeCommand).resolves({
    Payload: new TextEncoder().encode(JSON.stringify({ statusCode: 200, body: "{}" })) as any,
  });
  s3.on(GetObjectCommand).resolves({ Body: { transformToString: async () => "Grant A text." } } as any);
  bedrock.on(InvokeModelCommand).callsFake(haikuJudge());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("chat answer frames", () => {
  it("sends no tools and makes one model call", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(stream([text("The grant funds transit."), stop("end_turn")]));

    await handler(event());

    expect(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)).toHaveLength(1);
    const body = JSON.parse(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)[0].args[0].input.body as string);
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(saves()[0].new_chat_entry[0].chatbot).toBe("The grant funds transit.");
  });

  it("never sends or saves text from a call that ends in a tool call", async () => {
    bedrock
      .on(InvokeModelWithResponseStreamCommand)
      .resolves(stream([text("I'll run several focused searches in parallel."), ...tool("t1", "overview"), stop("tool_use")]));

    await handler(event());

    expect(posted()).toEqual([ERROR]);
    expect(saves()).toEqual([]);
  });

  it("never posts a long call that ends in a tool call", async () => {
    const long = "Background. ".repeat(40);
    bedrock
      .on(InvokeModelWithResponseStreamCommand)
      .resolves(stream([text(long), text("More narration."), ...tool("t1", "eligibility"), stop("tool_use")]));

    await handler(event());

    expect(posted()).toEqual([ERROR]);
    expect(saves()).toEqual([]);
  });

  it("posts a long answer as one frame once it is checked", async () => {
    const opening = "The grant funds transit. ".repeat(20);
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(stream([text(opening), text("bc"), text("d"), stop("end_turn")]));

    await handler(event());

    expect(posted()[0]).toBe(`${opening}bcd`);
    expect(posted()[1]).toBe("!<|EOF_STREAM|>!");
    expect(saves()[0].new_chat_entry[0].chatbot).toBe(`${opening}bcd`);
  });

  it("joins the text blocks of a cited answer as written", async () => {
    s3.on(GetObjectCommand).resolves({ Body: { transformToString: async () => "Applications are due March 1." } } as any);
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(
      stream([
        { type: "content_block_start", content_block: { type: "text", text: "" } },
        text("Applications are due March 1"),
        { type: "content_block_stop" },
        { type: "content_block_start", content_block: { type: "text", text: "" } },
        text(", and late ones are not read."),
        { type: "content_block_stop" },
        stop("end_turn"),
      ])
    );

    await handler(event());

    expect(saves()[0].new_chat_entry[0].chatbot).toBe("Applications are due March 1, and late ones are not read.");
  });
});

describe("chat hand-off", () => {
  beforeEach(() => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "chat-fn");
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(stream([text("You qualify."), stop("end_turn")]));
  });
  afterEach(() => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
  });

  it("hands a message to an async copy of itself and returns at once", async () => {
    const original = event();

    const res = await handler(original);

    expect(res).toEqual({ statusCode: 200 });
    expect(invokes()).toEqual([
      { FunctionName: "chat-fn", InvocationType: "Event", Payload: JSON.stringify({ ...original, grantwellChatWorker: true }) },
    ]);
    expect(bedrock.calls()).toHaveLength(0);
    expect(posted()).toEqual([]);
  });

  it("answers in the async copy without handing off again", async () => {
    const res = await handler({ ...event(), grantwellChatWorker: true });

    expect(res).toEqual({ statusCode: 200 });
    expect(invokes().some((i) => i.InvocationType === "Event")).toBe(false);
    expect(posted()).toEqual([
      "You qualify.",
      "!<|EOF_STREAM|>!",
      JSON.stringify([{ title: "Grant document", uri: "s3://grant-artifacts/Grant A/raw-text.txt" }]),
    ]);
    expect(saves()).toHaveLength(1);
  });

  it("ignores a worker marker sent in the message body", async () => {
    const forged = event({ grantwellChatWorker: true });
    forged.body = JSON.stringify({ ...JSON.parse(forged.body), grantwellChatWorker: true });

    await handler(forged);

    expect(invokes().map((i) => i.InvocationType)).toEqual(["Event"]);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("still checks the principal before handing off", async () => {
    const res = await handler({ requestContext: { connectionId: "c1", routeKey: "getChatbotResponse" }, body: "{}" });

    expect(res.statusCode).toBe(401);
    expect(invokes()).toEqual([]);
  });

  it("answers inline when the request is over the async payload limit", async () => {
    await handler(event({ userMessage: "x".repeat(300 * 1024) }));

    expect(invokes().some((i) => i.InvocationType === "Event")).toBe(false);
    expect(posted()[0]).toBe("You qualify.");
    expect(saves()).toHaveLength(1);
  });

  it("answers inline when the async invoke fails", async () => {
    lambda.on(InvokeCommand, { InvocationType: "Event" }).rejects(new Error("AccessDeniedException"));

    await handler(event());

    expect(posted()[0]).toBe("You qualify.");
    expect(saves()).toHaveLength(1);
  });
});

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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const posted = () => ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));
const invokes = () => lambda.commandCalls(InvokeCommand).map((c) => c.args[0].input);
const saves = () =>
  invokes()
    .map((i) => JSON.parse(JSON.parse(String(i.Payload)).body ?? "{}"))
    .filter((b) => b.operation === "update_session");
const modelBody = (n: number) =>
  JSON.parse(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)[n].args[0].input.body as string);

beforeEach(() => {
  for (const m of [ws, kb, bedrock, ddb, lambda]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  ddb.on(GetItemCommand).resolves({ Item: { nofo_name: { S: "Grant A" }, scope: { S: "federal" } } });
  lambda.on(InvokeCommand).resolves({
    Payload: new TextEncoder().encode(JSON.stringify({ statusCode: 200, body: "{}" })) as any,
  });
  kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("chat narration", () => {
  it("never sends or saves the text of a call that ends in a tool call", async () => {
    bedrock
      .on(InvokeModelWithResponseStreamCommand)
      .resolvesOnce(stream([text("I'll run several focused searches in parallel."), ...tool("t1", "overview"), stop("tool_use")]))
      .resolves(stream([text("### Overview\n\nThe grant funds transit."), stop("end_turn")]));

    await handler(event());

    expect(posted()).toEqual(["### Overview\n\nThe grant funds transit.", "!<|EOF_STREAM|>!", "[]"]);
    expect(saves()[0].new_chat_entry[0].chatbot).toBe("### Overview\n\nThe grant funds transit.");
  });

  it("resets the answer when a call streams past the hold and then calls a tool", async () => {
    const long = "Background. ".repeat(40);
    bedrock
      .on(InvokeModelWithResponseStreamCommand)
      .resolvesOnce(stream([text(long), text("More narration."), ...tool("t1", "eligibility"), stop("tool_use")]))
      .resolves(stream([text("You qualify."), stop("end_turn")]));

    await handler(event());

    expect(posted()).toEqual([long, "More narration.", "<!RESET!>", "You qualify.", "!<|EOF_STREAM|>!", "[]"]);
    expect(saves()[0].new_chat_entry[0].chatbot).toBe("You qualify.");
  });

  it("streams a long answer as it arrives after the hold", async () => {
    const opening = "a".repeat(299);
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(stream([text(opening), text("bc"), text("d"), stop("end_turn")]));

    await handler(event());

    expect(posted().slice(0, 2)).toEqual([`${opening}bc`, "d"]);
    expect(saves()[0].new_chat_entry[0].chatbot).toBe(`${opening}bcd`);
  });

  it("separates two text blocks of the answer with a blank line", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(
      stream([
        { type: "content_block_start", content_block: { type: "text", text: "" } },
        text("First part."),
        { type: "content_block_stop" },
        { type: "content_block_start", content_block: { type: "text", text: "" } },
        text("Second part."),
        { type: "content_block_stop" },
        stop("end_turn"),
      ])
    );

    await handler(event());

    expect(saves()[0].new_chat_entry[0].chatbot).toBe("First part.\n\nSecond part.");
  });
});

describe("chat searches", () => {
  it("runs the searches of one call in parallel and returns results in tool order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    kb.on(RetrieveCommand).callsFake(async (input) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const query = input.retrievalQuery.text;
      await new Promise((r) => setTimeout(r, query === "eligibility" ? 30 : 5));
      inFlight -= 1;
      if (JSON.stringify(input.retrievalConfiguration).includes("userDocument")) return { retrievalResults: [] };
      return {
        retrievalResults: [
          { content: { text: `Passage for ${query}.` }, score: 0.9, location: { s3Location: { uri: "s3://nofos/Grant A/NOFO-File-PDF" } } },
        ],
      };
    });
    bedrock
      .on(InvokeModelWithResponseStreamCommand)
      .resolvesOnce(stream([...tool("t1", "eligibility"), ...tool("t2", "deadline"), stop("tool_use")]))
      .resolves(stream([text("Answer."), stop("end_turn")]));

    await handler(event());

    expect(maxInFlight).toBe(4);
    const results = modelBody(1).messages.at(-1).content;
    expect(results.map((r: any) => [r.tool_use_id, r.content])).toEqual([
      ["t1", "<retrieved_passages>\nPassage for eligibility.\n</retrieved_passages>"],
      ["t2", "<retrieved_passages>\nPassage for deadline.\n</retrieved_passages>"],
    ]);
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
    expect(posted()).toEqual(["You qualify.", "!<|EOF_STREAM|>!", "[]"]);
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

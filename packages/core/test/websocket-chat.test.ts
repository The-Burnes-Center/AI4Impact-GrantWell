import { beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => {
  class Command {
    constructor(public input: any) {}
  }
  const command = (name: string) => ({ [name]: class extends Command {} })[name];
  const client = (send: (cmd: any) => unknown) =>
    class {
      send = send;
    };
  const bedrock = vi.fn();
  const posts = vi.fn();
  const lambda = vi.fn();
  const knowledgeBase = vi.fn(async () => ({ retrievalResults: [] }));
  return { command, client, bedrock, posts, lambda, knowledgeBase };
});

vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: aws.client(async (cmd: any) => {
    if (cmd.constructor.name === "PostToConnectionCommand") aws.posts(cmd.input.Data);
  }),
  PostToConnectionCommand: aws.command("PostToConnectionCommand"),
  DeleteConnectionCommand: aws.command("DeleteConnectionCommand"),
}));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: aws.client((cmd: any) => aws.bedrock(JSON.parse(cmd.input.body))),
  InvokeModelWithResponseStreamCommand: aws.command("InvokeModelWithResponseStreamCommand"),
  InvokeModelCommand: aws.command("InvokeModelCommand"),
}));
vi.mock("@aws-sdk/client-bedrock-agent-runtime", () => ({
  BedrockAgentRuntimeClient: aws.client(aws.knowledgeBase),
  RetrieveCommand: aws.command("RetrieveCommand"),
}));
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: aws.client((cmd: any) => aws.lambda(JSON.parse(JSON.parse(cmd.input.Payload).body))),
  InvokeCommand: aws.command("InvokeCommand"),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: aws.client(async () => ({})),
  ListObjectsV2Command: aws.command("ListObjectsV2Command"),
}));
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: aws.client(async () => ({})),
  AdminGetUserCommand: aws.command("AdminGetUserCommand"),
}));
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: aws.client(async () => ({})),
  GetItemCommand: aws.command("GetItemCommand"),
}));
vi.mock("@aws-sdk/util-dynamodb", () => ({ marshall: (x: unknown) => x, unmarshall: (x: unknown) => x }));

process.env.KB_ID = "kb";
process.env.SESSION_HANDLER = "session-handler";
process.env.WEBSOCKET_API_ENDPOINT = "https://ws.example";

const { handler } = await import("../lib/chatbot-api/functions/websocket-chat/index.mjs");

function stream(events: object[], failAfter?: Error) {
  return {
    body: (async function* () {
      for (const e of events) yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(e)) } };
      if (failAfter) throw failAfter;
    })(),
  };
}

const answer = (text: string) =>
  stream([
    { type: "content_block_delta", delta: { type: "text_delta", text } },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ]);

let toolCall = 0;
const toolUse = () =>
  stream([
    { type: "content_block_start", content_block: { type: "tool_use", id: `t${++toolCall}`, name: "query_db" } },
    { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"query":"eligibility"}' } },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
  ]);

const chat = () =>
  handler({
    requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
    body: JSON.stringify({
      data: { userMessage: "Am I eligible?", session_id: "s1", chatHistory: [], documentIdentifier: "nofo-a" },
    }),
  });

const sessionSaves = () => aws.lambda.mock.calls.filter(([body]) => body.operation !== "get_session");

beforeEach(() => {
  aws.bedrock.mockReset();
  aws.posts.mockReset();
  aws.lambda.mockReset();
  aws.lambda.mockImplementation(async () => ({
    Payload: Buffer.from(JSON.stringify({ body: JSON.stringify({}) })),
  }));
  toolCall = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("websocket-chat Bedrock loop", () => {
  it("stops on a failed Bedrock invoke and saves nothing", async () => {
    aws.bedrock.mockRejectedValueOnce(new Error("ThrottlingException: Too many requests"));
    aws.bedrock.mockImplementation(async () => answer("an answer the user never sees"));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    expect(aws.posts.mock.calls.filter(([d]) => String(d).startsWith("<!ERROR!>"))).toEqual([
      ["<!ERROR!>: Error: ThrottlingException: Too many requests"],
    ]);
    expect(aws.posts).not.toHaveBeenCalledWith("!<|EOF_STREAM|>!");
    expect(sessionSaves()).toEqual([]);
  });

  it("stops on a mid-stream error and saves nothing", async () => {
    aws.bedrock.mockResolvedValueOnce(
      stream([{ type: "content_block_delta", delta: { type: "text_delta", text: "partial" } }], new Error("ModelStreamErrorException")),
    );
    aws.bedrock.mockImplementation(async () => answer("an answer the user never sees"));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    expect(aws.posts).toHaveBeenCalledWith("<!ERROR!>: Error: ModelStreamErrorException");
    expect(sessionSaves()).toEqual([]);
  });

  it("makes at most 5 Bedrock calls, the last one without tool use, and saves the answer", async () => {
    aws.bedrock.mockImplementation(async (body: any) =>
      body.tool_choice?.type === "none" || aws.bedrock.mock.calls.length > 10 ? answer("final answer") : toolUse(),
    );

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(5);
    const toolChoices = aws.bedrock.mock.calls.map(([body]) => body.tool_choice?.type ?? "default");
    expect(toolChoices).toEqual(["default", "default", "default", "default", "none"]);
    expect(aws.bedrock.mock.calls[4][0].tools).toHaveLength(1);
    expect(sessionSaves()).toHaveLength(1);
    expect(sessionSaves()[0][0].new_chat_entry[0].chatbot).toBe("final answer");
  });

  it("ends after the 5th call even if the model still asks for a tool", async () => {
    aws.bedrock.mockImplementation(async () => (aws.bedrock.mock.calls.length > 10 ? answer("x") : toolUse()));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(5);
    expect(sessionSaves()).toHaveLength(1);
  });

  it("answers in one call when no tool is needed", async () => {
    aws.bedrock.mockImplementation(async () => answer("direct answer"));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    expect(aws.bedrock.mock.calls[0][0].tool_choice).toBeUndefined();
    expect(sessionSaves()[0][0].new_chat_entry[0].chatbot).toBe("direct answer");
  });
});

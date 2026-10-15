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
  DynamoDBClient: aws.client(async () => ({ Item: { nofo_name: "nofo-a", scope: "federal" } })),
  GetItemCommand: aws.command("GetItemCommand"),
}));
vi.mock("@aws-sdk/util-dynamodb", () => ({ marshall: (x: unknown) => x, unmarshall: (x: unknown) => x }));

process.env.KB_ID = "kb";
process.env.SESSION_HANDLER = "session-handler";
process.env.WEBSOCKET_API_ENDPOINT = "https://ws.example";
process.env.NOFO_METADATA_TABLE_NAME = "nofos";

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

const chat = (data: object = {}) =>
  handler({
    requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
    body: JSON.stringify({
      data: { userMessage: "Am I eligible?", session_id: "s1", chatHistory: [], documentIdentifier: "nofo-a", ...data },
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
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("websocket-chat Bedrock loop", () => {
  it("stops on a failed Bedrock invoke and saves nothing", async () => {
    aws.bedrock.mockRejectedValueOnce(new Error("ThrottlingException: Too many requests"));
    aws.bedrock.mockImplementation(async () => answer("an answer the user never sees"));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    expect(aws.posts.mock.calls.filter(([d]) => String(d).startsWith("<!ERROR!>"))).toEqual([
      ["<!ERROR!>: Something went wrong while answering. Try again in a moment."],
    ]);
    expect(console.error).toHaveBeenCalledWith(
      "Stream processing error:",
      expect.objectContaining({ message: "ThrottlingException: Too many requests" }),
    );
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
    expect(aws.posts).toHaveBeenCalledWith("<!ERROR!>: Something went wrong while answering. Try again in a moment.");
    expect(aws.posts.mock.calls.some(([d]) => String(d).includes("ModelStreamErrorException"))).toBe(false);
    expect(sessionSaves()).toEqual([]);
  });

  it("sends a plain error, not the internal one, when the request fails outside the stream", async () => {
    aws.bedrock.mockImplementation(async () => answer("an answer"));
    aws.lambda.mockRejectedValue(new Error("AccessDeniedException: lambda:InvokeFunction on arn:aws:lambda:secret"));

    await chat();

    const errors = aws.posts.mock.calls.filter(([d]) => String(d).startsWith("<!ERROR!>"));
    expect(errors).toEqual([["<!ERROR!>: Something went wrong while answering. Try again in a moment."]]);
    expect(console.error).toHaveBeenCalledWith("Error:", expect.objectContaining({ message: expect.stringContaining("arn:aws:lambda:secret") }));
  });

  it("flags an answer cut off at max_tokens and saves it with the notice", async () => {
    aws.bedrock.mockResolvedValueOnce(
      stream([
        { type: "content_block_delta", delta: { type: "text_delta", text: "The first three requirements are" } },
        { type: "message_delta", delta: { stop_reason: "max_tokens" } },
      ]),
    );

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual([
      "The first three requirements are",
      "\n\nThis answer was cut off. Ask me to continue.",
      "!<|EOF_STREAM|>!",
      "[]",
    ]);
    expect(sessionSaves()).toHaveLength(1);
    expect(sessionSaves()[0][0].new_chat_entry[0].chatbot).toBe(
      "The first three requirements are\n\nThis answer was cut off. Ask me to continue.",
    );
  });

  it("adds no notice to an answer that ends normally", async () => {
    aws.bedrock.mockImplementation(async () => answer("complete answer"));

    await chat();

    expect(aws.posts.mock.calls.some(([d]) => String(d).includes("cut off"))).toBe(false);
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

  it("sends between_tools thinking at medium effort, no sampling params and no forced tool choice", async () => {
    aws.bedrock.mockImplementation(async (body: any) => (body.tool_choice?.type === "none" ? answer("final") : toolUse()));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(5);
    for (const [body] of aws.bedrock.mock.calls) {
      expect(body.thinking).toEqual({ type: "between_tools" });
      expect(body.output_config).toEqual({ effort: "medium" });
      expect(body).not.toHaveProperty("temperature");
      expect(body).not.toHaveProperty("top_p");
      expect(body).not.toHaveProperty("top_k");
      expect([undefined, "none", "auto"]).toContain(body.tool_choice?.type);
      expect(body.messages.at(-1).role).toBe("user");
    }
  });
});

describe("websocket-chat thinking blocks", () => {
  const progressThenTool = () =>
    stream([
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Checking the eligibility " } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "section first." } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-abc" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Let me look. " } },
      { type: "content_block_stop", index: 1 },
      { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "t1", name: "query_db", input: {} } },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"query":' } },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"eligibility"}' } },
      { type: "content_block_stop", index: 2 },
      { type: "message_delta", delta: { stop_reason: "tool_use" } },
    ]);

  it("hides thinking from the user and passes it back unchanged in the next request", async () => {
    aws.bedrock.mockResolvedValueOnce(progressThenTool());
    aws.bedrock.mockImplementation(async () => answer("You are eligible."));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(2);
    const posted = aws.posts.mock.calls.map(([d]) => String(d)).join("");
    expect(posted).not.toContain("Checking the eligibility");
    expect(posted).not.toContain("sig-abc");
    expect(posted).toContain("Let me look. You are eligible.");

    const messages = aws.bedrock.mock.calls[1][0].messages;
    expect(messages.at(-2)).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Checking the eligibility section first.", signature: "sig-abc" },
        { type: "text", text: "Let me look. " },
        { type: "tool_use", id: "t1", name: "query_db", input: { query: "eligibility" } },
      ],
    });
    expect(messages.at(-1).content).toEqual([expect.objectContaining({ type: "tool_result", tool_use_id: "t1" })]);

    expect(sessionSaves()[0][0].new_chat_entry[0].chatbot).toBe("Let me look. You are eligible.");
  });
});

describe("websocket-chat refusals", () => {
  const refusal = (events: object[] = []) =>
    stream([...events, { type: "message_delta", delta: { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } } }]);

  it("tells the user plainly, logs the category and saves nothing", async () => {
    aws.bedrock.mockResolvedValueOnce(refusal());

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual(["I can't help with that request.", "!<|EOF_STREAM|>!", "[]"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("cyber"));
    expect(sessionSaves()).toEqual([]);
  });

  it("stops the tool loop on a refusal after partial output and saves nothing", async () => {
    aws.bedrock.mockResolvedValueOnce(toolUse());
    aws.bedrock.mockResolvedValueOnce(refusal([{ type: "content_block_delta", delta: { type: "text_delta", text: "Partial" } }]));
    aws.bedrock.mockImplementation(async () => answer("never requested"));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(2);
    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual(["Partial", "\n\nI can't help with that request.", "!<|EOF_STREAM|>!", "[]"]);
    expect(aws.posts.mock.calls.some(([d]) => String(d).startsWith("<!ERROR!>"))).toBe(false);
    expect(sessionSaves()).toEqual([]);
  });
});

describe("websocket-chat history", () => {
  it("appends the turn in one call, without reading the whole chat first", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    aws.lambda.mockImplementation(async () => ({ Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: "{}" })) }));

    await chat();

    expect(aws.lambda.mock.calls).toEqual([
      [
        {
          operation: "update_session",
          user_id: "user-1",
          session_id: "s1",
          new_chat_entry: [{ user: "Am I eligible?", chatbot: "You qualify.", metadata: "[]" }],
          title: "Chat about nofo-a",
          document_identifier: "nofo-a",
        },
      ],
    ]);
    expect(console.error).not.toHaveBeenCalled();
    expect(aws.posts.mock.calls.some(([d]) => String(d).startsWith("<!ERROR!>"))).toBe(false);
  });

  it("logs a turn the session handler could not save, after the user already has the answer", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    aws.lambda.mockImplementation(async () => ({
      Payload: Buffer.from(JSON.stringify({ statusCode: 500, error: "ProvisionedThroughputExceededException" })),
    }));

    await chat();

    expect(console.error).toHaveBeenCalledWith("Could not save the chat turn:", "ProvisionedThroughputExceededException");
    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual(["You qualify.", "!<|EOF_STREAM|>!", "[]"]);
  });

  it("gives the model only the last two turns it was sent", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    const chatHistory = Array.from({ length: 6 }, (_, i) => ({ user: `q${i}`, chatbot: `a${i}`, metadata: "[]" }));

    await chat({ chatHistory });

    const texts = aws.bedrock.mock.calls[0][0].messages.map((m: any) => m.content[0].text);
    expect(texts.slice(0, 4)).toEqual(["q4", "a4", "q5", "a5"]);
    expect(texts).toHaveLength(5);
  });

  it("answers a message sent without any history", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));

    await chat({ chatHistory: undefined });

    expect(aws.bedrock.mock.calls[0][0].messages).toHaveLength(1);
    expect(aws.posts).toHaveBeenCalledWith("You qualify.");
  });
});

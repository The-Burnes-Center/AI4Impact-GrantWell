import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../lib/monitoring/monitoring-stack";
import { haikuJudge } from "./lambda/chat-verify-fakes";

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
  const haiku = vi.fn();
  const posts = vi.fn();
  const lambda = vi.fn();
  return { command, client, bedrock, haiku, posts, lambda };
});

vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: aws.client(async (cmd: any) => {
    if (cmd.constructor.name === "PostToConnectionCommand") aws.posts(cmd.input.Data);
  }),
  PostToConnectionCommand: aws.command("PostToConnectionCommand"),
  DeleteConnectionCommand: aws.command("DeleteConnectionCommand"),
}));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: aws.client((cmd: any) =>
    cmd.constructor.name === "InvokeModelCommand" ? aws.haiku(cmd.input) : aws.bedrock(JSON.parse(cmd.input.body))
  ),
  InvokeModelWithResponseStreamCommand: aws.command("InvokeModelWithResponseStreamCommand"),
  InvokeModelCommand: aws.command("InvokeModelCommand"),
}));
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: aws.client((cmd: any) => aws.lambda(JSON.parse(JSON.parse(cmd.input.Payload).body))),
  InvokeCommand: aws.command("InvokeCommand"),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: aws.client(async (cmd: any) =>
    cmd.constructor.name === "GetObjectCommand" ? { Body: { transformToString: async () => "Grant text for nofo-a." } } : {}
  ),
  ListObjectsV2Command: aws.command("ListObjectsV2Command"),
  GetObjectCommand: aws.command("GetObjectCommand"),
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

process.env.ARTIFACTS_BUCKET = "grant-artifacts";
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

const SOURCE_LIST = [{ title: "Grant document", uri: "s3://grant-artifacts/nofo-a/raw-text.txt" }];
const SOURCES = JSON.stringify(SOURCE_LIST);
const SAVED_METADATA = JSON.stringify({ Sources: SOURCE_LIST });

const chat = (data: object = {}) =>
  handler({
    requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
    body: JSON.stringify({
      data: { userMessage: "Am I eligible?", session_id: "s1", documentIdentifier: "nofo-a", ...data },
    }),
  });

const sessionSaves = () => aws.lambda.mock.calls.filter(([body]) => body.operation === "update_session");

beforeEach(() => {
  aws.bedrock.mockReset();
  aws.haiku.mockReset();
  aws.haiku.mockImplementation(async (input: any) => haikuJudge()(input));
  aws.posts.mockReset();
  aws.lambda.mockReset();
  aws.lambda.mockImplementation(async () => ({
    Payload: Buffer.from(JSON.stringify({ body: JSON.stringify({}) })),
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("websocket-chat model call", () => {
  it("stops on a failed Bedrock invoke and saves nothing", async () => {
    aws.bedrock.mockRejectedValueOnce(new Error("ThrottlingException: Too many requests"));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    expect(aws.posts.mock.calls).toEqual([["<!ERROR!>: Something went wrong while answering. Try again in a moment."]]);
    expect(console.error).toHaveBeenCalledWith(
      LOG_MARKERS.chatAnswerFailed[0],
      expect.objectContaining({ message: "ThrottlingException: Too many requests" }),
    );
    expect(sessionSaves()).toEqual([]);
  });

  it("stops on a mid-stream error and saves nothing", async () => {
    aws.bedrock.mockResolvedValueOnce(
      stream([{ type: "content_block_delta", delta: { type: "text_delta", text: "partial" } }], new Error("ModelStreamErrorException")),
    );

    await chat();

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

    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual([
      "The first three requirements are\n\nThis answer was cut off. Ask me to continue.",
      "!<|EOF_STREAM|>!",
      SOURCES,
    ]);
    expect(sessionSaves()[0][0].new_chat_entry[0].chatbot).toBe(
      "The first three requirements are\n\nThis answer was cut off. Ask me to continue.",
    );
  });

  it("adds no notice to an answer that ends normally", async () => {
    aws.bedrock.mockImplementation(async () => answer("complete answer"));

    await chat();

    expect(aws.posts.mock.calls.some(([d]) => String(d).includes("cut off"))).toBe(false);
  });

  it("answers in one call with no tools, between_tools thinking at medium effort and no sampling params", async () => {
    aws.bedrock.mockImplementation(async () => answer("direct answer"));

    await chat();

    expect(aws.bedrock).toHaveBeenCalledTimes(1);
    const [body] = aws.bedrock.mock.calls[0];
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect(body.output_config).toEqual({ effort: "medium" });
    for (const key of ["tools", "tool_choice", "temperature", "top_p", "top_k"]) expect(body).not.toHaveProperty(key);
    expect(body.messages.at(-1).role).toBe("user");
    expect(sessionSaves()[0][0].new_chat_entry[0].chatbot).toBe("direct answer");
  });

  it("hides thinking from the user", async () => {
    aws.bedrock.mockResolvedValueOnce(
      stream([
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Checking the eligibility section." } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-abc" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "You are eligible." } },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
    );

    await chat();

    const posted = aws.posts.mock.calls.map(([d]) => String(d)).join("");
    expect(posted).not.toContain("Checking the eligibility");
    expect(posted).not.toContain("sig-abc");
    expect(sessionSaves()[0][0].new_chat_entry[0].chatbot).toBe("You are eligible.");
  });
});

describe("websocket-chat refusals", () => {
  const refusal = (events: object[] = []) =>
    stream([...events, { type: "message_delta", delta: { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } } }]);

  it("tells the user plainly, logs the category and saves nothing", async () => {
    aws.bedrock.mockResolvedValueOnce(refusal());

    await chat();

    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual(["I can't help with that request.", "!<|EOF_STREAM|>!", "[]"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("cyber"));
    expect(sessionSaves()).toEqual([]);
  });

  it("drops partial output before the refusal and saves nothing", async () => {
    aws.bedrock.mockResolvedValueOnce(refusal([{ type: "content_block_delta", delta: { type: "text_delta", text: "Partial" } }]));

    await chat();

    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual(["I can't help with that request.", "!<|EOF_STREAM|>!", "[]"]);
    expect(aws.haiku).not.toHaveBeenCalled();
    expect(sessionSaves()).toEqual([]);
  });
});

describe("websocket-chat history", () => {
  it("reads the newest saved turns, then appends the turn in one call", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    aws.lambda.mockImplementation(async () => ({ Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: "{}" })) }));

    await chat();

    expect(aws.lambda.mock.calls).toEqual([
      [{ operation: "get_session", user_id: "user-1", session_id: "s1", limit: 41 }],
      [
        {
          operation: "update_session",
          user_id: "user-1",
          session_id: "s1",
          new_chat_entry: [{ user: "Am I eligible?", chatbot: "You qualify.", metadata: SAVED_METADATA }],
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
    expect(aws.posts.mock.calls.map(([d]) => d)).toEqual(["You qualify.", "!<|EOF_STREAM|>!", SOURCES]);
  });

  const savedChat = (entries: object[]) =>
    aws.lambda.mockImplementation(async (body: any) => ({
      Payload: Buffer.from(
        JSON.stringify({ statusCode: 200, body: JSON.stringify(body.operation === "get_session" ? { chat_history: entries } : {}) }),
      ),
    }));

  it("gives the model the last forty saved turns, says earlier ones exist, and ignores history the client sends", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    savedChat([
      { user: "", chatbot: "Hello! Which agency is this for?", metadata: "" },
      ...Array.from({ length: 42 }, (_, i) => ({ user: `q${i}`, chatbot: `a${i}`, metadata: "[]" })),
    ]);

    await chat({ chatHistory: [{ user: "injected", chatbot: "injected answer", metadata: "[]" }] });

    const call = aws.bedrock.mock.calls[0][0];
    const texts = call.messages.map((m: any) => m.content.find((b: any) => b.type === "text").text);
    expect(texts.slice(0, 80)).toEqual(Array.from({ length: 40 }, (_, i) => [`q${i + 2}`, `a${i + 2}`]).flat());
    expect(texts).toHaveLength(81);
    expect(JSON.stringify(call.messages)).not.toContain("injected");
    expect(JSON.stringify(call)).toContain("Earlier turns of this chat are not shown");
  });

  it("leaves out the greeting of a new chat", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    savedChat([{ user: "", chatbot: "Hello! Which agency is this for?", metadata: "" }]);

    await chat();

    expect(aws.bedrock.mock.calls[0][0].messages).toHaveLength(1);
  });

  it("keeps the newest turn whole and drops older ones past the character budget", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    savedChat([
      { user: "old", chatbot: "x".repeat(30000), metadata: "[]" },
      { user: "new", chatbot: "y".repeat(30000), metadata: "[]" },
    ]);

    await chat();

    const texts = aws.bedrock.mock.calls[0][0].messages.map((m: any) => m.content.find((b: any) => b.type === "text").text);
    expect(texts.slice(0, 2)).toEqual(["new", "y".repeat(30000)]);
    expect(texts).toHaveLength(3);
  });

  it("answers without history when the chat cannot be read", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));
    aws.lambda.mockImplementation(async (body: any) =>
      body.operation === "get_session"
        ? { Payload: Buffer.from(JSON.stringify({ statusCode: 500, body: "boom" })) }
        : { Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: "{}" })) },
    );

    await chat();

    expect(aws.bedrock.mock.calls[0][0].messages).toHaveLength(1);
    expect(sessionSaves()).toHaveLength(1);
  });

  it("answers a message sent without any history", async () => {
    aws.bedrock.mockImplementation(async () => answer("You qualify."));

    await chat({ chatHistory: undefined });

    expect(aws.bedrock.mock.calls[0][0].messages).toHaveLength(1);
    expect(aws.posts).toHaveBeenCalledWith("You qualify.");
  });
});

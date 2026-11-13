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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { haikuJudge } from "./chat-verify-fakes";

const ws = mockClient(ApiGatewayManagementApiClient);
const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);
const s3 = mockClient(S3Client);

const NEXT_MODEL = "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/haiku";

type Lib = typeof import("../../lib/chatbot-api/functions/websocket-chat/next-questions.mjs");
let lib: Lib;
let handler: (event: any) => Promise<any>;

beforeAll(async () => {
  vi.stubEnv("SESSION_HANDLER", "session-fn");
  vi.stubEnv("WEBSOCKET_API_ENDPOINT", "https://ws.example");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  vi.stubEnv("SONNET_MODEL_ID", "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/chat");
  vi.stubEnv("NEXT_QUESTIONS_MODEL_ID", NEXT_MODEL);
  lib = await import("../../lib/chatbot-api/functions/websocket-chat/next-questions.mjs");
  ({ handler } = await import("../../lib/chatbot-api/functions/websocket-chat/index.mjs"));
});

const reply = (body: object) => ({ body: new TextEncoder().encode(JSON.stringify(body)) }) as any;
const questions = (list: unknown[]) => reply({ content: [{ type: "text", text: JSON.stringify({ questions: list }) }], stop_reason: "end_turn" });

let nextReply: (input: any) => any;
beforeEach(() => {
  for (const m of [ws, bedrock, ddb, lambda, s3]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  ddb.on(GetItemCommand).resolves({ Item: { nofo_name: { S: "Grant A" }, scope: { S: "federal" } } });
  lambda.on(InvokeCommand).resolves({ Payload: new TextEncoder().encode(JSON.stringify({ statusCode: 200, body: "{}" })) as any });
  s3.on(GetObjectCommand).resolves({ Body: { transformToString: async () => "Grant A text. Applications are due March 1." } } as any);
  nextReply = () => questions(["Is there a page limit?", "Who is eligible?"]);
  const judge = haikuJudge();
  bedrock.on(InvokeModelCommand).callsFake((input) => (input.modelId === NEXT_MODEL ? nextReply(input) : judge(input)));
  bedrock.on(InvokeModelWithResponseStreamCommand).callsFake(() => ({
    body: (async function* () {
      for (const e of [
        { type: "content_block_delta", delta: { type: "text_delta", text: "Applications are due March 1." } },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]) yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(e)) } };
    })(),
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const nextCalls = () => bedrock.commandCalls(InvokeModelCommand).filter((c) => c.args[0].input.modelId === NEXT_MODEL);

describe("cleanQuestions", () => {
  it("keeps up to three short questions, dropping repeats, asked ones, numbering and non-questions", () => {
    expect(
      lib.cleanQuestions(
        ["1. Is there a page limit?", "Is there a page limit?", "When is it due?", "Tell me more.", "  - Who can apply? ", "Is match required?", "Extra?"],
        ["when is it due"]
      )
    ).toEqual(["Is there a page limit?", "Who can apply?", "Is match required?"]);
    expect(lib.cleanQuestions(["x".repeat(120) + "?"])).toEqual([]);
    expect(lib.cleanQuestions(undefined)).toEqual([]);
  });
});

describe("nextQuestionsRequest", () => {
  it("caches the grant text, lists the asked questions and keeps the rules in the system prompt", () => {
    const body = lib.nextQuestionsRequest({ grantText: "<b>Grant</b>", documents: ["plan.pdf"], asked: ["When is it due?"], answer: "March 1." });
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.system).toMatch(/answerable from the grant text/);
    expect(body.system).toMatch(/Stay inside this grant/);
    expect(body.messages[0].content[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(body.messages[0].content[0].text).toContain("&lt;b&gt;Grant&lt;/b&gt;");
    expect(body.messages[0].content[1].text).toContain("- When is it due?");
    expect(body.messages[0].content[1].text).toContain("- plan.pdf");
  });
});

describe("nextQuestions", () => {
  const input = { grantText: "Grant", asked: ["When is it due?"], answer: "March 1." };

  it("returns the model's questions", async () => {
    expect(await lib.nextQuestions(input)).toEqual(["Is there a page limit?", "Who is eligible?"]);
    expect(nextCalls()).toHaveLength(1);
  });

  it("returns nothing when the call fails, refuses, is cut off or returns junk", async () => {
    nextReply = () => {
      throw new Error("ThrottlingException");
    };
    expect(await lib.nextQuestions(input)).toEqual([]);
    nextReply = () => reply({ content: [], stop_reason: "refusal" });
    expect(await lib.nextQuestions(input)).toEqual([]);
    nextReply = () => reply({ content: [{ type: "text", text: "{\"questions\": [" }], stop_reason: "max_tokens" });
    expect(await lib.nextQuestions(input)).toEqual([]);
    nextReply = () => reply({ content: [{ type: "text", text: "not json" }], stop_reason: "end_turn" });
    expect(await lib.nextQuestions(input)).toEqual([]);
  });

  it("gives up after the timeout", async () => {
    nextReply = () => new Promise(() => {});
    expect(await lib.nextQuestions(input, { timeoutMs: 20 })).toEqual([]);
  });

  it("skips the call without a model or an answer", async () => {
    expect(await lib.nextQuestions({ ...input, answer: " " })).toEqual([]);
    expect(await lib.nextQuestions(input, { modelId: "" })).toEqual([]);
    expect(nextCalls()).toHaveLength(0);
  });
});

describe("the chat handler", () => {
  const event = () => ({
    requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
    body: JSON.stringify({ data: { userMessage: "When is it due?", session_id: "s1", documentIdentifier: "Grant A" } }),
  });
  const posted = () => ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));

  it("saves the turn before the sources go out, then sends Ask next before closing", async () => {
    const order: string[] = [];
    lambda.on(InvokeCommand).callsFake(() => {
      order.push("save");
      return { Payload: new TextEncoder().encode(JSON.stringify({ statusCode: 200, body: "{}" })) as any };
    });
    ws.on(PostToConnectionCommand).callsFake((input) => {
      order.push(String(input.Data).startsWith("<!NEXT!>") ? "next" : String(input.Data) === "!<|EOF_STREAM|>!" ? "eof" : "frame");
      return {};
    });
    ws.on(DeleteConnectionCommand).callsFake(() => {
      order.push("close");
      return {};
    });

    await handler(event());

    expect(posted().at(-1)).toBe('<!NEXT!>["Is there a page limit?","Who is eligible?"]');
    const firstSave = order.indexOf("save");
    expect(firstSave).toBeLessThan(order.indexOf("eof"));
    expect(order.indexOf("next")).toBeLessThan(order.indexOf("close"));
    const prompt = JSON.parse(String(nextCalls()[0].args[0].input.body)).messages[0].content[1].text;
    expect(prompt).toContain("- When is it due?");
    expect(prompt).toContain("Applications are due March 1.");
  });

  it("closes without Ask next when the generator fails", async () => {
    nextReply = () => {
      throw new Error("boom");
    };
    await handler(event());
    expect(posted().some((d) => d.startsWith("<!NEXT!>"))).toBe(false);
    expect(ws.commandCalls(DeleteConnectionCommand)).toHaveLength(1);
  });
});

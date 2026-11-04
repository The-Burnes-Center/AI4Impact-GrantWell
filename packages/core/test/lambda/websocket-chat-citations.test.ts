import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatRequest } from "../../lib/chatbot-api/functions/websocket-chat/prompt.mjs";
import { numberCitations, pageAt, usablePageMap } from "../../lib/chatbot-api/functions/websocket-chat/citations.mjs";

const ws = mockClient(ApiGatewayManagementApiClient);
const bedrock = mockClient(BedrockRuntimeClient);
const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);
const s3 = mockClient(S3Client);

let handler: (event: any) => Promise<any>;
beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "example");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  vi.stubEnv("SESSION_HANDLER", "session-fn");
  vi.stubEnv("WEBSOCKET_API_ENDPOINT", "https://ws.example");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("DAILY_USAGE_TABLE_NAME", "daily-usage");
  vi.stubEnv("USER_POOL_ID", "pool-1");
  vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  vi.stubEnv("BUCKET", "grant-bucket");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }]));
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
const answer = (t: string) =>
  stream([
    { type: "content_block_delta", delta: { type: "text_delta", text: t } },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ]);

const rawText = (text: string) => ({ Body: { transformToString: async () => text } }) as any;
const GRANT_TEXT = "Section D.4 Applications are due March 1, 2027.";

const event = (documentIdentifier = "Grant A/") => ({
  requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
  body: JSON.stringify({ data: { userMessage: "What is the deadline?", session_id: "s1", documentIdentifier } }),
});

const sessionReply = (body: object) => ({
  Payload: new TextEncoder().encode(JSON.stringify({ statusCode: 200, body: JSON.stringify(body) })) as any,
});
const request = (n = 0) =>
  JSON.parse(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)[n].args[0].input.body as string);
const posted = () => ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));

beforeEach(() => {
  for (const m of [ws, bedrock, cognito, ddb, lambda, s3]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [{ Name: "custom:state", Value: "MA" }] });
  ddb.on(GetItemCommand).resolves({ Item: { nofo_name: { S: "Grant A" }, scope: { S: "federal" } } });
  ddb.on(UpdateItemCommand).resolves({});
  lambda.on(InvokeCommand).resolves(sessionReply({}));
  s3.on(ListObjectsV2Command).resolves({});
  s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "Grant A/raw-text.txt" }).resolves(rawText(GRANT_TEXT));
  bedrock.on(InvokeModelWithResponseStreamCommand).resolves(answer("Applications are due March 1, 2027 (§D.4)."));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const cited = (parts: Array<string | [string, object]>) =>
  stream([
    ...parts.flatMap((p) => {
      const [t, citation] = typeof p === "string" ? [p, null] : p;
      return [
        { type: "content_block_start", content_block: { type: "text", text: "" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: t } },
        ...(citation ? [{ type: "content_block_delta", delta: { type: "citations_delta", citation } }] : []),
        { type: "content_block_stop" },
      ];
    }),
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ]);

const deadline = {
  type: "char_location",
  cited_text: "Applications are due March 1, 2027.",
  document_index: 0,
  document_title: "Grant A",
  start_char_index: 12,
  end_char_index: 47,
};
const meta = () => JSON.parse(posted().at(-1)!);

describe("citation helpers", () => {
  it("finds the page holding a character", () => {
    expect([0, 9, 10, 25, 99].map((i) => pageAt([0, 10, 25], i))).toEqual([1, 1, 2, 3, 3]);
  });

  it("uses a page map only when it matches the text", () => {
    expect(usablePageMap({ chars: 5, pageStarts: [0, 3] }, "abcde")).toEqual([0, 3]);
    expect(usablePageMap({ chars: 6, pageStarts: [0, 3] }, "abcde")).toBeNull();
    expect(usablePageMap({ chars: 5, pageStarts: [0, 4, 2] }, "abcde")).toBeNull();
    expect(usablePageMap(null, "abcde")).toBeNull();
  });

  it("gives a passage cited twice one number with both places", () => {
    const out = numberCitations(
      [
        { citation: deadline, at: 10 },
        { citation: { ...deadline, start_char_index: 0, end_char_index: 11, cited_text: "Section D.4" }, at: 20 },
        { citation: deadline, at: 30 },
      ],
      [{ title: "Grant document", pageStarts: [0, 30] }]
    );
    expect(out).toEqual([
      { n: 1, at: [10, 30], quote: "Applications are due March 1, 2027.", document: "Grant document", page: 1, lastPage: 2 },
      { n: 2, at: [20], quote: "Section D.4", document: "Grant document", page: 1, lastPage: 1 },
    ]);
  });

  it("reads PDF pages from the citation and skips unknown documents", () => {
    const pdf = { type: "page_location", cited_text: "Match: $415,000", document_index: 1, start_page_number: 3, end_page_number: 4 };
    expect(numberCitations([{ citation: pdf, at: 5 }, { citation: { ...pdf, document_index: 7 }, at: 6 }], [{ title: "G" }, { title: "board.pdf" }])).toEqual([
      { n: 1, at: [5], quote: "Match: $415,000", document: "board.pdf", page: 3, lastPage: 3 },
    ]);
  });
});

describe("chat request with citations", () => {
  const parts = { instructions: "STABLE", grantText: "Grant body", context: "ctx", question: "Q?" };

  it("opens the first message with the cached grant document and caches nothing in system", () => {
    const { system, messages } = buildChatRequest({ ...parts, citations: true, grantTitle: "Grant A" });
    expect(system).toEqual([{ type: "text", text: "STABLE" }]);
    expect(messages[0].content[0]).toEqual({
      type: "document",
      source: { type: "text", media_type: "text/plain", data: "Grant body" },
      title: "Grant A",
      citations: { enabled: true },
      cache_control: { type: "ephemeral" },
    });
  });

  it("keeps the grant first when the chat has history and supporting documents", () => {
    const doc = { type: "document", source: { type: "text", media_type: "text/plain", data: "Budget" }, citations: { enabled: true } };
    const { messages } = buildChatRequest({ ...parts, citations: true, applicantDocuments: [doc], turns: [{ user: "Earlier", chatbot: "Answer" }] });
    expect(messages[0].content.map((b: any) => [b.type, b.title ?? b.text, !!b.cache_control])).toEqual([
      ["document", "Grant document", true],
      ["document", undefined, true],
      ["text", "Earlier", false],
    ]);
  });
});

describe("chat answers with citations", () => {
  it("sends the quotes with page numbers and where each one goes in the answer", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "Grant A/raw-text-pages.json" }).resolves(
      rawText(JSON.stringify({ chars: GRANT_TEXT.length, pageStarts: [0, 12] }))
    );
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Applications are due March 1, 2027.", deadline], " Plan ahead."]));

    await handler(event());

    const answerText = "Applications are due March 1, 2027. Plan ahead.";
    expect(posted().slice(0, -2).join("")).toBe(answerText);
    expect(meta()).toEqual({
      Sources: [{ title: "Grant document", uri: "s3://grant-artifacts/Grant A/raw-text.txt" }],
      Citations: [{ n: 1, at: [35], quote: "Applications are due March 1, 2027.", document: "Grant document", page: 2, lastPage: 2 }],
    });
    const saved = JSON.parse(String(lambda.commandCalls(InvokeCommand).at(-1)!.args[0].input.Payload));
    const entry = JSON.parse(saved.body).new_chat_entry[0];
    expect(entry.chatbot).toBe(answerText);
    expect(JSON.parse(entry.metadata).Citations).toHaveLength(1);
  });

  it("places a marker before the cited text's trailing space", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Due March 1.\n\n", deadline], "- Late ones are not read."]));

    await handler(event());

    expect(meta().Citations[0]).toMatchObject({ at: [12] });
    expect(meta().Citations[0]).not.toHaveProperty("page");
  });

  it("ignores a page map written for different text", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "Grant A/raw-text-pages.json" }).resolves(
      rawText(JSON.stringify({ chars: GRANT_TEXT.length + 1, pageStarts: [0, 12] }))
    );
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Due March 1.", deadline]]));

    await handler(event());

    expect(meta().Citations[0]).not.toHaveProperty("page");
  });

  it("keeps the plain Sources list when the answer cites nothing", async () => {
    await handler(event());

    expect(meta()).toEqual([{ title: "Grant document", uri: "s3://grant-artifacts/Grant A/raw-text.txt" }]);
  });

  it("cites nothing when answering from the summary", async () => {
    const missing = Object.assign(new Error("missing"), { name: "NoSuchKey" });
    s3.on(GetObjectCommand, { Key: "Grant A/raw-text.txt" }).rejects(missing);
    s3.on(GetObjectCommand, { Key: "Grant A/summary.json" }).resolves(rawText("{}"));
    lambda.on(InvokeCommand).callsFake((input) =>
      String(input.Payload).includes("get_session") ? sessionReply({ document_keys: ["user-1/documents/board.txt"], chat_history: [] }) : sessionReply({})
    );
    s3.on(ListObjectsV2Command, { Bucket: "user-docs" }).resolves({
      Contents: [{ Key: "user-1/documents/board.txt", Size: 40, LastModified: new Date("2026-11-01") }],
    });
    s3.on(GetObjectCommand, { Bucket: "user-docs", Key: "user-1/documents/board.txt" }).resolves({
      Body: { transformToByteArray: async () => new TextEncoder().encode("The board approved a match.") },
    } as any);

    await handler(event());

    expect(JSON.stringify(request())).not.toContain('"citations"');
    expect(JSON.stringify(request().messages[0].content)).toContain('<document name=\\"board.txt\\">');
  });

  it("makes each supporting PDF a citable document", async () => {
    lambda.on(InvokeCommand).callsFake((input) =>
      String(input.Payload).includes("get_session") ? sessionReply({ document_keys: ["user-1/documents/board.pdf"], chat_history: [] }) : sessionReply({})
    );
    s3.on(ListObjectsV2Command, { Bucket: "user-docs" }).resolves({
      Contents: [{ Key: "user-1/documents/board.pdf", Size: 40, LastModified: new Date("2026-11-01") }],
    });
    s3.on(GetObjectCommand, { Bucket: "user-docs", Key: "user-1/documents/board.pdf" }).resolves({
      Body: { transformToByteArray: async () => new TextEncoder().encode("%PDF-1.7 fake") },
    } as any);
    const pdfCite = { type: "page_location", cited_text: "Match approved", document_index: 1, start_page_number: 2, end_page_number: 3 };
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["The board approved the match.", pdfCite]]));

    await handler(event());

    expect(request().messages[0].content[1]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf" },
      title: "board.pdf",
      citations: { enabled: true },
    });
    expect(meta().Citations).toEqual([{ n: 1, at: [29], quote: "Match approved", document: "board.pdf", page: 2, lastPage: 2 }]);
  });
});

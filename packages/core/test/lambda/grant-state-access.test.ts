import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { haikuJudge } from "./chat-verify-fakes";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { marshall } from "@aws-sdk/util-dynamodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  "Held Grant": { nofo_name: "Held Grant", scope: "federal", status: "quarantined" },
  "New Grant": { nofo_name: "New Grant", scope: "state", state: "MA", status: "processing" },
  "NY Held Grant": { nofo_name: "NY Held Grant", scope: "state", state: "NY", status: "quarantined" },
};

const IN_REVIEW = "This grant is being reviewed and will be back soon.";

let warns: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const m of [ws, kb, bedrock, cognito, ddb, lambda, s3, sfn]) m.reset();
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
  bedrock.on(InvokeModelWithResponseStreamCommand).callsFake(answer);
  bedrock.on(InvokeModelCommand).callsFake(haikuJudge());
  lambda.on(InvokeCommand).resolves({ Payload: new TextEncoder().encode(JSON.stringify({ body: "{}" })) as any });
  ddb.on(GetItemCommand).callsFake((input) => {
    const row = grants[input.Key?.nofo_name?.S];
    return row ? { Item: marshall(row) } : {};
  });
  ddb.on(PutItemCommand).resolves({});
  s3.on(ListObjectsV2Command).resolves({});
  s3.on(GetObjectCommand).callsFake((input) =>
    input.Key?.endsWith("/raw-text.txt")
      ? { Body: { transformToString: async () => "Grant text." } }
      : { Body: Readable.from([Buffer.from(JSON.stringify({ questions: [] }))]) }
  );
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

// Answers only: each answer is also checked with a separate (non-streaming) model call.
const answered = () => bedrock.commandCalls(InvokeModelWithResponseStreamCommand);

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
    expect(answered()).toHaveLength(3);
  });

  it("denies a grant with no metadata row for a normal user but lets a Developer in", async () => {
    signedInAs(null, "MA");
    await chat("Unknown Grant/");
    expect(chatDenied()).toBe(true);

    ws.resetHistory();
    signedInAs("Developer", "MA");
    await chat("Unknown Grant/");
    expect(chatDenied()).toBe(false);
    expect(answered()).toHaveLength(1);
  });

  it("denies when the metadata table can't be read", async () => {
    signedInAs(null, "MA");
    ddb.on(GetItemCommand).rejects(new Error("Throttled"));
    await chat("Federal Grant/");
    expect(chatDenied()).toBe(true);
    expect(warns).toHaveBeenCalled();
  });

  it("includes an older chat's grant-folder uploads when the identifier ends in a slash", async () => {
    signedInAs(null, "MA");
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "user-1/MA Grant//budget.txt", Size: 20, LastModified: new Date("2026-10-01") }] });
    s3.on(GetObjectCommand, { Key: "user-1/MA Grant//budget.txt" }).resolves({
      Body: { transformToByteArray: async () => new TextEncoder().encode("Budget: $50,000") },
    } as any);
    await chat("MA Grant/");
    expect(s3.commandCalls(ListObjectsV2Command)[0].args[0].input.Prefix).toBe("user-1/");
    const request = JSON.parse(bedrock.commandCalls(InvokeModelWithResponseStreamCommand)[0].args[0].input.body as string);
    expect(JSON.stringify(request.messages[0].content)).toContain("Budget: $50,000");
    expect(JSON.stringify(request.messages.at(-1))).toContain("- budget.txt");
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

describe("grants held for review", () => {
  const posted = () => ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));

  it("chat answers with the in-review message before the model, the cap or the saved chat", async () => {
    vi.stubEnv("DAILY_USAGE_TABLE_NAME", "daily-usage");
    try {
      signedInAs(null, "MA");
      await chat("Held Grant/");
      await chat("New Grant/");
    } finally {
      vi.stubEnv("DAILY_USAGE_TABLE_NAME", "");
    }
    expect(posted().filter((d) => d === IN_REVIEW)).toHaveLength(2);
    expect(bedrock.calls()).toHaveLength(0);
    expect(ddb.calls().filter((c) => (c.args[0].input as { TableName?: string }).TableName === "daily-usage")).toHaveLength(0);
    expect(lambda.calls()).toHaveLength(0);
    expect(ws.commandCalls(DeleteConnectionCommand)).toHaveLength(2);
  });

  it("chat still answers a Developer and a platform admin on a grant in review", async () => {
    signedInAs("Developer", "MA");
    await chat("Held Grant/");
    signedInAs("PlatformAdmin", "");
    await chat("Held Grant/");
    expect(posted()).not.toContain(IN_REVIEW);
    expect(answered()).toHaveLength(2);
  });

  it("chat answers a state admin on their own state's grant in review, and no other", async () => {
    signedInAs("Admin", "MA");
    await chat("New Grant/");
    expect(posted()).not.toContain(IN_REVIEW);
    expect(answered()).toHaveLength(1);

    ws.resetHistory();
    await chat("Held Grant/");
    expect(posted()).toContain(IN_REVIEW);
    ws.resetHistory();
    signedInAs("Admin", "NY");
    await chat("New Grant/");
    expect(chatDenied()).toBe(true);
    expect(answered()).toHaveLength(1);
  });

  it("chat holds a user to the in-review message on their own state's grant", async () => {
    signedInAs(null, "MA");
    await chat("New Grant/");
    expect(posted()).toContain(IN_REVIEW);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("the AI writer runs for a state admin on their own state's grant in review, and no other", async () => {
    const claims = signedInAs("Admin", "MA");
    expect((await draft(claims, "New Grant")).statusCode).toBe(200);
    expect((await draft(claims, "Held Grant")).statusCode).toBe(409);
    expect(sfn.calls()).toHaveLength(1);
  });

  it("the summary opens a state admin's own state's grant in review in full, and no other", async () => {
    const res = await landing(summaryHandler, signedInAs("Admin", "MA"), "New Grant/summary.json");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).not.toHaveProperty("inReview");
    expect((await landing(summaryHandler, signedInAs("Admin", "MA"), "Held Grant/summary.json")).statusCode).toBe(409);
    expect((await landing(summaryHandler, signedInAs("Admin", "NY"), "Held Grant/summary.json")).statusCode).toBe(409);
    expect((await landing(summaryHandler, signedInAs("Admin", "MA"), "NY Held Grant/summary.json")).statusCode).toBe(403);
  });

  describe("on a single-state site", () => {
    let chatOn: Handler;
    let draftOn: Handler;
    let summaryOn: Handler;
    beforeAll(async () => {
      vi.stubEnv("SINGLE_STATE", "MA");
      vi.resetModules();
      ({ handler: chatOn } = await import("../../lib/chatbot-api/functions/websocket-chat/index.mjs"));
      ({ handler: draftOn } = await import("../../lib/chatbot-api/gateway/api-routes/draft-generation/index.mjs"));
      ({ handler: summaryOn } = await import("../../lib/chatbot-api/functions/landing-page/retrieveNOFOSummary/index.mjs"));
    });
    afterAll(() => {
      vi.stubEnv("SINGLE_STATE", "");
    });
    const chatAs = (documentIdentifier: string) =>
      chatOn({
        requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
        body: JSON.stringify({ data: { userMessage: "Am I eligible?", session_id: "s1", chatHistory: [], documentIdentifier } }),
      });

    it("a state admin opens any grant held for review, federal ones included", async () => {
      const claims = signedInAs("Admin", "MA");
      await chatAs("Held Grant/");
      expect(posted()).not.toContain(IN_REVIEW);
      expect(answered()).toHaveLength(1);
      expect((await draftOn({
        requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "user-1", ...claims } } } },
        body: JSON.stringify({ query: "Write the draft", documentIdentifier: "Held Grant", sessionId: "s1" }),
      })).statusCode).toBe(200);
      const summary = await landing(summaryOn, claims, "Held Grant/summary.json");
      expect(summary.statusCode).toBe(200);
      expect(JSON.parse(summary.body)).not.toHaveProperty("inReview");
    });

    it("a user still sees only the in-review message", async () => {
      const claims = signedInAs(null, "MA");
      await chatAs("Held Grant/");
      expect(posted()).toContain(IN_REVIEW);
      expect((await landing(summaryOn, claims, "Held Grant/summary.json")).statusCode).toBe(409);
    });
  });

  it("the AI writer refuses to start or rewrite sections for a grant in review", async () => {
    const claims = signedInAs(null, "MA");
    for (const res of [await draft(claims, "Held Grant/"), await draft(claims, "New Grant")]) {
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({ error: "GRANT_IN_REVIEW", message: IN_REVIEW });
    }
    const retry = await draftHandler({
      requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "user-1", ...claims } } } },
      body: JSON.stringify({ query: "Write the draft", documentIdentifier: "Held Grant", sessionId: "s1", sectionIds: ["need"] }),
    });
    expect(retry.statusCode).toBe(409);
    expect(sfn.calls()).toHaveLength(0);
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("the AI writer still runs for a Developer on a grant in review", async () => {
    expect((await draft(signedInAs("Developer", "MA"), "Held Grant/")).statusCode).toBe(200);
    expect(sfn.calls()).toHaveLength(1);
  });

  it("the summary refuses a grant in review with the message and a way home", async () => {
    const res = await landing(summaryHandler, signedInAs(null, "MA"), "Held Grant/summary.json");
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toEqual({ error: "GRANT_IN_REVIEW", message: IN_REVIEW, cta: { label: "Go to home", target: "/home" } });
    expect(s3.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it("the summary gives an application only the grant's name and section names while it is in review", async () => {
    s3.on(GetObjectCommand).callsFake(() => ({
      Body: Readable.from([
        Buffer.from(
          JSON.stringify({
            GrantName: "New Grant",
            EligibilityCriteria: [{ item: "Tribes", description: "Unconfirmed." }],
            ProjectNarrativeSections: [{ item: "Need", description: "The need." }],
          })
        ),
      ]),
    }));
    const res = await summaryHandler({
      queryStringParameters: { documentKey: "New Grant/summary.json", for: "application" },
      requestContext: { authorizer: { jwt: { claims: { sub: "user-1", ...signedInAs(null, "MA") } } } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.inReview).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(["GrantName", "ProjectNarrativeSections"]);
    expect(body.data.ProjectNarrativeSections).toEqual([{ item: "Need", id: "need" }]);
  });

  it("the summary still opens a grant in review for a Developer and a platform admin", async () => {
    expect((await landing(summaryHandler, signedInAs("Developer", "MA"), "Held Grant/summary.json")).statusCode).toBe(200);
    expect((await landing(summaryHandler, signedInAs("PlatformAdmin", ""), "Held Grant/summary.json")).statusCode).toBe(200);
  });

  const HELD_QUESTIONS = { questions: [{ id: 1, question: "Who will you serve?", helpText: "Unconfirmed guidance." }] };
  const serveQuestions = () =>
    s3.on(GetObjectCommand).callsFake(() => ({ Body: Readable.from([Buffer.from(JSON.stringify(HELD_QUESTIONS))]) }));

  it("the questions refuse a grant in review with the message and a way home", async () => {
    serveQuestions();
    for (const grant of ["Held Grant", "New Grant"]) {
      const res = await landing(questionsHandler, signedInAs(null, "MA"), `${grant}/questions.json`);
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({ error: "GRANT_IN_REVIEW", message: IN_REVIEW, cta: { label: "Go to home", target: "/home" } });
    }
    expect(s3.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it("the questions give an application only the question text while its grant is in review", async () => {
    serveQuestions();
    const res = await questionsHandler({
      queryStringParameters: { documentKey: "Held Grant/questions.json", for: "application" },
      requestContext: { authorizer: { jwt: { claims: { sub: "user-1", ...signedInAs(null, "MA") } } } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.inReview).toBe(true);
    expect(body.data).toEqual({ questions: [{ id: 1, question: "Who will you serve?" }] });
  });

  it("the questions open a grant in review in full for whoever may open it", async () => {
    serveQuestions();
    for (const [role, state, grant] of [
      ["Developer", "MA", "Held Grant"],
      ["PlatformAdmin", "", "Held Grant"],
      ["Admin", "MA", "New Grant"],
    ]) {
      const res = await landing(questionsHandler, signedInAs(role, state), `${grant}/questions.json`);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).not.toHaveProperty("inReview");
      expect(JSON.parse(res.body).data).toEqual(HELD_QUESTIONS);
    }
    expect((await landing(questionsHandler, signedInAs("Admin", "MA"), "Held Grant/questions.json")).statusCode).toBe(409);
  });
});

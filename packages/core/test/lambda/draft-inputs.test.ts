import { mockClient } from "aws-sdk-client-mock";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const kb = mockClient(BedrockAgentRuntimeClient);
const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);
const sfn = mockClient(SFNClient);

type Handler = (event: any) => Promise<any>;
let start: Handler;
let prepare: Handler;
let generateSection: Handler;
beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("KB_ID", "kb-1");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofo-metadata");
  vi.stubEnv("BUCKET", "nofos");
  vi.stubEnv("DRAFT_GENERATION_JOBS_TABLE_NAME", "jobs");
  vi.stubEnv("DRAFT_GENERATION_STATE_MACHINE_ARN", "arn:aws:states:us-east-1:111111111111:stateMachine:draft");
  vi.stubEnv("SONNET_MODEL_ID", "model-1");
  ({ handler: start } = await import("../../lib/chatbot-api/gateway/api-routes/draft-generation/index.mjs"));
  ({ handler: prepare } = await import("../../lib/chatbot-api/functions/draft-pipeline/prepare/index.mjs"));
  ({ handler: generateSection } = await import("../../lib/chatbot-api/functions/draft-pipeline/generate-section/index.mjs"));
});

beforeEach(() => {
  for (const m of [kb, bedrock, ddb, s3, sfn]) m.reset();
  ddb.on(GetItemCommand).resolves({});
  ddb.on(GetItemCommand, { TableName: "nofo-metadata" }).resolves({ Item: { nofo_name: { S: "Grant A" }, scope: { S: "federal" } } });
  ddb.on(PutItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  sfn.on(StartExecutionCommand).resolves({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const answers = [
  { question: "Who will the project serve?", answer: "Rural seniors in Franklin County" },
  { question: "", answer: "An answer whose question was removed" },
];

describe("starting a draft", () => {
  const post = (body: object, sub = "user-1") =>
    start({
      requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub } } } },
      body: JSON.stringify(body),
    });

  it("passes additional information and answers with their questions to the pipeline, owned by the caller", async () => {
    const res = await post({
      query: "Generate all sections",
      documentIdentifier: "Grant A",
      sessionId: "s1",
      questionnaire: { question_1: "Rural seniors in Franklin County" },
      questionnaireAnswers: [...answers, { question: "Skipped", answer: "  " }, "junk"],
      additionalInfo: "We partner with the county council on aging.",
      userId: "someone-else",
    });
    expect(res.statusCode).toBe(200);
    const input = JSON.parse(sfn.commandCalls(StartExecutionCommand)[0].args[0].input.input as string);
    expect(input).toMatchObject({
      additionalInfo: "We partner with the county council on aging.",
      questionnaireAnswers: answers,
      questionnaire: { question_1: "Rural seniors in Franklin County" },
      userId: "user-1",
    });
  });

  it("still starts for an older client that sends neither field", async () => {
    await post({ query: "q", documentIdentifier: "Grant A", sessionId: "s1", questionnaire: { question_1: "x" } });
    const input = JSON.parse(sfn.commandCalls(StartExecutionCommand)[0].args[0].input.input as string);
    expect(input).toMatchObject({ additionalInfo: "", questionnaireAnswers: [], questionnaire: { question_1: "x" } });
  });

  const base = { query: "q", documentIdentifier: "Grant A", sessionId: "s1" };
  const long = "x".repeat(10001);

  it("accepts additional information and answers of exactly 10,000 characters", async () => {
    const full = "x".repeat(10000);
    const res = await post({
      ...base,
      additionalInfo: full,
      questionnaire: { question_1: full },
      questionnaireAnswers: [{ question: "Q", answer: full }],
    });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ["additional information", { additionalInfo: long }, "Additional information can be up to 10,000 characters."],
    ["an answer", { questionnaireAnswers: [{ question: "Q", answer: long }] }, "Each answer can be up to 10,000 characters."],
    ["a saved answer", { questionnaire: { question_1: long } }, "Each answer can be up to 10,000 characters."],
  ])("rejects %s over 10,000 characters before counting the application", async (_label, fields, message) => {
    const res = await post({ ...base, ...fields });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "INPUT_TOO_LONG", message });
    expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(0);
  });
});

describe("preparing a draft", () => {
  const summary = {
    ProjectNarrativeSections: [
      { item: "Need", description: "Describe the need." },
      { item: "Budget", description: "Justify each cost." },
    ],
  };

  beforeEach(() => {
    s3.on(GetObjectCommand).resolves({ Body: { transformToString: async () => JSON.stringify(summary) } } as any);
  });

  const run = (fields: object = {}) =>
    prepare({
      jobId: "job-1",
      query: "Generate all sections",
      documentIdentifier: "federal/Grant A/",
      sessionId: "s1",
      userId: "user-1",
      userState: "MA",
      questionnaire: { question_1: "x" },
      questionnaireAnswers: answers,
      additionalInfo: "We partner with the council on aging.",
      ...fields,
    });

  it("splits the grant into sections without searching, leaving retrieval to each section", async () => {
    const out = await run();
    expect(kb.commandCalls(RetrieveCommand)).toHaveLength(0);
    expect(out.sections).toEqual([
      { item: "Need", description: "Describe the need.", index: 0 },
      { item: "Budget", description: "Justify each cost.", index: 1 },
    ]);
    expect(out).not.toHaveProperty("grantInfos");
    expect(out).not.toHaveProperty("applicantDocuments");
    expect(out).toMatchObject({
      userId: "user-1",
      additionalInfo: "We partner with the council on aging.",
      questionnaireAnswers: answers,
    });
  });

  it("defaults missing inputs from an older client", async () => {
    const out = await run({ additionalInfo: undefined, questionnaireAnswers: undefined });
    expect(out).toMatchObject({ additionalInfo: "", questionnaireAnswers: [] });
  });
});

describe("writing a section", () => {
  const reply = () => ({
    body: new TextEncoder().encode(
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ content: "Section text." }) }] })
    ),
  });

  const grantChunk = {
    content: { text: "Applicants must serve rural areas.", type: "TEXT" },
    location: { s3Location: { uri: "s3://nofos/federal/Grant A/NOFO-File-TXT" } },
    metadata: { documentType: "NOFO" },
  };
  const userChunk = (uri: string, text: string) => ({
    content: { text, type: "TEXT" },
    location: { s3Location: { uri } },
    metadata: { documentType: "userDocument", fileName: uri.split("/").pop() },
  });
  const isUserSearch = (input: any) =>
    input.retrievalConfiguration.vectorSearchConfiguration.filter.andAll[0].equals.value === "userDocument";

  const write = (fields: object = {}) =>
    generateSection({
      sectionItem: { item: "Need", description: "Describe the need.", index: 0 },
      jobId: "job-1",
      query: "Generate all sections",
      documentIdentifier: "federal/Grant A/",
      projectBasics: { projectName: "Meals on Wheels" },
      questionnaire: { question_1: "Rural seniors in Franklin County" },
      userId: "user-1",
      totalSections: 2,
      sectionNames: ["Need", "Budget"],
      ...fields,
    });

  const prompt = (i = 0) =>
    JSON.parse(bedrock.commandCalls(InvokeModelCommand)[i].args[0].input.body as string).messages[0].content as string;
  const retrievals = () => kb.commandCalls(RetrieveCommand).map((c) => c.args[0].input as any);

  beforeEach(() => {
    bedrock.on(InvokeModelCommand).resolves(reply() as any);
    kb.on(RetrieveCommand).callsFake((input) =>
      isUserSearch(input)
        ? {
            retrievalResults: [
              userChunk("s3://userdocs/user-1/Grant A/budget.pdf", "Our budget is $40,000."),
              userChunk("s3://userdocs/user-2/Grant A/other.pdf", "Another user's text."),
              userChunk("s3://userdocs/user-1/Grant B/old.pdf", "Another grant's text."),
            ],
          }
        : { retrievalResults: [grantChunk] }
    );
  });

  it("searches the grant and the user's documents with a query built from each section's own title and description", async () => {
    await write();
    await write({ sectionItem: { item: "Budget", description: "Justify each cost.", index: 1 } });
    const calls = retrievals();
    expect(calls).toHaveLength(4);
    const [needCalls, budgetCalls] = [calls.slice(0, 2), calls.slice(2)];
    for (const c of needCalls) {
      expect(c.retrievalQuery.text).toContain("Need");
      expect(c.retrievalQuery.text).toContain("Describe the need.");
      expect(c.retrievalQuery.text).not.toContain("Justify each cost.");
    }
    for (const c of budgetCalls) {
      expect(c.retrievalQuery.text).toContain("Budget");
      expect(c.retrievalQuery.text).toContain("Justify each cost.");
      expect(c.retrievalQuery.text).not.toContain("Describe the need.");
    }
    expect(calls.every((c) => c.knowledgeBaseId === "kb-1")).toBe(true);
  });

  it("keeps the grant filter and scopes the user search to the job's user and this grant", async () => {
    await write({ userId: "user-1" });
    const calls = retrievals();
    const grant = calls.find((c) => !isUserSearch(c));
    const user = calls.find(isUserSearch);
    expect(grant.retrievalConfiguration.vectorSearchConfiguration).toEqual({
      numberOfResults: 10,
      filter: {
        andAll: [
          { equals: { key: "documentType", value: "NOFO" } },
          { equals: { key: "documentIdentifier", value: "federal/Grant A" } },
        ],
      },
    });
    expect(user.retrievalConfiguration.vectorSearchConfiguration).toEqual({
      numberOfResults: 5,
      filter: {
        andAll: [
          { equals: { key: "documentType", value: "userDocument" } },
          { equals: { key: "userId", value: "user-1" } },
          { equals: { key: "nofoName", value: "Grant A" } },
        ],
      },
    });
  });

  it("takes the user from the job, not the section item", async () => {
    await write({
      userId: "user-2",
      sectionItem: { item: "Need", description: "Describe the need.", index: 0, userId: "user-1" },
    });
    const user = retrievals().find(isUserSearch);
    expect(user.retrievalConfiguration.vectorSearchConfiguration.filter.andAll[1]).toEqual({
      equals: { key: "userId", value: "user-2" },
    });
  });

  it("skips the user-document search without a user on the job", async () => {
    await write({ userId: undefined });
    expect(retrievals()).toHaveLength(1);
    expect(isUserSearch(retrievals()[0])).toBe(false);
    expect(prompt()).not.toContain("<applicant_documents>");
  });

  it("still writes the section when a search fails", async () => {
    kb.on(RetrieveCommand).rejects(new Error("throttled"));
    await expect(write()).resolves.toEqual({ sectionName: "Need", status: "completed" });
    expect(prompt()).not.toContain("<applicant_documents>");
  });

  it("gives the writer the additional information, each question with its answer, and the applicant's documents", async () => {
    await write({
      questionnaireAnswers: answers,
      additionalInfo: "We partner with the county council on aging.",
    });
    const text = prompt();
    expect(text).toContain("<additional_information>");
    expect(text).toContain("We partner with the county council on aging.");
    expect(text).toContain("<question>Who will the project serve?</question>\n<answer>Rural seniors in Franklin County</answer>");
    expect(text).toContain("<answer>An answer whose question was removed</answer>");

    const docs = text.slice(text.indexOf("<applicant_documents>"), text.indexOf("</applicant_documents>"));
    expect(docs).toContain("applicant's own supporting documents");
    expect(docs).toContain('<document name="budget.pdf">\nOur budget is $40,000.\n</document>');
    expect(docs).not.toContain("Another user's text.");
    expect(docs).not.toContain("Another grant's text.");
    expect(docs).not.toContain("Applicants must serve rural areas.");
    const grant = text.slice(text.indexOf("<grant_knowledge_base>"), text.indexOf("</grant_knowledge_base>"));
    expect(grant).toContain('<grant_entry id="unknown">\nApplicants must serve rural areas.\n</grant_entry>');
    expect(grant).not.toContain("Our budget");
  });

  it("falls back to the saved answers and leaves out empty blocks for a job started by an older client", async () => {
    kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
    await write();
    const text = prompt();
    expect(text).toContain('"question_1": "Rural seniors in Franklin County"');
    expect(text).not.toContain("<additional_information>");
    expect(text).not.toContain("<applicant_documents>");
  });
});

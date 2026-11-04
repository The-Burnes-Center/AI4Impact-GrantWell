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
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
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

  it("passes on only the caller's own selected documents, and no selection as null", async () => {
    const asUser = (body: object) =>
      start({
        requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "sub-1", "cognito:username": "alex" } } } },
        body: JSON.stringify({ query: "q", documentIdentifier: "Grant A", sessionId: "s1", ...body }),
      });
    await asUser({
      documentKeys: ["alex/documents/plan.pdf", "alex/documents/plan.pdf", "sam/documents/x.pdf", "alex/../sam/y.pdf", 7],
    });
    await asUser({});
    const [chosen, legacy] = sfn.commandCalls(StartExecutionCommand).map((c) => JSON.parse(c.args[0].input.input as string));
    expect(chosen).toMatchObject({ userId: "sub-1", documentOwner: "alex", documentKeys: ["alex/documents/plan.pdf"] });
    expect(legacy.documentKeys).toBeNull();
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
      { id: "need", item: "Need", description: "Describe the need.", index: 0 },
      { id: "budget", item: "Budget", description: "Justify each cost.", index: 1 },
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
    expect(out).toMatchObject({ additionalInfo: "", questionnaireAnswers: [], documentKeys: null, documentOwner: "user-1" });
  });

  it("runs the first section alone so it writes the shared cache the others read", async () => {
    const out = await run({ documentKeys: ["user-1/documents/a.pdf"], documentOwner: "alex" });
    expect(out.warmSections.map((s: any) => s.id)).toEqual(["need"]);
    expect(out.remainingSections.map((s: any) => s.id)).toEqual(["budget"]);
    expect(out).toMatchObject({ documentKeys: ["user-1/documents/a.pdf"], documentOwner: "alex" });
  });
});

describe("writing a section", () => {
  const reply = () => ({
    body: new TextEncoder().encode(
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ content: "Section text." }) }] })
    ),
  });
  const text = (body: string) => ({ Body: { transformToString: async () => body } }) as any;
  const missing = () => Object.assign(new Error("missing"), { name: "NoSuchKey" });

  const write = (fields: object = {}) =>
    generateSection({
      sectionItem: { id: "need", item: "Need", description: "Describe the need.", index: 0 },
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

  const blocks = (i = 0) =>
    JSON.parse(bedrock.commandCalls(InvokeModelCommand)[i].args[0].input.body as string).messages[0].content as any[];
  const body = (i = 0) => JSON.parse(bedrock.commandCalls(InvokeModelCommand)[i].args[0].input.body as string);

  beforeEach(() => {
    bedrock.on(InvokeModelCommand).resolves(reply() as any);
    s3.on(GetObjectCommand).rejects(missing());
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "federal/Grant A/raw-text.txt" }).resolves(
      text("Applicants must serve rural areas. Need is scored at 30 points.")
    );
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "federal/Grant A/summary.json" }).resolves(
      text(JSON.stringify({ ProjectNarrativeSections: [{ item: "Need" }] }))
    );
  });

  it("puts the instructions and the grant's full text first, cached, and the section's brief last", async () => {
    await write();
    const content = blocks();
    expect(content).toHaveLength(3);
    expect(content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(content[0].text).toContain('<grant_document source="full text">\nApplicants must serve rural areas.');
    expect(content[0].text).not.toContain("Describe the need.");
    expect(content[1].cache_control).toEqual({ type: "ephemeral" });
    expect(content[1].text).toContain("<project_basics>");
    expect(content[1].text).toContain("1. Need\n2. Budget");
    expect(content[2].cache_control).toBeUndefined();
    expect(content[2].text).toContain("<title>Need</title>");
    expect(content[2].text).toContain("<description>Describe the need.</description>");
    expect(kb.commandCalls(RetrieveCommand)).toHaveLength(0);
  });

  it("sends byte-identical cached blocks and schema for every section of a draft", async () => {
    await write();
    await write({ sectionItem: { id: "budget", item: "Budget", description: "Justify each cost.", index: 1 } });
    expect(blocks(1).slice(0, 2)).toEqual(blocks(0).slice(0, 2));
    expect(body(1).output_config).toEqual(body(0).output_config);
    expect(blocks(1)[2].text).toContain("<title>Budget</title>");
  });

  it("falls back to the grant's summary when its raw text is missing", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "federal/Grant A/raw-text.txt" }).rejects(missing());
    await write();
    expect(blocks()[0].text).toContain('<grant_document source="summary">');
    expect(blocks()[0].text).toContain('"item": "Need"');
  });

  it("reads a grant processed before the artifacts move from the grant bucket", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "federal/Grant A/raw-text.txt" }).rejects(missing());
    s3.on(GetObjectCommand, { Bucket: "nofos", Key: "federal/Grant A/raw-text.txt" }).resolves(text("Old grant text."));
    await write();
    expect(blocks()[0].text).toContain("Old grant text.");
  });

  it("gives the writer the additional information and each question with its answer", async () => {
    await write({
      questionnaireAnswers: answers,
      additionalInfo: "We partner with the county council on aging.",
    });
    const draft = blocks()[1].text;
    expect(draft).toContain("<additional_information>");
    expect(draft).toContain("We partner with the county council on aging.");
    expect(draft).toContain("<question>Who will the project serve?</question>\n<answer>Rural seniors in Franklin County</answer>");
    expect(draft).toContain("<answer>An answer whose question was removed</answer>");
    expect(draft).not.toContain("<applicant_documents>");
  });

  it("falls back to the saved answers and leaves out empty blocks for a job started by an older client", async () => {
    await write();
    const draft = blocks()[1].text;
    expect(draft).toContain('"question_1": "Rural seniors in Franklin County"');
    expect(draft).not.toContain("<additional_information>");
    expect(draft).not.toContain("<applicant_documents>");
  });
});

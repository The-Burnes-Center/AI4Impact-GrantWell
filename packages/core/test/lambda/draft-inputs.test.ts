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
});

describe("preparing a draft", () => {
  const summary = { ProjectNarrativeSections: [{ item: "Need", description: "Describe the need." }] };
  const grantChunk = {
    content: { text: "Applicants must serve rural areas.", type: "TEXT" },
    location: { s3Location: { uri: "s3://nofos/Grant A/NOFO-File-TXT" } },
    metadata: { documentType: "NOFO" },
  };
  const userChunk = (uri: string, text: string) => ({
    content: { text, type: "TEXT" },
    location: { s3Location: { uri } },
    metadata: { documentType: "userDocument", fileName: uri.split("/").pop() },
  });

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

  const filters = () =>
    kb.commandCalls(RetrieveCommand).map((c) => c.args[0].input.retrievalConfiguration?.vectorSearchConfiguration?.filter);

  it("searches only the requesting user's supporting documents for this grant", async () => {
    kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
    await run();
    expect(filters()).toContainEqual({
      andAll: [
        { equals: { key: "documentType", value: "userDocument" } },
        { equals: { key: "userId", value: "user-1" } },
        { equals: { key: "nofoName", value: "Grant A" } },
      ],
    });
    expect(filters()).toContainEqual({
      andAll: [
        { equals: { key: "documentType", value: "NOFO" } },
        { equals: { key: "documentIdentifier", value: "federal/Grant A" } },
      ],
    });
  });

  it("returns the user's passages apart from the grant's, dropping any outside their folder for this grant", async () => {
    kb.on(RetrieveCommand)
      .callsFake((input) =>
        input.retrievalConfiguration.vectorSearchConfiguration.filter.andAll[0].equals.value === "userDocument"
          ? {
              retrievalResults: [
                userChunk("s3://userdocs/user-1/Grant A/budget.pdf", "Our budget is $40,000."),
                userChunk("s3://userdocs/user-2/Grant A/other.pdf", "Another user's text."),
                userChunk("s3://userdocs/user-1/Grant B/old.pdf", "Another grant's text."),
              ],
            }
          : { retrievalResults: [grantChunk] }
      );
    const out = await run();
    expect(out.applicantDocuments).toEqual([{ fileName: "budget.pdf", content: "Our budget is $40,000." }]);
    expect(out.grantInfos).toHaveLength(1);
    expect(JSON.stringify(out.grantInfos)).not.toContain("budget");
    expect(out).toMatchObject({ additionalInfo: "We partner with the council on aging.", questionnaireAnswers: answers });
  });

  it("skips the user-document search without an authenticated user", async () => {
    kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
    const out = await run({ userId: undefined, additionalInfo: undefined, questionnaireAnswers: undefined });
    expect(kb.commandCalls(RetrieveCommand)).toHaveLength(1);
    expect(out).toMatchObject({ applicantDocuments: [], additionalInfo: "", questionnaireAnswers: [] });
  });
});

describe("writing a section", () => {
  const reply = () => ({
    body: new TextEncoder().encode(
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ content: "Section text." }) }] })
    ),
  });

  const write = (fields: object = {}) =>
    generateSection({
      sectionItem: { item: "Need", description: "Describe the need.", index: 0 },
      jobId: "job-1",
      query: "Generate all sections",
      documentIdentifier: "Grant A",
      projectBasics: { projectName: "Meals on Wheels" },
      questionnaire: { question_1: "Rural seniors in Franklin County" },
      grantInfos: [{ grantId: "unknown", combinedContent: "Applicants must serve rural areas." }],
      totalSections: 1,
      sectionNames: ["Need"],
      ...fields,
    });

  const prompt = () =>
    JSON.parse(bedrock.commandCalls(InvokeModelCommand)[0].args[0].input.body as string).messages[0].content as string;

  beforeEach(() => {
    bedrock.on(InvokeModelCommand).resolves(reply() as any);
  });

  it("gives the writer the additional information, each question with its answer, and the applicant's documents", async () => {
    await write({
      questionnaireAnswers: answers,
      additionalInfo: "We partner with the county council on aging.",
      applicantDocuments: [{ fileName: "budget.pdf", content: "Our budget is $40,000." }],
    });
    const text = prompt();
    expect(text).toContain("<additional_information>");
    expect(text).toContain("We partner with the county council on aging.");
    expect(text).toContain("<question>Who will the project serve?</question>\n<answer>Rural seniors in Franklin County</answer>");
    expect(text).toContain("<answer>An answer whose question was removed</answer>");

    const docs = text.slice(text.indexOf("<applicant_documents>"), text.indexOf("</applicant_documents>"));
    expect(docs).toContain("applicant's own supporting documents");
    expect(docs).toContain('<document name="budget.pdf">\nOur budget is $40,000.\n</document>');
    expect(docs).not.toContain("Applicants must serve rural areas.");
    const grant = text.slice(text.indexOf("<grant_knowledge_base>"), text.indexOf("</grant_knowledge_base>"));
    expect(grant).not.toContain("Our budget");
  });

  it("falls back to the saved answers and leaves out empty blocks for a job started by an older client", async () => {
    await write();
    const text = prompt();
    expect(text).toContain('"question_1": "Rural seniors in Franklin County"');
    expect(text).not.toContain("<additional_information>");
    expect(text).not.toContain("<applicant_documents>");
  });
});

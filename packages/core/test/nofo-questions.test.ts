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
  return {
    command,
    client,
    bedrock: vi.fn(),
    dynamo: vi.fn(),
    lambda: vi.fn(),
    s3: vi.fn(),
    uploads: [] as { Key: string; Body: string }[],
  };
});

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: aws.client((cmd: any) => aws.bedrock(JSON.parse(cmd.input.body))),
  InvokeModelCommand: aws.command("InvokeModelCommand"),
}));
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: aws.client(async (cmd: any) => aws.dynamo(cmd.constructor.name, cmd.input)),
  GetItemCommand: aws.command("GetItemCommand"),
  UpdateItemCommand: aws.command("UpdateItemCommand"),
  QueryCommand: aws.command("QueryCommand"),
  ScanCommand: aws.command("ScanCommand"),
  DeleteItemCommand: aws.command("DeleteItemCommand"),
}));
vi.mock("@aws-sdk/util-dynamodb", () => ({ marshall: (x: unknown) => x, unmarshall: (x: unknown) => x }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: aws.client(async (cmd: any) => aws.s3(cmd.constructor.name, cmd.input)),
  GetObjectCommand: aws.command("GetObjectCommand"),
  PutObjectCommand: aws.command("PutObjectCommand"),
  ListObjectsV2Command: aws.command("ListObjectsV2Command"),
  DeleteObjectsCommand: aws.command("DeleteObjectsCommand"),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: async () => "https://signed" }));
vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    constructor(private opts: any) {}
    async done() {
      aws.uploads.push({ Key: this.opts.params.Key, Body: this.opts.params.Body });
    }
  },
}));
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: aws.client(async (cmd: any) => aws.lambda(JSON.parse(cmd.input.Payload))),
  InvokeCommand: aws.command("InvokeCommand"),
}));
vi.mock("grantwell-shared", () => ({
  requireAdmin: () => null,
  assertCanEditNofoOr403: async () => null,
  resolveCallerScope: () => ({ role: "admin" }),
  readNofoScope: async () => null,
}));

process.env.HAIKU_MODEL_ID = "haiku";
process.env.BUCKET = "nofo-bucket";
process.env.REVIEW_TABLE_NAME = "reviews";
process.env.PUBLISH_FUNCTION_NAME = "publish";

const fns = "../lib/chatbot-api/functions/nofo-pipeline";
const { handler: synthesize } = await import(`${fns}/synthesize/index.mjs`);
const { handler: validate } = await import(`${fns}/validate/index.mjs`);
const { handler: publish } = await import(`${fns}/publish/index.mjs`);
const { handler: admin } = await import(`${fns}/admin/index.mjs`);

const entry = (item: string) => [{ item, description: `${item} details` }];
const fullSummary = () => ({
  EligibilityCriteria: entry("Nonprofits"),
  RequiredDocuments: entry("Budget"),
  ProjectNarrativeSections: entry("Need"),
  KeyDeadlines: entry("Application due"),
});
const QUESTIONS = { totalQuestions: 1, questions: [{ id: 1, question: "Describe your need." }] };

const toolResponse = (input: object) => ({
  body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "tool_use", input }] })),
});
const questionCalls = () => aws.bedrock.mock.calls.filter(([body]) => body.tools);

beforeEach(() => {
  aws.bedrock.mockReset();
  aws.dynamo.mockReset().mockResolvedValue({});
  aws.lambda.mockReset().mockResolvedValue({ Payload: new TextEncoder().encode("{}") });
  aws.s3.mockReset().mockImplementation(async (name: string) =>
    name === "GetObjectCommand" ? { Body: [Buffer.from("raw nofo text")] } : {}
  );
  aws.uploads.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("validate", () => {
  it("quarantines a full summary with no questions as no_questions", async () => {
    for (const questionsData of [null, undefined, { totalQuestions: 0, questions: [] }]) {
      const out = await validate({ nofoName: "G", mergedSummary: fullSummary(), questionsData });
      expect(out.validationResult.overallVerdict).toBe("NEEDS_REVIEW");
      expect(out.adminGuidance).toMatchObject({
        reason: "no_questions",
        title: "No application questions generated",
        canApprove: true,
        missingCategories: [],
      });
      expect(out.adminGuidance.actions.length).toBeGreaterThan(0);
    }
  });

  it("takes precedence over the partial_extraction auto-publish", async () => {
    const mergedSummary = { ...fullSummary(), KeyDeadlines: [] };
    const out = await validate({ nofoName: "G", mergedSummary, questionsData: null });
    expect(out.validationResult.overallVerdict).toBe("NEEDS_REVIEW");
    expect(out.adminGuidance).toMatchObject({ reason: "no_questions", missingCategories: ["KeyDeadlines"] });
  });

  it("still auto-publishes partial_extraction and full summaries that have questions", async () => {
    const partial = await validate({
      nofoName: "G",
      mergedSummary: { ...fullSummary(), KeyDeadlines: [] },
      questionsData: QUESTIONS,
    });
    expect(partial.validationResult.overallVerdict).toBe("PASS");
    expect(partial.adminGuidance.reason).toBe("partial_extraction");

    const full = await validate({ nofoName: "G", mergedSummary: fullSummary(), questionsData: QUESTIONS });
    expect(full.validationResult.overallVerdict).toBe("PASS");
    expect(full.adminGuidance).toBeNull();
  });

  it("keeps the re-upload reasons for broken documents", async () => {
    const out = await validate({
      nofoName: "G",
      mergedSummary: { ...fullSummary(), KeyDeadlines: [], RequiredDocuments: [], EligibilityCriteria: [] },
      questionsData: null,
    });
    expect(out.adminGuidance).toMatchObject({ reason: "mostly_empty", canApprove: false });
  });
});

describe("synthesize", () => {
  const event = () => ({ nofoName: "G", s3Bucket: "b", rawTextKey: "G/raw-text.txt", mergedSummary: fullSummary() });

  beforeEach(() => {
    aws.bedrock.mockImplementation(async (body: any) =>
      body.tools ? toolResponse(QUESTIONS) : { body: new TextEncoder().encode(JSON.stringify({ content: [{ text: "null" }] })) }
    );
  });

  it("retries question generation once after a failure", async () => {
    const real = aws.bedrock.getMockImplementation()!;
    let failed = false;
    aws.bedrock.mockImplementation(async (body: any) => {
      if (body.tools && !failed) {
        failed = true;
        throw new Error("ValidationException");
      }
      return real(body);
    });

    const out = await synthesize(event());
    expect(questionCalls()).toHaveLength(2);
    expect(out.questionsData.questions).toHaveLength(1);
  });

  it("gives up after the second empty result and returns no questions", async () => {
    const real = aws.bedrock.getMockImplementation()!;
    aws.bedrock.mockImplementation(async (body: any) =>
      body.tools ? toolResponse({ totalQuestions: 0, questions: [] }) : real(body)
    );

    const out = await synthesize(event());
    expect(questionCalls()).toHaveLength(2);
    expect(out.questionsData).toBeNull();
  });
});

describe("publish", () => {
  const event = (questionsData: unknown) => ({ nofoName: "G", s3Bucket: "b", mergedSummary: fullSummary(), questionsData });

  it("refuses to publish without questions and writes nothing", async () => {
    for (const q of [null, { totalQuestions: 0, questions: [] }]) {
      await expect(publish(event(q))).rejects.toThrow(/no application questions/);
    }
    expect(aws.uploads).toEqual([]);
    expect(aws.dynamo).not.toHaveBeenCalled();
  });

  it("writes questions.json when questions are present", async () => {
    await publish(event(QUESTIONS));
    expect(aws.uploads.map((u) => u.Key)).toContain("G/questions.json");
  });
});

describe("admin approve", () => {
  const review = (extractedQuestions: unknown) => ({
    nofo_name: "My Grant",
    review_id: "r1",
    extractedSummary: JSON.stringify({ ...fullSummary(), ProjectNarrativeSections: [] }),
    extractedQuestions: extractedQuestions ? JSON.stringify(extractedQuestions) : null,
    s3DocumentKey: "My Grant/NOFO-File-PDF",
    s3RawTextKey: "My Grant/raw-text.txt",
  });
  const corrections = { ProjectNarrativeSections: entry("Approach") };
  const approve = () =>
    admin({
      requestContext: { http: { method: "POST", path: "/admin/processing-reviews/My%20Grant/approve" } },
      body: JSON.stringify({ reviewId: "r1", corrections }),
    });
  const withReview = (r: object) =>
    aws.dynamo.mockImplementation(async (name: string) => (name === "GetItemCommand" ? { Item: r } : {}));
  const reviewUpdates = () => aws.dynamo.mock.calls.filter(([name]) => name === "UpdateItemCommand");

  it("regenerates questions from the corrected summary and publishes them", async () => {
    withReview(review(null));
    aws.bedrock.mockResolvedValue(toolResponse(QUESTIONS));

    const res = await approve();

    expect(res.statusCode).toBe(200);
    expect(questionCalls()).toHaveLength(1);
    const prompt = questionCalls()[0][0].messages[0].content;
    expect(prompt).toContain("Approach");
    expect(prompt).toContain("raw nofo text");
    expect(aws.lambda).toHaveBeenCalledTimes(1);
    expect(aws.lambda.mock.calls[0][0].questionsData).toEqual(QUESTIONS);
    expect(reviewUpdates()).toHaveLength(1);
  });

  it("returns an error and leaves the review pending when regeneration comes back empty", async () => {
    withReview(review(null));
    aws.bedrock.mockResolvedValue(toolResponse({ totalQuestions: 0, questions: [] }));

    const res = await approve();

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe(
      "Could not generate application questions for this grant. Try Reprocess."
    );
    expect(aws.lambda).not.toHaveBeenCalled();
    expect(reviewUpdates()).toEqual([]);
  });

  it("publishes the review's own questions without calling Bedrock", async () => {
    withReview(review(QUESTIONS));

    const res = await approve();

    expect(res.statusCode).toBe(200);
    expect(aws.bedrock).not.toHaveBeenCalled();
    expect(aws.lambda.mock.calls[0][0].questionsData).toEqual(QUESTIONS);
  });
});

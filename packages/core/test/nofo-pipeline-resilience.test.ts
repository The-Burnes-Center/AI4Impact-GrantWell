import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => {
  class Command {
    constructor(public input: any) {}
  }
  const command = (name: string) => ({ [name]: class extends Command {} })[name];
  const client = (send: (cmd: any) => unknown) =>
    class {
      send = send;
    };
  return { command, client, bedrock: vi.fn(), dynamo: vi.fn(), s3: vi.fn(), textract: vi.fn() };
});

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: aws.client(async (cmd: any) => aws.bedrock(JSON.parse(cmd.input.body))),
  InvokeModelCommand: aws.command("InvokeModelCommand"),
}));
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: aws.client(async (cmd: any) => aws.dynamo(cmd.constructor.name, cmd.input)),
  GetItemCommand: aws.command("GetItemCommand"),
  UpdateItemCommand: aws.command("UpdateItemCommand"),
}));
vi.mock("@aws-sdk/util-dynamodb", () => ({ marshall: (x: unknown) => x, unmarshall: (x: unknown) => x }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: aws.client(async (cmd: any) => aws.s3(cmd.constructor.name, cmd.input)),
  GetObjectCommand: aws.command("GetObjectCommand"),
  PutObjectCommand: aws.command("PutObjectCommand"),
}));
vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    async done() {}
  },
}));
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: aws.client(async () => ({})),
  InvokeCommand: aws.command("InvokeCommand"),
}));
vi.mock("@aws-sdk/client-textract", () => ({
  TextractClient: aws.client(async (cmd: any) => aws.textract(cmd.constructor.name, cmd.input)),
  StartDocumentTextDetectionCommand: aws.command("StartDocumentTextDetectionCommand"),
  GetDocumentTextDetectionCommand: aws.command("GetDocumentTextDetectionCommand"),
}));
vi.mock("grantwell-shared", async () => ({
  ...(await import("../lib/chatbot-api/functions/layers/js-shared-layer/nodejs/node_modules/grantwell-shared/sections.mjs")),
  ...(await import("../lib/chatbot-api/functions/layers/js-shared-layer/nodejs/node_modules/grantwell-shared/artifacts.mjs")),
}));

process.env.SONNET_MODEL_ID = "sonnet";
process.env.ARTIFACTS_BUCKET = "grant-artifacts";
process.env.NOFO_METADATA_TABLE_NAME = "nofos";

const fns = "../lib/chatbot-api/functions/nofo-pipeline";
const { handler: extractText, MAX_TEXTRACT_WAIT_MS } = await import(`${fns}/extract-text/index.mjs`);
const { handler: extract } = await import(`${fns}/extract-and-analyze/index.mjs`);
const { handler: validate } = await import(`${fns}/validate/index.mjs`);
const { handler: publish } = await import(`${fns}/publish/index.mjs`);

const entry = (item: string) => [{ item, description: `${item} details` }];
const summaryFor = (name: string) => ({
  EligibilityCriteria: entry(`${name} eligibility`),
  RequiredDocuments: entry(`${name} budget`),
  ProjectNarrativeSections: entry(`${name} need`),
  KeyDeadlines: entry(`${name} due date`),
});
const jsonReply = (data: object) => ({
  body: new TextEncoder().encode(
    JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(data) }] })
  ),
});
const refusal = () => ({
  body: new TextEncoder().encode(JSON.stringify({ stop_reason: "refusal", stop_details: { category: "x" }, content: [] })),
});
const awsError = (name: string, status: number) =>
  Object.assign(new Error(`${name} from Bedrock`), { name, $metadata: { httpStatusCode: status } });

// 200K chars split at 80K/75K steps: chunk 1 = 0–80K, chunk 2 = 75K–155K, chunk 3 = 150K–200K.
const MARKERS = ["PARTONE", "PARTTWO", "PARTTHREE"];
const LONG_TEXT = (() => {
  const text = "x".repeat(200_000).split("");
  for (const [marker, at] of [["PARTONE", 100], ["PARTTWO", 100_000], ["PARTTHREE", 170_000]] as const) {
    text.splice(at, marker.length, ...marker);
  }
  return text.join("");
})();
const chunkOf = (body: any) => MARKERS.findIndex((m) => body.messages[0].content.includes(m)) + 1;
const callsFor = (chunk: number) => aws.bedrock.mock.calls.filter(([body]) => chunkOf(body) === chunk).length;

function serveText(text: string) {
  aws.s3.mockImplementation(async (name: string) => (name === "GetObjectCommand" ? { Body: [Buffer.from(text)] } : {}));
}

/** Each chunk answers with its own summary unless `fail(chunk, attempt)` returns a failure. */
function bedrockByChunk(fail: (chunk: number, attempt: number) => Error | "refusal" | null) {
  const attempts = new Map<number, number>();
  aws.bedrock.mockImplementation(async (body: any) => {
    const chunk = chunkOf(body);
    const attempt = (attempts.get(chunk) ?? 0) + 1;
    attempts.set(chunk, attempt);
    const failure = fail(chunk, attempt);
    if (failure === "refusal") return refusal();
    if (failure) throw failure;
    return jsonReply(summaryFor(MARKERS[chunk - 1]));
  });
}

async function settle<T>(promise: Promise<T>) {
  const result = promise.then(
    (value) => ({ value, error: null as any }),
    (error) => ({ value: null as any, error })
  );
  await vi.runAllTimersAsync();
  return result;
}

const event = { s3Bucket: "b", rawTextKey: "G/raw-text.txt", nofoName: "G" };
const items = (summary: any) => summary.EligibilityCriteria.map((e: any) => e.item);

beforeEach(() => {
  vi.useFakeTimers();
  aws.bedrock.mockReset();
  aws.dynamo.mockReset().mockResolvedValue({});
  aws.s3.mockReset().mockResolvedValue({});
  aws.textract.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("extract-text Textract poll", () => {
  const pdfEvent = { s3Bucket: "b", documentKey: "G/NOFO-File-PDF", nofoName: "G" };
  const polls = () => aws.textract.mock.calls.filter(([name]) => name === "GetDocumentTextDetectionCommand").length;

  it("gives up with a named error before the 15-minute Lambda limit", async () => {
    aws.textract.mockImplementation(async (name: string) =>
      name === "StartDocumentTextDetectionCommand" ? { JobId: "job-1" } : { JobStatus: "IN_PROGRESS" }
    );
    const started = Date.now();

    const { error } = await settle(extractText(pdfEvent));

    expect(error.name).toBe("TextractTimeoutError");
    expect(error.message).toMatch(/within 13 minutes \(Textract job job-1\)/);
    expect(MAX_TEXTRACT_WAIT_MS).toBe(13 * 60 * 1000);
    expect(Date.now() - started).toBeLessThanOrEqual(MAX_TEXTRACT_WAIT_MS);
    expect(polls()).toBe(MAX_TEXTRACT_WAIT_MS / 5000);
  });

  it("still returns text from a job that finishes inside the cap", async () => {
    let poll = 0;
    aws.textract.mockImplementation(async (name: string, input: any) => {
      if (name === "StartDocumentTextDetectionCommand") return { JobId: "job-2" };
      if (input.NextToken === undefined) return { JobStatus: ++poll < 140 ? "IN_PROGRESS" : "SUCCEEDED" };
      return { Blocks: [{ BlockType: "LINE", Text: "grant funding eligibility applicant ".repeat(30) }] };
    });

    const { value, error } = await settle(extractText(pdfEvent));

    expect(error).toBeNull();
    expect(value.documentLength).toBeGreaterThan(500);
  });
});

describe("extract-and-analyze chunk failures", () => {
  it("retries a chunk that hits a 5xx and merges every chunk", async () => {
    serveText(LONG_TEXT);
    bedrockByChunk((chunk, attempt) => (chunk === 2 && attempt === 1 ? awsError("InternalServerException", 500) : null));

    const { value, error } = await settle(extract(event));

    expect(error).toBeNull();
    expect(callsFor(2)).toBe(2);
    expect(value.failedChunks).toBeUndefined();
    expect(items(value.mergedSummary)).toEqual(["PARTONE eligibility", "PARTTWO eligibility", "PARTTHREE eligibility"]);
  });

  it("stops retrying after three attempts and keeps the other chunks", async () => {
    serveText(LONG_TEXT);
    bedrockByChunk((chunk) => (chunk === 3 ? awsError("InternalServerException", 500) : null));

    const { value, error } = await settle(extract(event));

    expect(error).toBeNull();
    expect(callsFor(3)).toBe(3);
    expect(items(value.mergedSummary)).toEqual(["PARTONE eligibility", "PARTTWO eligibility"]);
    expect(value.failedChunks).toEqual([
      { part: 3, of: 3, startPercent: 75, endPercent: 100, error: "InternalServerException: InternalServerException from Bedrock" },
    ]);
  });

  it("does not retry an error that would fail again", async () => {
    serveText(LONG_TEXT);
    bedrockByChunk((chunk) => (chunk === 2 ? "refusal" : null));

    const { value } = await settle(extract(event));

    expect(callsFor(2)).toBe(1);
    expect(value.failedChunks.map((c: any) => c.part)).toEqual([2]);
    expect(value.failedChunks[0]).toMatchObject({ startPercent: 37, endPercent: 78 });
  });

  it("does not start a retry the Lambda has no time left to finish", async () => {
    serveText(LONG_TEXT);
    bedrockByChunk((chunk) => (chunk === 1 ? awsError("InternalServerException", 500) : null));

    const { value } = await settle(extract(event, { getRemainingTimeInMillis: () => 4 * 60 * 1000 }));

    expect(callsFor(1)).toBe(1);
    expect(value.failedChunks.map((c: any) => c.part)).toEqual([1]);
  });

  it("fails the grant with the original error when every chunk fails", async () => {
    serveText(LONG_TEXT);
    bedrockByChunk(() => awsError("ThrottlingException", 429));

    const { error } = await settle(extract(event));

    expect(error.name).toBe("ThrottlingException");
  });

  it("fails a short document whose single chunk fails, as before", async () => {
    serveText("A short grant document.");
    aws.bedrock.mockImplementation(async () => refusal());

    const { error } = await settle(extract(event));

    expect(error.name).toBe("BedrockRefusalError");
    expect(aws.bedrock).toHaveBeenCalledTimes(1);
  });
});

describe("partial grants in review", () => {
  const QUESTIONS = { totalQuestions: 1, questions: [{ id: 1, question: "Describe your need." }] };
  const failedChunks = [{ part: 2, of: 3, startPercent: 37, endPercent: 78, error: "BedrockRefusalError: x" }];

  it("holds a grant with an unread part for review and names the part", async () => {
    const out = await validate({ nofoName: "G", mergedSummary: summaryFor("A"), questionsData: QUESTIONS, failedChunks });

    expect(out.validationResult.overallVerdict).toBe("NEEDS_REVIEW");
    expect(out.adminGuidance).toMatchObject({ reason: "partial_document", severity: "warning", canApprove: true, missingCategories: [] });
    expect(out.adminGuidance.missingParts).toBe(
      "The grant text could not be read in part 2 of 3 (about 37%–78% of the way through), so requirements from there may be missing."
    );
  });

  it("holds a grant with missing sections and an unread part for review", async () => {
    const mergedSummary = { ...summaryFor("A"), KeyDeadlines: [] };
    const out = await validate({ nofoName: "G", mergedSummary, questionsData: QUESTIONS, failedChunks });

    expect(out.validationResult.overallVerdict).toBe("NEEDS_REVIEW");
  });

  it("names the unread part in the guidance of a grant held for review", async () => {
    const mergedSummary = { ...summaryFor("A"), RequiredDocuments: [], ProjectNarrativeSections: [], KeyDeadlines: [] };
    const out = await validate({ nofoName: "G", mergedSummary, questionsData: QUESTIONS, failedChunks });

    expect(out.validationResult.overallVerdict).toBe("NEEDS_REVIEW");
    expect(out.adminGuidance.reason).toBe("mostly_empty");
    expect(out.adminGuidance.message).toMatch(/^The grant text could not be read in part 2 of 3/);
  });

  it("leaves grants with every part read unflagged", async () => {
    const out = await validate({ nofoName: "G", mergedSummary: summaryFor("A"), questionsData: QUESTIONS });
    expect(out.adminGuidance).toBeNull();
  });
});

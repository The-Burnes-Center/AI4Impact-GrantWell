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
  return { command, client, bedrock: vi.fn(), dynamo: vi.fn(), s3: vi.fn() };
});

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: aws.client(async (cmd: any) => aws.bedrock(JSON.parse(cmd.input.body), cmd.input)),
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

process.env.HAIKU_MODEL_ID = "haiku";
process.env.SONNET_MODEL_ID = "sonnet";

const fns = "../lib/chatbot-api/functions/nofo-pipeline";
const { invokeStructuredOutput, toStrictSchema } = await import(`${fns}/shared/bedrock.mjs`);
const { EXTRACTION_SCHEMA, QUESTIONS_SCHEMA } = await import(`${fns}/shared/schemas.mjs`);
const { generateQuestions } = await import(`${fns}/shared/questions.mjs`);
const { handler: extract } = await import(`${fns}/extract-and-analyze/index.mjs`);
const { handler: synthesize } = await import(`${fns}/synthesize/index.mjs`);

const UNSUPPORTED = [
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
];

const entry = (item: string) => [{ item, description: `${item} details` }];
const SUMMARY = {
  EligibilityCriteria: entry("Nonprofits"),
  RequiredDocuments: entry("Budget"),
  ProjectNarrativeSections: entry("Need"),
  KeyDeadlines: entry("Application due"),
};
const QUESTIONS = { totalQuestions: 1, questions: [{ id: 1, question: "Describe your need." }] };

const reply = (payload: object) => ({ body: new TextEncoder().encode(JSON.stringify(payload)) });
const jsonReply = (data: object) =>
  reply({
    stop_reason: "end_turn",
    content: [
      { type: "thinking", thinking: "planning", signature: "sig" },
      { type: "text", text: JSON.stringify(data) },
    ],
  });
const textReply = (text: string) =>
  reply({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text }] });

function walkSchemas(node: any, visit: (schema: any) => void) {
  if (Array.isArray(node)) return node.forEach((n) => walkSchemas(n, visit));
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const map of ["properties", "$defs", "definitions"]) {
    if (node[map]) Object.values(node[map]).forEach((s) => walkSchemas(s, visit));
  }
  for (const key of ["items", "not", "anyOf", "allOf", "oneOf", "prefixItems"]) {
    if (node[key]) walkSchemas(node[key], visit);
  }
}

function expectStrict(schema: any) {
  let objects = 0;
  walkSchemas(schema, (s) => {
    for (const k of UNSUPPORTED) expect(s).not.toHaveProperty(k);
    if (s.type === "object" || s.properties) {
      objects++;
      expect(s.additionalProperties).toBe(false);
    }
  });
  expect(objects).toBeGreaterThan(0);
}

function expectNoLegacyParams(body: any) {
  for (const k of ["temperature", "top_p", "top_k", "tool_choice", "tools"]) expect(body).not.toHaveProperty(k);
  expect(body.thinking?.type).not.toBe("disabled");
  expect(body.messages.at(-1).role).toBe("user");
}

beforeEach(() => {
  aws.bedrock.mockReset();
  aws.dynamo.mockReset().mockResolvedValue({});
  aws.s3.mockReset().mockImplementation(async (name: string) =>
    name === "GetObjectCommand" ? { Body: [Buffer.from("raw nofo text")] } : {}
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("toStrictSchema", () => {
  it("closes every object and strips unsupported keywords without mutating the input", () => {
    const input = {
      type: "object",
      additionalProperties: true,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 10, format: "email" },
        count: { type: "integer", minimum: 0, maximum: 5, exclusiveMinimum: 0, exclusiveMaximum: 6, multipleOf: 1 },
        tags: { type: "array", minItems: 1, maxItems: 3, uniqueItems: true, items: { type: "object", properties: { t: { type: "string" } } } },
        choice: { anyOf: [{ type: "object", properties: { a: { type: "string" } } }, { type: "null" }] },
        ref: { $ref: "#/$defs/thing" },
        properties: { type: "object", properties: { items: { type: "string", enum: ["x"] } } },
      },
      $defs: { thing: { type: "object", properties: { v: { type: "number", minimum: 1 } } } },
      required: ["name"],
    };
    const snapshot = structuredClone(input);

    const out = toStrictSchema(input);

    expectStrict(out);
    expect(input).toEqual(snapshot);
    expect(out.properties.name).toEqual({ type: "string", format: "email" });
    expect(out.properties.properties.properties.items).toEqual({ type: "string", enum: ["x"] });
    expect(out.properties.ref).toEqual({ $ref: "#/$defs/thing" });
    expect(out.required).toEqual(["name"]);
  });

  it.each([
    ["EXTRACTION_SCHEMA", EXTRACTION_SCHEMA],
    ["QUESTIONS_SCHEMA", QUESTIONS_SCHEMA],
  ])("produces a valid structured-output schema from %s", (_, schema) => {
    const out = toStrictSchema(schema);
    expectStrict(out);
    expect(out.required).toEqual(schema.required);
    expect(Object.keys(out.properties)).toEqual(Object.keys(schema.properties));
  });
});

describe("invokeStructuredOutput", () => {
  const call = (extra: object = {}) =>
    invokeStructuredOutput({
      modelId: "m",
      prompt: "p",
      schema: QUESTIONS_SCHEMA,
      toolName: "save_questions",
      toolDescription: "Save the questions.",
      maxTokens: 500,
      ...extra,
    });

  it("sends output_config.format and effort, folds the description into system, and parses the text block after thinking", async () => {
    aws.bedrock.mockResolvedValue(jsonReply(QUESTIONS));

    await expect(call({ effort: "low", temperature: 0.1, thinking: { type: "disabled" } })).resolves.toEqual(QUESTIONS);

    const [body, input] = aws.bedrock.mock.calls[0];
    expect(input.modelId).toBe("m");
    expectNoLegacyParams(body);
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expectStrict(body.output_config.format.schema);
    expect(body.system).toContain("Save the questions.");
    expect(body.max_tokens).toBe(500);
  });

  it("omits effort when not given and keeps a caller system prompt", async () => {
    aws.bedrock.mockResolvedValue(jsonReply(QUESTIONS));
    await call({ system: "You are careful." });
    const [body] = aws.bedrock.mock.calls[0];
    expect(body.output_config).not.toHaveProperty("effort");
    expect(body.system.startsWith("You are careful.")).toBe(true);
  });

  it("throws on a refusal, naming the category", async () => {
    aws.bedrock.mockResolvedValue(reply({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }));
    await expect(call()).rejects.toThrow(/refused save_questions.*cyber/);
  });

  it("throws on truncation", async () => {
    aws.bedrock.mockResolvedValue(
      reply({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"totalQuestions": 1, "quest' }] })
    );
    await expect(call()).rejects.toThrow(/truncated at max_tokens=500/);
  });

  it("throws clearly on missing or invalid JSON text", async () => {
    aws.bedrock.mockResolvedValue(reply({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "x" }] }));
    await expect(call()).rejects.toThrow(/did not return structured output/);

    aws.bedrock.mockResolvedValue(textReply("not json"));
    await expect(call()).rejects.toThrow(/invalid JSON for save_questions/);
  });
});

describe("callers", () => {
  it("extract-and-analyze uses Sonnet with medium effort and a raised token cap", async () => {
    aws.bedrock.mockResolvedValue(jsonReply(SUMMARY));

    const out = await extract({ s3Bucket: "b", rawTextKey: "k", nofoName: "G" });

    expect(out.mergedSummary.EligibilityCriteria[0].item).toBe("Nonprofits");
    const [body, input] = aws.bedrock.mock.calls[0];
    expect(input.modelId).toBe("sonnet");
    expectNoLegacyParams(body);
    expect(body).not.toHaveProperty("thinking");
    expect(body.output_config.effort).toBe("medium");
    expect(body.max_tokens).toBeGreaterThanOrEqual(16000);
    expectStrict(body.output_config.format.schema);
  });

  it("extract-and-analyze surfaces a refusal instead of returning an empty summary", async () => {
    aws.bedrock.mockResolvedValue(reply({ stop_reason: "refusal", stop_details: { category: "bio" }, content: [] }));
    await expect(extract({ s3Bucket: "b", rawTextKey: "k", nofoName: "G" })).rejects.toThrow(/bio/);
  });

  it("generateQuestions uses Haiku with low effort and returns null on refusal", async () => {
    aws.bedrock.mockResolvedValue(jsonReply(QUESTIONS));
    await expect(generateQuestions(SUMMARY, "sample")).resolves.toEqual(QUESTIONS);

    const [body, input] = aws.bedrock.mock.calls[0];
    expect(input.modelId).toBe("haiku");
    expectNoLegacyParams(body);
    expect(body.output_config.effort).toBe("low");
    expect(body.max_tokens).toBeGreaterThanOrEqual(4000);

    aws.bedrock.mockResolvedValue(reply({ stop_reason: "refusal", stop_details: null, content: [] }));
    await expect(generateQuestions(SUMMARY, "sample")).resolves.toBeNull();
  });

  describe("synthesize deadline extraction", () => {
    const event = () => ({ nofoName: "G", s3Bucket: "b", rawTextKey: "k", mergedSummary: structuredClone(SUMMARY) });
    const withDeadline = (deadlineReply: () => object) =>
      aws.bedrock.mockImplementation(async (body: any) =>
        body.output_config?.format ? jsonReply(QUESTIONS) : deadlineReply()
      );
    const deadlineCall = () => aws.bedrock.mock.calls.find(([body]) => !body.output_config?.format)!;

    it("reads the text block after thinking and sends low effort with no sampling params", async () => {
      withDeadline(() => textReply("2026-12-01"));

      const out = await synthesize(event());

      expect(out.applicationDeadline).toBe("2026-12-01");
      const [body, input] = deadlineCall();
      expect(input.modelId).toBe("haiku");
      expectNoLegacyParams(body);
      expect(body.output_config).toEqual({ effort: "low" });
      expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
    });

    it.each([
      ["2026-06-30T23:59:59-04:00", "2026-06-30"],
      ["2026-06-30T17:00:00-04:00", "2026-06-30"],
      ["June 30, 2026", "2026-06-30"],
    ])("stores %s as the deadline's own date", async (text, date) => {
      withDeadline(() => textReply(text));
      const out = await synthesize(event());
      expect(out.applicationDeadline).toBe(date);
    });

    it.each([
      ["refusal", { stop_reason: "refusal", stop_details: { category: "frontier_llm" }, content: [] }],
      ["max_tokens", { stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "..." }] }],
    ])("returns no deadline on %s", async (_, payload) => {
      withDeadline(() => reply(payload));
      const out = await synthesize(event());
      expect(out.applicationDeadline).toBeNull();
      expect(out.questionsData).toEqual(QUESTIONS);
    });
  });
});

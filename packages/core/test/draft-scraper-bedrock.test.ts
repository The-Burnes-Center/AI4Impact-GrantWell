import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const bedrock = vi.hoisted(() => ({ inputs: [] as any[], responses: [] as any[] }));
const s3 = vi.hoisted(() => ({ puts: [] as any[] }));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    async send(cmd: any) {
      bedrock.inputs.push(cmd.input);
      const next = bedrock.responses.shift();
      if (!next) throw new Error("no queued Bedrock response");
      return { body: new TextEncoder().encode(JSON.stringify(next)) };
    }
  },
  InvokeModelCommand: class {
    constructor(public input: any) {}
  },
}));
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    async send() {
      return {};
    }
  },
  UpdateItemCommand: class {},
  GetItemCommand: class {},
  PutItemCommand: class {},
}));
vi.mock("@aws-sdk/util-dynamodb", () => ({ marshall: (x: any) => x, unmarshall: (x: any) => x }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(cmd: any) {
      if (cmd.kind === "put") s3.puts.push(cmd.input);
      return {};
    }
  },
  PutObjectCommand: class {
    kind = "put";
    constructor(public input: any) {}
  },
  ListObjectsV2Command: class {
    kind = "list";
    constructor(public input: any) {}
  },
}));

const UNSUPPORTED = [
  "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "multipleOf", "minItems", "maxItems", "uniqueItems",
];

function assertStrictSchema(node: any, path = "$") {
  if (Array.isArray(node)) return node.forEach((n, i) => assertStrictSchema(n, `${path}[${i}]`));
  if (!node || typeof node !== "object") return;
  for (const k of UNSUPPORTED) expect(node, `${path}.${k}`).not.toHaveProperty(k);
  if (node.type === "object" || node.properties) expect(node.additionalProperties, path).toBe(false);
  for (const [k, v] of Object.entries(node)) assertStrictSchema(v, `${path}.${k}`);
}

function assertMigratedBody(body: any) {
  for (const k of ["temperature", "top_p", "top_k", "tool_choice", "tools"]) expect(body).not.toHaveProperty(k);
  expect(body.thinking?.type).not.toBe("disabled");
  expect(body.thinking?.budget_tokens).toBeUndefined();
  expect(body.output_config.format.type).toBe("json_schema");
  assertStrictSchema(body.output_config.format.schema);
}

const lastBody = () => JSON.parse(bedrock.inputs[bedrock.inputs.length - 1].body);

const reply = (json: unknown, extra: Record<string, unknown> = {}) => ({
  stop_reason: "end_turn",
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "text", text: JSON.stringify(json) },
  ],
  usage: { output_tokens: 42 },
  ...extra,
});
const refusal = { stop_reason: "refusal", stop_details: { category: "general_harms" }, content: [] };
const truncated = { stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "" }], usage: { output_tokens: 2500 } };

const attachments = [
  { download_path: "https://files.example/forms.pdf", file_description: "SF-424 forms" },
  { download_path: "https://files.example/nofo.pdf", file_description: "Notice of Funding Opportunity" },
];
const opportunity = {
  opportunity_id: 101,
  opportunity_title: "Rural Roads Program",
  agency_name: "DOT",
  posted_date: "2026-09-01",
  attachments,
  summary: { funding_categories: ["transportation"], close_date: "2026-12-01" },
};

let fetched: string[] = [];
function stubFetch() {
  fetched = [];
  vi.stubGlobal("fetch", async (url: string, init?: any) => {
    fetched.push(url);
    if (url.endsWith("/opportunities/search")) {
      const page = JSON.parse(init.body).pagination.page_offset;
      return new Response(JSON.stringify({ data: page === 1 ? [opportunity] : [] }), { status: 200 });
    }
    if (url.includes("/opportunities/")) return new Response(JSON.stringify({ data: opportunity }), { status: 200 });
    if (url.startsWith("https://files.example/")) {
      return init?.headers?.["User-Agent"]
        ? new Response("gone", { status: 404 })
        : new Response("%PDF-1.7 fake", { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

let generateSection: (event: any) => Promise<any>;
let processOpportunities: (event: any) => Promise<{ batchItemFailures: any[] }>;

beforeAll(async () => {
  process.env.SONNET_MODEL_ID = "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/sonnet";
  process.env.HAIKU_MODEL_ID = "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/haiku";
  process.env.GRANTS_GOV_API_KEY = "key";
  process.env.BUCKET = "bucket";
  delete process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
  delete process.env.ENABLE_DYNAMODB_CACHE;
  ({ handler: generateSection } = await import("../lib/chatbot-api/functions/draft-pipeline/generate-section/index.mjs"));
  ({ handler: processOpportunities } = await import("../lib/chatbot-api/functions/nofo-scraper/opportunity-processor/index.mjs"));
});

beforeEach(() => {
  bedrock.inputs = [];
  bedrock.responses = [];
  s3.puts = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  stubFetch();
});

const sectionEvent = (description = "Describe the project need. Not to exceed 2 pages.") => ({
  sectionItem: { item: "Project Narrative", description, index: 0 },
  jobId: "job-1",
  query: "Draft it",
  projectBasics: { name: "Rural Roads" },
  questionnaire: {},
  grantInfos: [],
  totalSections: 1,
  sectionNames: ["Project Narrative"],
});

describe("draft generate-section on Sonnet 5.5", () => {
  it("sends a structured-outputs request at medium effort with no forced tool or sampling params", async () => {
    bedrock.responses.push(reply({ content: "Our project will pave 12 miles." }));
    await expect(generateSection(sectionEvent())).resolves.toEqual({ sectionName: "Project Narrative", status: "completed" });
    const input = bedrock.inputs[0];
    expect(input.modelId).toBe(process.env.SONNET_MODEL_ID);
    const body = lastBody();
    assertMigratedBody(body);
    expect(body.output_config.effort).toBe("medium");
    expect(body.output_config.format.schema.required).toEqual(["content"]);
    expect(body.messages[0].content).toContain('Write the content for the "Project Narrative" grant section');
    expect(body.messages[0].content).not.toContain("write_section");
  });

  it("sizes max_tokens for thinking on top of the word budget", async () => {
    bedrock.responses.push(reply({ content: "x" }), reply({ content: "y" }));
    await generateSection(sectionEvent("Short answer. Maximum of 100 words."));
    expect(lastBody().max_tokens).toBe(2000 + 4000);
    await generateSection(sectionEvent("Not to exceed 20 pages."));
    expect(lastBody().max_tokens).toBe(10400 + 4000);
  });

  it("parses the JSON text block even when a thinking block comes first", async () => {
    bedrock.responses.push(reply({ content: "Body text" }));
    await generateSection(sectionEvent());
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('generated 9 chars for "Project Narrative"'));
  });

  it("throws on a refusal, naming the category", async () => {
    bedrock.responses.push(refusal);
    await expect(generateSection(sectionEvent())).rejects.toThrow(/declined.*general_harms/);
  });

  it("throws on truncation instead of saving partial output", async () => {
    bedrock.responses.push({ ...truncated, usage: { output_tokens: 6000 } });
    await expect(generateSection(sectionEvent())).rejects.toThrow(/token ceiling/);
  });

  it("throws when no text block comes back", async () => {
    bedrock.responses.push({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }] });
    await expect(generateSection(sectionEvent())).rejects.toThrow(/did not return structured output/);
  });
});

const sqsEvent = { Records: [{ messageId: "m1", body: JSON.stringify({ opportunityId: 101, opportunityTitle: "Rural Roads Program" }) }] };

describe("scraper opportunity-processor on Haiku 5.5", () => {
  it("sends structured outputs at low effort and follows the identified attachment", async () => {
    bedrock.responses.push(reply({ nofoIndex: 2, reason: "named NOFO" }));
    const res = await processOpportunities(sqsEvent);
    expect(res.batchItemFailures).toEqual([]);
    expect(bedrock.inputs[0].modelId).toBe(process.env.HAIKU_MODEL_ID);
    const body = lastBody();
    assertMigratedBody(body);
    expect(body.output_config.effort).toBe("low");
    expect(body.max_tokens).toBeGreaterThanOrEqual(2048);
    expect(fetched).toContain("https://files.example/nofo.pdf");
  });

  it("skips the opportunity on a refusal without failing the batch", async () => {
    bedrock.responses.push(refusal);
    const res = await processOpportunities(sqsEvent);
    expect(res.batchItemFailures).toEqual([]);
    expect(fetched.some((u) => u.startsWith("https://files.example/"))).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("general_harms"));
  });

  it("skips the opportunity on truncation without failing the batch", async () => {
    bedrock.responses.push(truncated);
    const res = await processOpportunities(sqsEvent);
    expect(res.batchItemFailures).toEqual([]);
    expect(fetched.some((u) => u.startsWith("https://files.example/"))).toBe(false);
  });
});

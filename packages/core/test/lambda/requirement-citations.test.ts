import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requirementKey, withRequirementCitations } from "grantwell-shared";

const s3 = mockClient(S3Client);
const bedrock = mockClient(BedrockRuntimeClient);
const lambda = mockClient(LambdaClient);
const ddb = mockClient(DynamoDBClient);

type Handler = (event: any, context?: any) => Promise<any>;
let cite: any;
let summaryHandler: Handler;
let updateHandler: Handler;

beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  vi.stubEnv("BUCKET", "nofo-bucket");
  vi.stubEnv("HAIKU_MODEL_ID", "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/haiku");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }]));
  cite = await import("../../lib/chatbot-api/functions/nofo-pipeline/cite-requirements/index.mjs");
  ({ handler: summaryHandler } = await import("../../lib/chatbot-api/functions/landing-page/retrieveNOFOSummary/index.mjs"));
  ({ handler: updateHandler } = await import("../../lib/chatbot-api/functions/landing-page/nofo-summary-update/index.mjs"));
});

const RAW = "Section C. Eligible applicants are cities and towns. Section D. Applications are due March 1, 2027.";
const SUMMARY = {
  GrantName: "Grant A",
  EligibilityCriteria: [{ item: "Cities", description: "Cities and towns may apply." }],
  RequiredDocuments: [],
  ProjectNarrativeSections: [],
  KeyDeadlines: [{ item: "Deadline", description: "March 1, 2027." }],
};
const body = (text: string) => ({ Body: Readable.from([Buffer.from(text)]) }) as any;
const missing = () => Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });

function files(objects: Record<string, string>) {
  s3.on(GetObjectCommand).callsFake((input) => {
    const text = objects[input.Key];
    if (text === undefined || input.Bucket !== "grant-artifacts") throw missing();
    return body(text);
  });
}

const modelReply = (content: object[], stop = "end_turn") => ({
  body: new TextEncoder().encode(JSON.stringify({ stop_reason: stop, content })) as any,
});
const at = (text: string) => ({ start_char_index: RAW.indexOf(text), end_char_index: RAW.indexOf(text) + text.length });
const charCite = (text: string) => ({ type: "char_location", cited_text: text, document_index: 0, ...at(text) });
const puts = () => s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);

beforeEach(() => {
  for (const m of [s3, bedrock, lambda, ddb]) m.reset();
  s3.on(PutObjectCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requirement keys", () => {
  it("changes when an item's text changes and attaches quotes only to matching items", () => {
    const entry = SUMMARY.EligibilityCriteria[0];
    const key = requirementKey("EligibilityCriteria", entry);
    expect(requirementKey("EligibilityCriteria", { ...entry, description: "Edited." })).not.toBe(key);
    expect(requirementKey("KeyDeadlines", entry)).not.toBe(key);

    const out = withRequirementCitations(SUMMARY, { items: { [key]: [{ quote: "Eligible applicants are cities and towns.", page: 2 }] } });
    expect(out.EligibilityCriteria[0].citations).toEqual([{ quote: "Eligible applicants are cities and towns.", page: 2 }]);
    expect(out.KeyDeadlines[0]).not.toHaveProperty("citations");
    expect(SUMMARY.EligibilityCriteria[0]).not.toHaveProperty("citations");
  });
});

describe("cite-requirements parsing", () => {
  it("numbers items by category and gives each cited block to the ID before it", () => {
    const items = cite.requirementItems(SUMMARY);
    expect(items.map((i: any) => i.id)).toEqual(["E1", "K1"]);
    expect(cite.citationPrompt(items)).toContain("[E1] Cities: Cities and towns may apply.\n[K1] Deadline: March 1, 2027.");

    const byId = cite.citationsById([
      { type: "text", text: "[E1] " },
      { type: "text", text: "Cities and towns", citations: [charCite("Eligible applicants are cities and towns.")] },
      { type: "text", text: "\n[K1] " },
      { type: "text", text: "Due March 1", citations: [charCite("Applications are due March 1, 2027.")] },
      { type: "text", text: "\n[X9] no source" },
    ]);
    expect([...byId.keys()]).toEqual(["E1", "K1"]);
    expect(byId.get("K1")[0].cited_text).toBe("Applications are due March 1, 2027.");
  });

  it("finds grants whose citations are missing or older than their summary or text", () => {
    const t = (n: number) => new Date(2026, 10, n);
    expect(
      cite.staleGrants([
        { Key: "A/summary.json", LastModified: t(1) },
        { Key: "A/raw-text.txt", LastModified: t(1) },
        { Key: "B/summary.json", LastModified: t(3) },
        { Key: "B/raw-text.txt", LastModified: t(1) },
        { Key: "B/requirements-citations.json", LastModified: t(2) },
        { Key: "C/summary.json", LastModified: t(1) },
        { Key: "C/raw-text.txt", LastModified: t(1) },
        { Key: "C/requirements-citations.json", LastModified: t(2) },
        { Key: "D/summary.json", LastModified: t(1) },
        { Key: "_search/current.json", LastModified: t(1) },
      ])
    ).toEqual(["A", "B"]);
  });
});

describe("cite-requirements handler", () => {
  it("saves quotes with pages per item key, and skips a grant whose file is current", async () => {
    files({
      "Grant A/summary.json": JSON.stringify(SUMMARY),
      "Grant A/raw-text.txt": RAW,
      "Grant A/raw-text-pages.json": JSON.stringify({ chars: RAW.length, pageStarts: [0, RAW.indexOf("Section D")] }),
    });
    bedrock.on(InvokeModelCommand).resolves(
      modelReply([
        { type: "text", text: "[E1] " },
        { type: "text", text: "Cities and towns", citations: [charCite("Eligible applicants are cities and towns.")] },
        { type: "text", text: "\n[K1] " },
        { type: "text", text: "Due March 1", citations: [charCite("Applications are due March 1, 2027.")] },
      ])
    );

    expect(await cite.handler({ nofoName: "Grant A" })).toEqual({ result: "written" });

    const request = JSON.parse(bedrock.commandCalls(InvokeModelCommand)[0].args[0].input.body as string);
    expect(request.messages[0].content[0]).toMatchObject({ type: "document", source: { data: RAW }, citations: { enabled: true } });
    expect(request).not.toHaveProperty("output_config.format");
    expect(request.thinking).toEqual({ type: "disabled" });
    const [put] = puts();
    expect(put.Key).toBe("Grant A/requirements-citations.json");
    const saved = JSON.parse(put.Body as string);
    expect(saved.items).toEqual({
      [requirementKey("EligibilityCriteria", SUMMARY.EligibilityCriteria[0])]: [
        { quote: "Eligible applicants are cities and towns.", page: 1, lastPage: 1 },
      ],
      [requirementKey("KeyDeadlines", SUMMARY.KeyDeadlines[0])]: [{ quote: "Applications are due March 1, 2027.", page: 2, lastPage: 2 }],
    });

    files({
      "Grant A/summary.json": JSON.stringify(SUMMARY),
      "Grant A/raw-text.txt": RAW,
      "Grant A/requirements-citations.json": put.Body as string,
    });
    expect(await cite.handler({ nofoName: "Grant A" })).toEqual({ result: "current" });
    expect(bedrock.commandCalls(InvokeModelCommand)).toHaveLength(1);
  });

  it("cites a long list in batches of 25 against the cached grant, so none are cut off", async () => {
    const many = { ...SUMMARY, EligibilityCriteria: Array.from({ length: 30 }, (_, i) => ({ item: `City ${i + 1}`, description: "Cities may apply." })) };
    files({ "Grant A/summary.json": JSON.stringify(many), "Grant A/raw-text.txt": RAW });
    bedrock.on(InvokeModelCommand).callsFake((input) => {
      const prompt = JSON.parse(input.body as string).messages[0].content[1].text as string;
      return modelReply(
        [...prompt.matchAll(/^\[([EK]\d+)\] /gm)].flatMap(([, id]) => [
          { type: "text", text: `\n[${id}] ` },
          { type: "text", text: "cited", citations: [charCite("Eligible applicants are cities and towns.")] },
        ])
      );
    });

    expect(await cite.handler({ nofoName: "Grant A" })).toEqual({ result: "written" });

    const requests = bedrock.commandCalls(InvokeModelCommand).map((c) => JSON.parse(c.args[0].input.body as string));
    expect(requests.map((r) => r.messages[0].content[1].text.match(/^\[[EK]\d+\] /gm).length)).toEqual([25, 6]);
    for (const r of requests) expect(r.messages[0].content[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(Object.keys(JSON.parse(puts()[0].Body as string).items)).toHaveLength(31);
  });

  it("writes nothing for a grant with no text yet", async () => {
    files({ "Grant A/summary.json": JSON.stringify(SUMMARY) });
    expect(await cite.handler({ nofoName: "Grant A" })).toEqual({ result: "no-source" });
    expect(bedrock.calls()).toHaveLength(0);
    expect(puts()).toHaveLength(0);
  });

  it("reconciles stale grants and keeps going when one fails", async () => {
    s3.on(ListObjectsV2Command).resolves({
      Contents: ["A", "B"].flatMap((n) => [
        { Key: `${n}/summary.json`, LastModified: new Date() },
        { Key: `${n}/raw-text.txt`, LastModified: new Date() },
      ]),
    });
    files({ "A/summary.json": "not json", "A/raw-text.txt": RAW, "B/summary.json": JSON.stringify(SUMMARY), "B/raw-text.txt": RAW });
    bedrock.on(InvokeModelCommand).resolves(modelReply([{ type: "text", text: "[E1] no source" }]));

    const result = await cite.handler({ reconcile: true }, { getRemainingTimeInMillis: () => 14 * 60 * 1000 });

    expect(result).toMatchObject({ stale: 2, failed: 1, written: 1, continued: false });
    expect(lambda.calls()).toHaveLength(0);
  });
});

describe("requirements summary API", () => {
  const landing = (citations?: string) =>
    summaryHandler({
      queryStringParameters: { documentKey: "Grant A/summary.json", ...(citations && { citations }) },
      requestContext: { authorizer: { jwt: { claims: { sub: "user-1", "custom:state": "MA", "custom:role": '["Developer"]' } } } },
    });

  beforeEach(() => {
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Grant A", scope: "federal" }) });
    ddb.on(PutItemCommand).resolves({});
    ddb.on(UpdateItemCommand).resolves({});
    const key = requirementKey("EligibilityCriteria", SUMMARY.EligibilityCriteria[0]);
    files({
      "Grant A/summary.json": JSON.stringify(SUMMARY),
      "Grant A/requirements-citations.json": JSON.stringify({ items: { [key]: [{ quote: "Eligible applicants are cities and towns.", page: 1 }] } }),
    });
  });

  it("adds the quotes only when the Requirements page asks for them", async () => {
    const plain = JSON.parse((await landing()).body).data;
    expect(plain.EligibilityCriteria[0]).not.toHaveProperty("citations");
    expect(s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key)).not.toContain("Grant A/requirements-citations.json");

    const cited = JSON.parse((await landing("1")).body).data;
    expect(cited.EligibilityCriteria[0].citations).toEqual([{ quote: "Eligible applicants are cities and towns.", page: 1 }]);
  });

  it("still answers when the grant has no citations file", async () => {
    files({ "Grant A/summary.json": JSON.stringify(SUMMARY) });
    const res = await landing("1");
    expect(res.statusCode).toBe(200);
    expect(console.warn).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).data.EligibilityCriteria[0]).not.toHaveProperty("citations");
  });
});

describe("requirements editor save", () => {
  it("never stores quotes in summary.json and asks for fresh citations", async () => {
    vi.stubEnv("CITE_REQUIREMENTS_FUNCTION_NAME", "stack-citeRequirementsFunction");
    vi.stubEnv("ENABLE_DYNAMODB_CACHE", "true");
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Grant A", status: "active", scope: "state", state: "MA" }) });
    ddb.on(UpdateItemCommand).resolves({});
    files({ "Grant A/summary.json": JSON.stringify(SUMMARY) });

    const res = await updateHandler({
      requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { "custom:role": '["Developer"]' } } } },
      body: JSON.stringify({
        nofoName: "Grant A",
        summary: { EligibilityCriteria: [{ item: "Cities", description: "Edited.", citations: [{ quote: "old" }] }] },
      }),
    });

    expect(res.statusCode).toBe(200);
    const saved = JSON.parse(puts()[0].Body as string);
    expect(saved.EligibilityCriteria).toEqual([{ item: "Cities", description: "Edited." }]);
    const invoke = lambda.commandCalls(InvokeCommand)[0].args[0].input;
    expect(invoke).toMatchObject({ FunctionName: "stack-citeRequirementsFunction", InvocationType: "Event" });
    expect(JSON.parse(String(invoke.Payload))).toEqual({ nofoName: "Grant A" });
  });
});

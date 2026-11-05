import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requirementKey } from "grantwell-shared";

// Publish uploads through lib-storage, which the Lambda runtime provides and this package doesn't install.
vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    async done() {}
  },
}));

const s3 = mockClient(S3Client);
const bedrock = mockClient(BedrockRuntimeClient);
const lambda = mockClient(LambdaClient);
const ddb = mockClient(DynamoDBClient);

let verify: any;
let verifySummary: (event: any) => Promise<any>;
let validate: (event: any) => Promise<any>;
let cite: { handler: (event: any, context?: any) => Promise<any> };
let quarantine: (event: any) => Promise<any>;
let admin: (event: any) => Promise<any>;
let publish: (event: any) => Promise<any>;
let unverifiedGuidance: (name: string, items: any[], opts?: any) => any;

const QUARANTINE = "stack-QuarantineFunction";

beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  vi.stubEnv("BUCKET", "nofo-bucket");
  vi.stubEnv("HAIKU_MODEL_ID", "haiku");
  vi.stubEnv("SONNET_MODEL_ID", "sonnet");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("QUARANTINE_FUNCTION_NAME", QUARANTINE);
  vi.stubEnv("REVIEW_TABLE_NAME", "reviews");
  vi.stubEnv("PUBLISH_FUNCTION_NAME", "stack-PublishFunction");
  const fns = "../../lib/chatbot-api/functions/nofo-pipeline";
  verify = await import(`${fns}/shared/verify-requirements.mjs`);
  ({ handler: verifySummary } = await import(`${fns}/verify-summary/index.mjs`));
  ({ handler: validate } = await import(`${fns}/validate/index.mjs`));
  cite = await import(`${fns}/cite-requirements/index.mjs`);
  ({ handler: quarantine } = await import(`${fns}/quarantine/index.mjs`));
  ({ handler: admin } = await import(`${fns}/admin/index.mjs`));
  ({ handler: publish } = await import(`${fns}/publish/index.mjs`));
  ({ unverifiedItemsGuidance: unverifiedGuidance } = await import(`${fns}/shared/unverified-guidance.mjs`));
});

const RAW =
  "Section C. Eligible applicants are cities and towns. Awards are up to $250,000 each. " +
  "Section D. Applications are due March 1, 2027.";
const SUMMARY = {
  GrantName: "Grant A",
  EligibilityCriteria: [{ item: "Cities", description: "Cities and towns may apply." }],
  RequiredDocuments: [],
  ProjectNarrativeSections: [],
  KeyDeadlines: [{ item: "Deadline", description: "Applications are due March 1, 2027." }],
  application_deadline: "2027-03-01",
};
const QUESTIONS = { totalQuestions: 1, questions: [{ id: 1, question: "Describe the need." }] };

const body = (text: string) => ({ Body: Readable.from([Buffer.from(text)]) }) as any;
const missing = () => Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
let objects: Record<string, string> = {};
function files(next: Record<string, string>) {
  objects = { ...next };
  s3.on(GetObjectCommand).callsFake((input) => {
    const text = objects[input.Key];
    if (text === undefined || input.Bucket !== "grant-artifacts") throw missing();
    return body(text);
  });
}
const grantFiles = (name: string, summary: object = SUMMARY, extra: Record<string, string> = {}) => ({
  [`${name}/summary.json`]: JSON.stringify(summary),
  [`${name}/raw-text.txt`]: RAW,
  [`${name}/questions.json`]: JSON.stringify(QUESTIONS),
  ...extra,
});

const reply = (content: object[], stop = "end_turn") => ({
  body: new TextEncoder().encode(JSON.stringify({ stop_reason: stop, content })) as any,
});
const charCite = (text: string) => ({
  type: "char_location",
  cited_text: text,
  document_index: 0,
  start_char_index: RAW.indexOf(text),
  end_char_index: RAW.indexOf(text) + text.length,
});

/**
 * A fake Bedrock. Citations come from `quotes` by item name (none for a name not listed), the
 * meaning check from `unsupported` by item name, and Sonnet's rewrite from `rewrite`.
 */
type Fake = { quotes?: Record<string, string>; unsupported?: Record<string, string>; rewrite?: string };
const calls = { cite: [] as any[], meaning: [] as any[], rewrite: [] as any[] };
function fakeBedrock({ quotes = {}, unsupported = {}, rewrite = "" }: Fake) {
  bedrock.on(InvokeModelCommand).callsFake((input) => {
    const request = JSON.parse(input.body as string);
    if (request.output_config?.format) {
      calls.meaning.push(request);
      const prompt = request.messages[0].content.at(-1).text as string;
      const results = [...prompt.matchAll(/<requirement id="(\w+)">\n<name>(.*)<\/name>/g)].map(([, id, name]) => ({
        id,
        supported: !(name in unsupported),
        reason: unsupported[name] ?? "Stated in the passage.",
      }));
      return reply([{ type: "text", text: JSON.stringify({ results }) }]);
    }
    if (input.modelId === "sonnet") {
      calls.rewrite.push(request);
      return reply([{ type: "text", text: rewrite }]);
    }
    calls.cite.push(request);
    const prompt = request.messages[0].content[1].text as string;
    const blocks: object[] = [];
    for (const [, id, name] of prompt.matchAll(/^\[([EDNK]\d+)\] (.+?): /gm)) {
      blocks.push({ type: "text", text: `\n[${id}] ` });
      blocks.push(quotes[name] ? { type: "text", text: name, citations: [charCite(quotes[name])] } : { type: "text", text: "no source" });
    }
    return reply(blocks);
  });
}

const NO_TRIBES = "The grant names cities and towns only; it says nothing about tribal governments.";
const ALL_CITED = {
  Cities: "Eligible applicants are cities and towns.",
  Deadline: "Applications are due March 1, 2027.",
};
const puts = () => s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
const putOf = (key: string) => {
  const found = puts().filter((p) => p.Key === key).at(-1);
  return found ? JSON.parse(found.Body as string) : undefined;
};
const quarantineCalls = () =>
  lambda
    .commandCalls(InvokeCommand)
    .filter((c) => c.args[0].input.FunctionName === QUARANTINE)
    .map((c) => JSON.parse(String(c.args[0].input.Payload)));

beforeEach(() => {
  for (const m of [s3, bedrock, lambda, ddb]) m.reset();
  for (const list of Object.values(calls)) list.length = 0;
  files({});
  s3.on(PutObjectCommand).callsFake((input) => {
    if (input.Bucket === "grant-artifacts") objects[input.Key] = String(input.Body);
    return {};
  });
  s3.on(ListObjectsV2Command).resolves({ Contents: [] });
  lambda.on(InvokeCommand).resolves({ StatusCode: 200 });
  ddb.on(UpdateItemCommand).resolves({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("verifying a grant's requirements", () => {
  it("passes items whose facts are in the grant and whose passages support them", async () => {
    fakeBedrock({ quotes: ALL_CITED });
    const out = await verify.verifyRequirements({ nofoName: "Grant A", summary: SUMMARY, rawText: RAW });

    expect(out.failing).toEqual([]);
    expect(out.summary).toBe(SUMMARY);
    expect(calls.rewrite).toHaveLength(0);
    const [meaning] = calls.meaning;
    expect(meaning.thinking).toEqual({ type: "between_tools" });
    expect(meaning.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(meaning.messages[0].content[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(meaning.messages[0].content[0].text).toContain(RAW);
    expect(meaning.messages[0].content.at(-1).text).toContain("Eligible applicants are cities and towns.");
    expect(Object.keys(out.citationsFile.items)).toHaveLength(2);
  });

  it("fails an item with an amount the grant doesn't state, without asking the model about it", async () => {
    fakeBedrock({ quotes: { ...ALL_CITED, Awards: "Awards are up to $250,000 each." } });
    const summary = { ...SUMMARY, RequiredDocuments: [{ item: "Awards", description: "Awards are up to $2 million." }] };
    const out = await verify.verifyRequirements({ nofoName: "Grant A", summary, rawText: RAW, rewrite: false });

    expect(out.failing).toEqual([{ category: "RequiredDocuments", item: "Awards", reason: 'The grant doesn\'t state "$2 million".' }]);
    expect(calls.meaning[0].messages[0].content.at(-1).text).not.toContain("<name>Awards</name>");
  });

  it("fails an item the grant doesn't support, and judges one with no passage against the whole grant", async () => {
    fakeBedrock({ quotes: { Cities: ALL_CITED.Cities }, unsupported: { Cities: "The grant also allows towns; it says nothing about counties." } });
    const summary = { ...SUMMARY, EligibilityCriteria: [{ item: "Cities", description: "Cities and counties may apply." }] };
    const out = await verify.verifyRequirements({ nofoName: "Grant A", summary, rawText: RAW, rewrite: false });

    expect(out.failing).toEqual([
      { category: "EligibilityCriteria", item: "Cities", reason: "The grant also allows towns; it says nothing about counties." },
    ]);
    expect(calls.meaning[0].messages[0].content.at(-1).text).toContain("<name>Deadline</name>");
  });

  it("fails an application deadline the grant doesn't give", async () => {
    fakeBedrock({ quotes: ALL_CITED });
    const out = await verify.verifyRequirements({ nofoName: "Grant A", summary: { ...SUMMARY, application_deadline: "2027-04-01" }, rawText: RAW, rewrite: false });
    expect(out.failing).toEqual([
      { category: "application_deadline", item: "2027-04-01", reason: "The date 2027-04-01 does not appear in the grant." },
    ]);
  });

  it("keeps a rewrite that passes the same checks", async () => {
    fakeBedrock({
      quotes: { ...ALL_CITED, "Cities and counties": ALL_CITED.Cities },
      unsupported: { "Cities and counties": "Counties are not eligible." },
      rewrite: "[E1] NAME: Cities || TEXT: Cities and towns may apply.",
    });
    const summary = { ...SUMMARY, EligibilityCriteria: [{ item: "Cities and counties", description: "Cities and counties may apply.", extra: 1 }] };
    const out = await verify.verifyRequirements({ nofoName: "Grant A", summary, rawText: RAW });

    expect(out.failing).toEqual([]);
    expect(out.rewritten).toEqual(["E1"]);
    expect(out.summary.EligibilityCriteria).toEqual([{ item: "Cities", description: "Cities and towns may apply.", extra: 1 }]);
    expect(summary.EligibilityCriteria[0].item).toBe("Cities and counties");

    const [rewrite] = calls.rewrite;
    expect(rewrite.messages[0].content[0]).toMatchObject({ type: "document", source: { data: RAW }, citations: { enabled: true } });
    expect(rewrite).not.toHaveProperty("output_config.format");
    expect(rewrite.messages[0].content[1].text).toContain("[E1] Cities and counties: Cities and counties may apply.\nReason: Counties are not eligible.");
    expect(calls.cite).toHaveLength(2);
    expect(calls.cite[1].messages[0].content[1].text).toContain("[E1] Cities: Cities and towns may apply.");
    expect(calls.cite[1].messages[0].content[1].text).not.toContain("[K1]");

    const newKey = requirementKey("EligibilityCriteria", out.summary.EligibilityCriteria[0]);
    expect(out.citationsFile.items[newKey]).toEqual([{ quote: ALL_CITED.Cities }]);
  });

  it("keeps an item the rewrite says to remove, still failing", async () => {
    fakeBedrock({ quotes: { Deadline: ALL_CITED.Deadline }, unsupported: { Tribes: NO_TRIBES }, rewrite: "[E1] REMOVE" });
    const summary = { ...SUMMARY, EligibilityCriteria: [{ item: "Tribes", description: "Tribal governments may apply." }] };
    const out = await verify.verifyRequirements({ nofoName: "Grant A", summary, rawText: RAW });

    expect(out.summary.EligibilityCriteria).toEqual(summary.EligibilityCriteria);
    expect(out.failing).toEqual([
      {
        category: "EligibilityCriteria",
        item: "Tribes",
        reason: `${NO_TRIBES} The automatic rewrite found nothing in the grant that states it.`,
      },
    ]);
    expect(calls.cite).toHaveLength(1);
  });

  it("keeps the original item when its rewrite fails too", async () => {
    fakeBedrock({ quotes: ALL_CITED, rewrite: "[E1] NAME: Cities || TEXT: Cities, towns and counties with $3 million budgets may apply." });
    const summary = { ...SUMMARY, EligibilityCriteria: [{ item: "Cities", description: "Cities and counties may apply with a $5 match." }] };
    const out = await verify.verifyRequirements({ nofoName: "Grant A", summary, rawText: RAW });

    expect(out.summary.EligibilityCriteria).toEqual(summary.EligibilityCriteria);
    expect(out.failing).toHaveLength(1);
    expect(out.failing[0].reason).toContain("A rewrite was tried but could not be confirmed either");
  });

  it("parses rewrite lines split across cited blocks", () => {
    const answers = verify.parseRewrite([
      { type: "thinking", thinking: "" },
      { type: "text", text: "[E1] NAME: Cities || TEXT: " },
      { type: "text", text: "Cities and towns may apply.", citations: [charCite(ALL_CITED.Cities)] },
      { type: "text", text: "\n[D2] REMOVE\n[AD] DATE: 2027-03-01" },
    ]);
    expect(Object.fromEntries(answers)).toEqual({
      E1: { item: "Cities", description: "Cities and towns may apply." },
      D2: { remove: true },
      AD: { date: "2027-03-01" },
    });
  });
});

describe("VerifySummary step", () => {
  const event = { nofoName: "Grant A", s3Bucket: "nofo-bucket", rawTextKey: "Grant A/raw-text.txt", mergedSummary: SUMMARY, questionsData: QUESTIONS };

  it("saves the verified citations and passes on only the failing names and reasons", async () => {
    files({ "Grant A/raw-text.txt": RAW, "Grant A/requirements-citations.json": JSON.stringify({ items: {}, approval: { itemsHash: "old" } }) });
    fakeBedrock({ quotes: { Cities: ALL_CITED.Cities }, unsupported: { Deadline: "The grant gives March 1, not a rolling deadline." }, rewrite: "[K1] REMOVE" });

    const out = await verifySummary(event);

    expect(out.failingItems).toEqual([
      expect.objectContaining({ category: "KeyDeadlines", item: "Deadline" }),
    ]);
    expect(out.mergedSummary).toEqual(SUMMARY);
    expect(out.questionsData).toEqual(QUESTIONS);
    const saved = putOf("Grant A/requirements-citations.json");
    expect(saved.items).toEqual({ [requirementKey("EligibilityCriteria", SUMMARY.EligibilityCriteria[0])]: [{ quote: ALL_CITED.Cities }] });
    expect(saved.approval).toEqual({ itemsHash: "old" });
    expect(JSON.stringify(out).length).toBeLessThan(256 * 1024);
  });

  it("shows the grant as checking sources while it runs", async () => {
    files({ "Grant A/raw-text.txt": RAW });
    fakeBedrock({ quotes: ALL_CITED });
    await verifySummary(event);
    const [update] = ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input);
    expect(update).toMatchObject({ TableName: "nofos", UpdateExpression: "SET processing_status = :s, updated_at = :now" });
    expect(unmarshall(update.ExpressionAttributeValues!)[":s"]).toBe("checking_sources");
  });

  it("carries a rewritten deadline to the publish step", async () => {
    files({ "Grant A/raw-text.txt": RAW });
    fakeBedrock({ quotes: ALL_CITED, rewrite: "[AD] DATE: 2027-03-01" });
    const out = await verifySummary({ ...event, mergedSummary: { ...SUMMARY, application_deadline: "2027-03-02" }, applicationDeadline: "2027-03-02" });
    expect(out.failingItems).toEqual([]);
    expect(out.applicationDeadline).toBe("2027-03-01");
    expect(out.mergedSummary.application_deadline).toBe("2027-03-01");
  });
});

describe("ContentCheck with verification", () => {
  const base = { nofoName: "Grant A", mergedSummary: { ...SUMMARY, RequiredDocuments: [{ item: "Budget", description: "A budget." }], ProjectNarrativeSections: [{ item: "Need", description: "The need." }] }, questionsData: QUESTIONS };

  it("holds a grant with failing items for review and names each one", async () => {
    const failingItems = [
      { category: "EligibilityCriteria", item: "Tribes", reason: "No passage in the grant states this." },
      { category: "application_deadline", item: "2027-04-01", reason: "The date 2027-04-01 does not appear in the grant." },
    ];
    const out = await validate({ ...base, failingItems });

    expect(out.validationResult).toEqual({ overallVerdict: "NEEDS_REVIEW" });
    expect(out.adminGuidance).toMatchObject({ reason: "unverified_items", canApprove: true });
    expect(out.adminGuidance.message).toContain('Eligibility Criteria: "Tribes"; Application deadline: "2027-04-01"');
    expect(out.adminGuidance.failingItems).toEqual([
      { category: "EligibilityCriteria", label: "Eligibility Criteria", item: "Tribes", reason: "No passage in the grant states this." },
      { category: "application_deadline", label: "Application deadline", item: "2027-04-01", reason: "The date 2027-04-01 does not appear in the grant." },
    ]);
  });

  it("holds an otherwise auto-publishable partial grant when an item fails", async () => {
    const out = await validate({ ...base, mergedSummary: SUMMARY, failingItems: [{ category: "KeyDeadlines", item: "Deadline", reason: "x" }] });
    expect(out.validationResult.overallVerdict).toBe("NEEDS_REVIEW");
    expect(out.adminGuidance.missingCategories).toEqual(["RequiredDocuments", "ProjectNarrativeSections"]);
  });

  it("passes a grant with no failing items, as before", async () => {
    const out = await validate({ ...base, failingItems: [] });
    expect(out.validationResult).toEqual({ overallVerdict: "PASS" });
    expect(out.adminGuidance).toBeNull();
  });
});

describe("checking live grants", () => {
  const BAD = { ...SUMMARY, EligibilityCriteria: [{ item: "Tribes", description: "Tribal governments may apply." }] };
  const ctx = { getRemainingTimeInMillis: () => 14 * 60 * 1000 };
  const live = (names: string[], archived: string[] = []) =>
    ddb.on(QueryCommand).callsFake((input) => {
      const status = unmarshall(input.ExpressionAttributeValues)[":s"];
      const listed = status === "active" ? names : status === "archived" ? archived : [];
      return { Items: listed.map((n) => marshall({ nofo_name: n, status })) };
    });
  const reportPut = () => puts().filter((p) => String(p.Key).startsWith("_verification/")).at(-1);

  beforeEach(() => {
    live(["Good Grant", "Bad Grant"]);
    files({ ...grantFiles("Good Grant"), ...grantFiles("Bad Grant", BAD) });
    fakeBedrock({ quotes: ALL_CITED, unsupported: { Tribes: NO_TRIBES } });
  });

  it("dry run writes a report of failing grants and items and changes nothing else", async () => {
    const out = await cite.handler({ verifyLive: true, apply: false }, ctx);

    expect(out).toMatchObject({ total: 2, checked: 2, complete: true, continued: false, passed: 1, failing: 1 });
    const report = JSON.parse(reportPut()!.Body as string);
    expect(reportPut()!.Key).toBe(`_verification/${out.reportId}.json`);
    expect(report.failing).toEqual([
      { grant: "Bad Grant", status: "active", items: [{ category: "EligibilityCriteria", item: "Tribes", reason: NO_TRIBES }] },
    ]);
    expect(report.applied).toBeNull();
    expect(calls.rewrite).toHaveLength(0);
    expect(quarantineCalls()).toHaveLength(0);
    expect(puts().every((p) => String(p.Key).startsWith("_verification/"))).toBe(true);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
  });

  it("apply unpublishes only the grants the report lists, through the quarantine step", async () => {
    files({ ...grantFiles("Good Grant"), ...grantFiles("Bad Grant", BAD), ...grantFiles("Later Grant", BAD) });
    const { reportId } = await cite.handler({ verifyLive: true, apply: false }, ctx);
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Bad Grant", status: "active" }) });
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "Bad Grant/NOFO-File-PDF" }] });

    const out = await cite.handler({ verifyLive: true, apply: true, reportId }, ctx);

    expect(out).toMatchObject({ reportId, unpublished: 1, skipped: 0, errors: 0 });
    const [payload] = quarantineCalls();
    expect(quarantineCalls()).toHaveLength(1);
    expect(payload).toMatchObject({
      nofoName: "Bad Grant",
      documentKey: "Bad Grant/NOFO-File-PDF",
      rawTextKey: "Bad Grant/raw-text.txt",
      mergedSummary: BAD,
      questionsData: QUESTIONS,
      validationResult: { overallVerdict: "NEEDS_REVIEW" },
      source: "verification",
      adminGuidance: { reason: "unverified_items", failingItems: [expect.objectContaining({ item: "Tribes" })] },
    });
    expect(payload.adminGuidance.message).toContain('"Bad Grant" was live and has been unpublished');
    expect(JSON.parse(reportPut()!.Body as string).applied).toMatchObject({ unpublished: ["Bad Grant"], skipped: [], errors: [] });

    expect(await cite.handler({ verifyLive: true, apply: true, reportId }, ctx)).toMatchObject({ alreadyApplied: expect.any(String) });
    expect(quarantineCalls()).toHaveLength(1);
  });

  it("apply skips a reported grant whose items changed after the report", async () => {
    const { reportId } = await cite.handler({ verifyLive: true, apply: false }, ctx);
    objects["Bad Grant/summary.json"] = JSON.stringify({ ...BAD, EligibilityCriteria: [{ item: "Cities", description: "Edited." }] });
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Bad Grant", status: "active" }) });

    expect(await cite.handler({ verifyLive: true, apply: true, reportId }, ctx)).toMatchObject({ unpublished: 0, skipped: 1 });
    expect(quarantineCalls()).toHaveLength(0);
  });

  it("apply skips a reported grant that is no longer live", async () => {
    const { reportId } = await cite.handler({ verifyLive: true, apply: false }, ctx);
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Bad Grant", status: "quarantined" }) });

    await cite.handler({ verifyLive: true, apply: true, reportId }, ctx);

    expect(JSON.parse(reportPut()!.Body as string).applied.skipped).toEqual([
      { grant: "Bad Grant", why: "it is no longer live (status quarantined)" },
    ]);
    expect(quarantineCalls()).toHaveLength(0);
  });

  it("checks archived grants too, and holds a failing one noting it was archived", async () => {
    live(["Good Grant"], ["Bad Grant"]);
    const { reportId, ...out } = await cite.handler({ verifyLive: true, apply: false }, ctx);
    expect(out).toMatchObject({ total: 2, passed: 1, failing: 1 });
    expect(JSON.parse(reportPut()!.Body as string).failing).toEqual([
      expect.objectContaining({ grant: "Bad Grant", status: "archived" }),
    ]);

    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Bad Grant", status: "archived" }) });
    expect(await cite.handler({ verifyLive: true, apply: true, reportId }, ctx)).toMatchObject({ unpublished: 1 });
    expect(quarantineCalls()[0]).toMatchObject({ nofoName: "Bad Grant", source: "verification", previousStatus: "archived" });
  });

  it("retries a grant whose check errored once, then reports it as an error and never unpublishes it", async () => {
    s3.on(GetObjectCommand).callsFake((input) => {
      if (input.Key.startsWith("Bad Grant/")) throw Object.assign(new Error("Slow down"), { name: "SlowDown" });
      const text = objects[input.Key];
      if (text === undefined || input.Bucket !== "grant-artifacts") throw missing();
      return body(text);
    });

    const { reportId, ...out } = await cite.handler({ verifyLive: true, apply: false }, ctx);

    expect(out).toMatchObject({ complete: true, passed: 1, error: 1 });
    const report = JSON.parse(reportPut()!.Body as string);
    expect(report.errors).toEqual([{ grant: "Bad Grant", error: "Slow down", attempts: 2 }]);
    expect(report.failing).toEqual([]);
    expect(await cite.handler({ verifyLive: true, apply: true, reportId }, ctx)).toMatchObject({ unpublished: 0, errors: 0 });
    expect(quarantineCalls()).toHaveLength(0);
  });

  it("keeps a grant whose check errored once and then passed out of the error list", async () => {
    let first = true;
    s3.on(GetObjectCommand).callsFake((input) => {
      if (input.Key === "Bad Grant/summary.json" && first) {
        first = false;
        throw Object.assign(new Error("Slow down"), { name: "SlowDown" });
      }
      const text = objects[input.Key];
      if (text === undefined || input.Bucket !== "grant-artifacts") throw missing();
      return body(text);
    });

    const out = await cite.handler({ verifyLive: true, apply: false }, ctx);

    expect(out).toMatchObject({ complete: true, passed: 1, failing: 1 });
    expect(out).not.toHaveProperty("error");
    expect(JSON.parse(reportPut()!.Body as string).errors).toEqual([]);
  });

  it("holds a live grant whose text can't be read, and says so plainly", async () => {
    delete objects["Bad Grant/raw-text.txt"];
    const { reportId } = await cite.handler({ verifyLive: true, apply: false }, ctx);
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Bad Grant", status: "active" }) });

    await cite.handler({ verifyLive: true, apply: true, reportId }, ctx);

    const [{ adminGuidance }] = quarantineCalls();
    expect(adminGuidance).toMatchObject({ reason: "unverified_items", canApprove: true, title: "The grant's text couldn't be read" });
    expect(adminGuidance.message).toContain("GrantWell couldn't read this grant's text");
    expect(adminGuidance.message).toContain("The grant text is missing");
  });

  it("refuses to apply a report that is not finished", async () => {
    const { reportId } = await cite.handler({ verifyLive: true, apply: false }, { getRemainingTimeInMillis: () => 60 * 1000 });
    await expect(cite.handler({ verifyLive: true, apply: true, reportId }, ctx)).rejects.toThrow(/not complete/);
    expect(quarantineCalls()).toHaveLength(0);
  });

  it("continues a long dry run in a new invocation from the saved report", async () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "stack-citeRequirementsFunction";
    try {
      const first = await cite.handler({ verifyLive: true, apply: false }, { getRemainingTimeInMillis: () => 60 * 1000 });
      expect(first).toMatchObject({ checked: 0, complete: false, continued: true });
      const next = JSON.parse(String(lambda.commandCalls(InvokeCommand)[0].args[0].input.Payload));
      expect(next).toEqual({ verifyLive: true, apply: false, reportId: first.reportId, round: 2 });

      expect(await cite.handler(next, ctx)).toMatchObject({ reportId: first.reportId, checked: 2, complete: true, failing: 1 });
    } finally {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    }
  });

  it("does not flag a grant an admin approved with the same items", async () => {
    const approval = { at: "2026-11-01T00:00:00Z", itemsHash: cite.itemsHash(cite.requirementItems(BAD)), applicationDeadline: "2027-03-01" };
    objects["Bad Grant/requirements-citations.json"] = JSON.stringify({ items: {}, approval });
    const out = await cite.handler({ verifyLive: true, apply: false }, ctx);
    expect(out).toMatchObject({ passed: 1, approved: 1 });
    expect(out).not.toHaveProperty("failing");
  });

  it("the nightly reconcile never unpublishes, even with a failing report on file", async () => {
    await cite.handler({ verifyLive: true, apply: false }, ctx);
    const meaningCalls = calls.meaning.length;
    s3.on(ListObjectsV2Command).resolves({
      Contents: Object.keys(objects).map((Key) => ({ Key, LastModified: new Date() })),
    });

    const out = await cite.handler({ reconcile: true }, ctx);

    expect(out).toMatchObject({ stale: 2, written: 2 });
    expect(quarantineCalls()).toHaveLength(0);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
    expect(calls.meaning).toHaveLength(meaningCalls);
  });
});

describe("restoring a held live grant's status", () => {
  const statusSet = () =>
    ddb
      .commandCalls(UpdateItemCommand)
      .map((c) => c.args[0].input)
      .filter((i) => i.TableName === "nofos" && String(i.UpdateExpression).includes("#status = :status"))
      .map((i) => unmarshall(i.ExpressionAttributeValues!)[":status"]);

  it("quarantine records the status the grant had on its review row", async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });
    ddb.on(PutItemCommand).resolves({});
    await quarantine({ nofoName: "Old Grant", mergedSummary: SUMMARY, source: "verification", previousStatus: "archived" });
    const item = unmarshall(ddb.commandCalls(PutItemCommand)[0].args[0].input.Item!);
    expect(item).toMatchObject({ nofo_name: "Old Grant", source: "verification", previous_status: "archived" });

    ddb.resetHistory();
    await quarantine({ nofoName: "New Grant", mergedSummary: SUMMARY });
    expect(unmarshall(ddb.commandCalls(PutItemCommand)[0].args[0].input.Item!)).not.toHaveProperty("previous_status");
  });

  const approve = async (row: Record<string, unknown>) => {
    ddb.on(GetItemCommand).callsFake((input) =>
      input.TableName === "reviews"
        ? { Item: marshall({ nofo_name: "Old Grant", review_id: "r1", status: "pending_review", extractedSummary: JSON.stringify(SUMMARY), extractedQuestions: JSON.stringify(QUESTIONS), ...row }) }
        : { Item: marshall({ nofo_name: "Old Grant", status: "quarantined", scope: "federal" }) }
    );
    const res = await admin({
      requestContext: {
        http: { method: "POST", path: "/admin/processing-reviews/Old%20Grant/approve" },
        authorizer: { jwt: { claims: { "custom:role": JSON.stringify(["Developer"]), email: "dev@example.org" } } },
      },
      body: JSON.stringify({ reviewId: "r1" }),
    });
    expect(res.statusCode).toBe(200);
    const call = lambda.commandCalls(InvokeCommand).find((c) => c.args[0].input.FunctionName === "stack-PublishFunction")!;
    return JSON.parse(String(call.args[0].input.Payload));
  };

  it("approving a grant that was archived publishes it back as archived", async () => {
    expect(await approve({ previous_status: "archived" })).toMatchObject({ nofoName: "Old Grant", publishStatus: "archived" });
  });

  it("approving any other held grant publishes it as active, as before", async () => {
    expect(await approve({ previous_status: "active" })).not.toHaveProperty("publishStatus");
    lambda.resetHistory();
    expect(await approve({})).not.toHaveProperty("publishStatus");
  });

  it("publish writes the status it is given for an archived grant, and active otherwise", async () => {
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Old Grant", status: "quarantined" }) });
    const event = { nofoName: "Old Grant", s3Bucket: "nofo-bucket", mergedSummary: SUMMARY, questionsData: QUESTIONS };
    await publish({ ...event, publishStatus: "archived" });
    await publish(event);
    expect(statusSet()).toEqual(["archived", "active"]);
  });
});

describe("reprocessing a grant that is already live", () => {
  const metadataWrites = () =>
    ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input).filter((i) => i.TableName === "nofos");
  const statusWrites = () =>
    metadataWrites()
      .filter((i) => String(i.UpdateExpression).includes("#status = "))
      .map((i) => unmarshall(i.ExpressionAttributeValues!));
  const reviewRow = () => unmarshall(ddb.commandCalls(PutItemCommand)[0].args[0].input.Item!);
  const withRow = (row: Record<string, unknown> | null, review: Record<string, unknown> = {}) =>
    ddb.on(GetItemCommand).callsFake((input) =>
      input.TableName === "reviews"
        ? { Item: marshall({ nofo_name: "Live Grant", review_id: "r1", status: "pending_review", extractedSummary: JSON.stringify(SUMMARY), extractedQuestions: JSON.stringify(QUESTIONS), ...review }) }
        : row ? { Item: marshall({ nofo_name: "Live Grant", scope: "federal", ...row }) } : {}
    );
  const asAdmin = (action: "approve" | "reject") =>
    admin({
      requestContext: {
        http: { method: "POST", path: `/admin/processing-reviews/Live%20Grant/${action}` },
        authorizer: { jwt: { claims: { "custom:role": JSON.stringify(["Developer"]), email: "dev@example.org" } } },
      },
      body: JSON.stringify({ reviewId: "r1" }),
    });

  beforeEach(() => {
    ddb.on(QueryCommand).resolves({ Items: [] });
    ddb.on(PutItemCommand).resolves({});
    ddb.on(DeleteItemCommand).resolves({});
    s3.on(HeadObjectCommand).resolves({});
    s3.on(DeleteObjectsCommand).resolves({});
  });

  it.each(["active", "archived"])("holds a failing new version for review and leaves the %s grant up", async (status) => {
    withRow({ status });

    await quarantine({ nofoName: "Live Grant", mergedSummary: SUMMARY, source: "pipeline" });

    expect(statusWrites()).toEqual([]);
    expect(metadataWrites().some((i) => unmarshall(i.ExpressionAttributeValues!)[":s"] === "quarantined")).toBe(true);
    expect(reviewRow()).toMatchObject({ nofo_name: "Live Grant", status: "pending_review", live_status: status });
    expect(reviewRow()).not.toHaveProperty("previous_status");
  });

  it("holds a grant with no published summary as before, though its row says active", async () => {
    withRow({ status: "active" });
    s3.on(HeadObjectCommand).rejects(Object.assign(new Error("Not Found"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }));

    await quarantine({ nofoName: "Live Grant", mergedSummary: SUMMARY });

    expect(statusWrites().map((v) => v[":s"])).toEqual(["quarantined"]);
    expect(reviewRow()).not.toHaveProperty("live_status");
  });

  it("the live check's unpublish takes the grant down and keeps the status it had on the row", async () => {
    withRow({ status: "archived" });

    await quarantine({ nofoName: "Live Grant", mergedSummary: SUMMARY, source: "verification", unpublish: true, previousStatus: "archived" });

    expect(statusWrites()).toEqual([expect.objectContaining({ ":s": "quarantined", ":prev": "archived" })]);
    expect(reviewRow()).toMatchObject({ previous_status: "archived" });
    expect(reviewRow()).not.toHaveProperty("live_status");
    expect(s3.commandCalls(HeadObjectCommand)).toHaveLength(0);
  });

  it("a held archived grant that is reprocessed and fails again keeps previous_status on its new review", async () => {
    withRow({ status: "processing", previous_status: "archived" });

    await quarantine({ nofoName: "Live Grant", mergedSummary: SUMMARY, source: "pipeline" });

    expect(statusWrites()).toEqual([expect.objectContaining({ ":s": "quarantined", ":prev": "archived" })]);
    expect(reviewRow()).toMatchObject({ previous_status: "archived" });
  });

  it.each([
    ["a live active grant stays active", { status: "active" }, "active"],
    ["a live archived grant stays archived", { status: "archived" }, "archived"],
    ["a held archived grant goes back to archived", { status: "processing", previous_status: "archived" }, "archived"],
    ["a new grant goes live as active", { status: "processing" }, "active"],
  ])("publishing: %s", async (_label, row, expected) => {
    withRow(row);

    await publish({ nofoName: "Live Grant", s3Bucket: "nofo-bucket", mergedSummary: SUMMARY, questionsData: QUESTIONS });

    const write = metadataWrites().find((i) => String(i.UpdateExpression).includes("#status = :status"))!;
    expect(unmarshall(write.ExpressionAttributeValues!)[":status"]).toBe(expected);
    expect(write.UpdateExpression).toMatch(/REMOVE .*previous_status/);
  });

  it("approving the held new version publishes it under the grant's current status", async () => {
    withRow({ status: "archived", processing_status: "quarantined" }, { live_status: "active" });

    expect((await asAdmin("approve")).statusCode).toBe(200);

    const call = lambda.commandCalls(InvokeCommand).find((c) => c.args[0].input.FunctionName === "stack-PublishFunction")!;
    const payload = JSON.parse(String(call.args[0].input.Payload));
    expect(payload).toMatchObject({ nofoName: "Live Grant", mergedSummary: SUMMARY });
    expect(payload).not.toHaveProperty("publishStatus");
  });

  it("rejecting the held new version keeps the live grant, its files and its row", async () => {
    withRow({ status: "active", processing_status: "quarantined" }, { live_status: "active" });

    const res = await asAdmin("reject");

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ keptLive: true });
    expect(ddb.commandCalls(DeleteItemCommand)).toHaveLength(0);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
    const rejected = ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input).find((i) => i.TableName === "reviews")!;
    expect(unmarshall(rejected.ExpressionAttributeValues!)[":status"]).toBe("rejected");
    expect(metadataWrites().map((i) => i.UpdateExpression)).toEqual([expect.stringContaining("REMOVE processing_status")]);
  });

  it("rejecting a held grant with no live version still deletes it", async () => {
    withRow({ status: "quarantined", previous_status: "active" });
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "Live Grant/NOFO-File-PDF" }] });

    const res = await asAdmin("reject");

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).not.toHaveProperty("keptLive");
    expect(ddb.commandCalls(DeleteItemCommand)).toHaveLength(1);
    expect(s3.commandCalls(DeleteObjectsCommand).length).toBeGreaterThan(0);
  });

  it("rejecting refuses, changing nothing, when the grant's row can't be read", async () => {
    ddb.on(GetItemCommand).callsFake((input) => {
      if (input.TableName === "nofos" && !input.ProjectionExpression) throw new Error("Throttled");
      return input.TableName === "reviews" ? { Item: marshall({ nofo_name: "Live Grant", review_id: "r1", status: "pending_review" }) } : { Item: marshall({ nofo_name: "Live Grant", scope: "federal" }) };
    });

    const res = await asAdmin("reject");

    expect(res.statusCode).toBe(500);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
    expect(ddb.commandCalls(DeleteItemCommand)).toHaveLength(0);
  });

  it("says an archived grant the live check holds was published, not live", () => {
    const failing = [{ category: "EligibilityCriteria", item: "Tribes", reason: "No passage." }];
    expect(unverifiedGuidance("Old Grant", failing, { live: "archived" }).message).toContain('"Old Grant" was published and has been unpublished');
    expect(unverifiedGuidance("Old Grant", failing, { live: "active" }).message).toContain('"Old Grant" was live and has been unpublished');
    const unreadable = [{ category: "grant_text", item: "Grant text", reason: "The grant text is missing." }];
    expect(unverifiedGuidance("Old Grant", unreadable, { live: "archived" }).message).toContain("was published");
  });
});

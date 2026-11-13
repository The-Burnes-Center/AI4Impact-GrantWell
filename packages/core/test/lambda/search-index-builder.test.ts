import { gunzipSync } from "node:zlib";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeIndex } from "../../lib/chatbot-api/functions/landing-page/ai-grant-search/search-core.mjs";
import { FakeBucket, s3Error, textVector } from "./search-index-helpers";

const TITAN = "titan-profile";
const HAIKU = "haiku-profile";
const MODULE = "../../lib/chatbot-api/functions/landing-page/ai-grant-search/builder.mjs";

const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);
const sqs = mockClient(SQSClient);

let artifacts: FakeBucket;
let legacy: FakeBucket;
let rows: Record<string, any>[];
let builder: any;

const summary = (name: string, eligibility: string, extra: object = {}) =>
  JSON.stringify({
    GrantName: name,
    EligibilityCriteria: [{ item: "Eligible applicants", description: eligibility }],
    ProjectNarrativeSections: [{ item: "Project description", description: `Describe the ${name} project` }],
    KeyDeadlines: [{ item: "Application due", description: "March 1" }],
    ...extra,
  });

const titanCalls = () => bedrock.commandCalls(InvokeModelCommand).filter((c) => c.args[0].input.modelId === TITAN);
const haikuCalls = () => bedrock.commandCalls(InvokeModelCommand).filter((c) => c.args[0].input.modelId === HAIKU);
const pointer = () => JSON.parse(artifacts.objects.get("_search/current.json")!.body.toString());
const liveIndex = () => decodeIndex(artifacts.objects.get(pointer().indexKey)!.body);
const liveState = () => JSON.parse(gunzipSync(artifacts.objects.get(pointer().stateKey)!.body).toString());
const pointerPuts = () => s3.commandCalls(PutObjectCommand).filter((c) => c.args[0].input.Key === "_search/current.json");

beforeEach(async () => {
  for (const m of [bedrock, ddb, s3, sqs]) m.reset();
  vi.stubEnv("ARTIFACTS_BUCKET", "artifacts");
  vi.stubEnv("BUCKET", "nofos");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos-table");
  vi.stubEnv("TITAN_MODEL_ID", TITAN);
  vi.stubEnv("HAIKU_MODEL_ID", HAIKU);
  vi.stubEnv("QUEUE_URL", "https://sqs.example/queue");
  artifacts = new FakeBucket();
  legacy = new FakeBucket();
  const bucketOf = (b: string) => (b === "artifacts" ? artifacts : legacy);
  s3.on(GetObjectCommand).callsFake((input) => bucketOf(input.Bucket).get(input));
  s3.on(PutObjectCommand).callsFake((input) => bucketOf(input.Bucket).putObject(input));
  s3.on(ListObjectsV2Command).callsFake((input) => bucketOf(input.Bucket).list(input));
  s3.on(DeleteObjectsCommand).callsFake((input) => bucketOf(input.Bucket).deleteObjects(input));

  rows = [
    { nofo_name: "Bus Replacement", agency: "FTA", category: "Transportation", status: "active" },
    { nofo_name: "Rural Libraries", agency: "IMLS", category: "Arts", status: "active", scope: "state", state: "MA" },
    { nofo_name: "Unprocessed Grant", status: "active" },
  ];
  ddb.on(ScanCommand).callsFake(() => ({ Items: rows.map((r) => marshall(r)) }));
  artifacts.put("Bus Replacement/summary.json", summary("Bus Replacement", "Transit agencies"));
  artifacts.put("Bus Replacement/raw-text.txt", "The program replaces diesel buses.");
  legacy.put("Rural Libraries/summary.json", summary("Rural Libraries", "Public libraries in towns under 10,000"));

  bedrock.on(InvokeModelCommand).callsFake((input) => {
    const body = JSON.parse(input.body);
    if (input.modelId === TITAN) {
      return { body: new TextEncoder().encode(JSON.stringify({ embedding: textVector(body.inputText) })) };
    }
    const prompt: string = body.messages[0].content;
    const grant = /Grant: (.+)/.exec(prompt)![1];
    return {
      body: new TextEncoder().encode(JSON.stringify({
        stop_reason: "end_turn",
        content: [{ type: "text", text: `Who can apply: applicants of ${grant}\nPays for: things\nExample projects: a; b; c\nTypical applicants: towns` }],
      })),
    };
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.resetModules();
  builder = await import(MODULE);
});

describe("search index builder", () => {
  it("builds the first index without profiles, then asks for a continuation run", async () => {
    const result = await builder.handler({ Records: [{ body: "{}" }] }, { getRemainingTimeInMillis: () => 900_000 });

    expect(result.changed).toBe(true);
    expect(haikuCalls()).toHaveLength(0);
    const idx = liveIndex();
    expect(idx.docs.map((d: any) => d.name)).toEqual(["Bus Replacement", "Rural Libraries", "Unprocessed Grant"]);
    expect(idx.docs[1]).toMatchObject({ scope: "state", state: "MA", agency: "IMLS" });
    expect(idx.termIds.has("transit")).toBe(true);
    expect(idx.termIds.has("library")).toBe(true);
    expect(pointerPuts()[0].args[0].input.IfNoneMatch).toBe("*");
    expect(result.profilesPending).toBe(2);
    expect(sqs.commandCalls(SendMessageCommand)[0].args[0].input).toMatchObject({ QueueUrl: "https://sqs.example/queue" });
  });

  it("writes profiles on the next run, re-embedding only the grants that got one", async () => {
    await builder.buildIndex();
    const firstEmbeds = titanCalls().length;
    bedrock.resetHistory();

    const result = await builder.buildIndex();

    expect(haikuCalls()).toHaveLength(2);
    expect(result.profilesWritten).toBe(2);
    const state = liveState();
    expect(state.docs["Bus Replacement"].profile).toMatch(/^Who can apply: applicants of Bus Replacement/);
    expect(state.docs["Unprocessed Grant"].profile).toBe("");
    const embeddedTexts = titanCalls().map((c) => JSON.parse(c.args[0].input.body as string).inputText);
    expect(embeddedTexts.every((t: string) => t.includes("Use-case profile:"))).toBe(true);
    expect(embeddedTexts.some((t: string) => t.startsWith("Unprocessed Grant"))).toBe(false);
    expect(firstEmbeds).toBeGreaterThan(titanCalls().length);
    expect(liveIndex().termIds.has("town")).toBe(true);
  });

  it("re-embeds and re-profiles only the grant whose summary changed", async () => {
    await builder.buildIndex();
    await builder.buildIndex();
    bedrock.resetHistory();

    artifacts.put("Bus Replacement/summary.json", summary("Bus Replacement", "Transit agencies and tribes"));
    const result = await builder.buildIndex();

    expect(result).toMatchObject({ changed: true, reused: 2, summariesRead: 1, profilesWritten: 1 });
    expect(haikuCalls().map((c) => JSON.parse(c.args[0].input.body as string).messages[0].content)).toEqual([
      expect.stringContaining("Grant: Bus Replacement"),
    ]);
    const texts = titanCalls().map((c) => JSON.parse(c.args[0].input.body as string).inputText);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((t: string) => t.startsWith("Bus Replacement"))).toBe(true);
  });

  it("keeps the profile and vectors when only status changes", async () => {
    await builder.buildIndex();
    await builder.buildIndex();
    bedrock.resetHistory();

    rows[0].status = "archived";
    artifacts.put("Bus Replacement/summary.json", summary("Bus Replacement", "Transit agencies", { status: "archived" }));
    const result = await builder.buildIndex();

    expect(result.changed).toBe(true);
    expect(bedrock.calls()).toHaveLength(0);
    expect(liveIndex().docs[0].status).toBe("archived");
  });

  it("writes nothing when nothing changed", async () => {
    await builder.buildIndex();
    await builder.buildIndex();
    s3.resetHistory();
    bedrock.resetHistory();

    const result = await builder.buildIndex();

    expect(result.changed).toBe(false);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(bedrock.calls()).toHaveLength(0);
    expect(s3.commandCalls(GetObjectCommand).filter((c) => c.args[0].input.Key === "Bus Replacement/summary.json")).toHaveLength(0);
  });

  it("re-reads every summary on a full run but re-embeds nothing unchanged", async () => {
    await builder.buildIndex();
    await builder.buildIndex();
    bedrock.resetHistory();
    s3.resetHistory();

    const result = await builder.handler({ source: "aws.events" }, { getRemainingTimeInMillis: () => 900_000 });

    expect(result.summariesRead).toBe(2);
    expect(bedrock.calls()).toHaveLength(0);
    expect(result.changed).toBe(false);
  });

  it("drops a deleted grant and picks up a renamed one", async () => {
    await builder.buildIndex();
    rows = rows.filter((r) => r.nofo_name !== "Bus Replacement");
    rows.push({ nofo_name: "Bus Replacement 2027", agency: "FTA", category: "Transportation" });
    artifacts.objects.delete("Bus Replacement/summary.json");
    artifacts.put("Bus Replacement 2027/summary.json", summary("Bus Replacement", "Transit agencies"));

    const result = await builder.buildIndex();

    expect(result.removed).toBe(1);
    expect(liveIndex().docs.map((d: any) => d.name)).toEqual(["Bus Replacement 2027", "Rural Libraries", "Unprocessed Grant"]);
  });

  it("swaps the pointer with a conditional write and retries once when another build won", async () => {
    await builder.buildIndex();
    const before = artifacts.objects.get("_search/current.json")!.etag;
    s3.resetHistory();
    rows.push({ nofo_name: "New Grant", category: "Health" });
    let raced = false;
    s3.on(PutObjectCommand).callsFake((input) => {
      if (input.Key === "_search/current.json" && !raced) {
        raced = true;
        artifacts.put("_search/current.json", artifacts.objects.get("_search/current.json")!.body);
        throw s3Error("PreconditionFailed", 412);
      }
      return artifacts.putObject(input);
    });

    const result = await builder.handler({}, { getRemainingTimeInMillis: () => 900_000 });

    expect(pointerPuts()[0].args[0].input.IfMatch).toBe(before);
    expect(pointerPuts()).toHaveLength(2);
    expect(result.changed).toBe(true);
    expect(liveIndex().docs.map((d: any) => d.name)).toContain("New Grant");
  });

  it("keeps the last three builds", async () => {
    for (let i = 0; i < 5; i++) {
      rows.push({ nofo_name: `Grant ${i}` });
      await builder.buildIndex();
    }
    const builds = new Set([...artifacts.objects.keys()].filter((k) => k.startsWith("_search/builds/")).map((k) => k.split("/")[2]));
    expect(builds.size).toBe(3);
    expect(builds.has(pointer().buildId)).toBe(true);
  });

  it("indexes a grant whose summary is still in the legacy bucket and skips it when unchanged", async () => {
    await builder.buildIndex();
    await builder.buildIndex();
    s3.resetHistory();
    await builder.buildIndex();
    const legacyGets = s3.commandCalls(GetObjectCommand).filter((c) => c.args[0].input.Bucket === "nofos");
    expect(legacyGets.map((c) => c.args[0].input.IfNoneMatch)).toEqual([expect.stringMatching(/^"/)]);
    expect(liveState().docs["Rural Libraries"].summarySource).toBe("legacy");
  });

  it("stops writing profiles near the deadline and leaves the rest for the next run", async () => {
    await builder.buildIndex();
    bedrock.resetHistory();
    const result = await builder.buildIndex({ deadline: Date.now() + 1000 });
    expect(haikuCalls()).toHaveLength(0);
    expect(result.profilesPending).toBe(2);
  });

  it("logs and rethrows a failed build so SQS retries it", async () => {
    ddb.on(ScanCommand).rejects(new Error("scan down"));
    await expect(builder.handler({}, {})).rejects.toThrow("scan down");
    expect((console.error as any).mock.calls[0][0]).toBe("Search index build failed:");
  });
});

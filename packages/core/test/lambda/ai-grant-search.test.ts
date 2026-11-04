import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";
import { encodeIndex } from "../../lib/chatbot-api/functions/landing-page/ai-grant-search/search-core.mjs";
import { FakeBucket, fixtureIndex, s3Error, syntheticDocs, topicVector, type FixtureDoc } from "./search-index-helpers";

const TITAN_PROFILE = "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/titan-grant-search";
const MODULE = "../../lib/chatbot-api/functions/landing-page/ai-grant-search/index.mjs";

const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
const freshHandler = async () => {
  vi.resetModules();
  ({ handler } = await import(MODULE));
};

beforeAll(() => {
  vi.stubEnv("TITAN_MODEL_ID", TITAN_PROFILE);
  vi.stubEnv("FEATURE_ROLLOUT_TABLE_NAME", "rollouts");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("SEARCH_INDEX_BUCKET", "grant-artifacts");
  vi.stubEnv("ANALYTICS_TABLE_NAME", "analytics");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" }]));
});

const rollout = (mode: string, allowlisted = false) => {
  ddb.on(GetItemCommand, { TableName: "rollouts", Key: { featureKey: { S: "ai-grant-search" }, subjectKey: { S: "CONFIG" } } })
    .resolves({ Item: marshall({ featureKey: "ai-grant-search", subjectKey: "CONFIG", mode }) });
  ddb.on(GetItemCommand, { TableName: "rollouts", Key: { featureKey: { S: "ai-grant-search" }, subjectKey: { S: "USER#ana@example.org" } } })
    .resolves(allowlisted ? { Item: marshall({ featureKey: "ai-grant-search", subjectKey: "USER#ana@example.org" }) } : {});
};

let bucket: FakeBucket;
let queryAxis: number;
const metadata = (...rows: object[]) => ddb.on(ScanCommand).resolves({ Items: rows.map((r) => marshall(r)) });
const publish = (docs: FixtureDoc[], buildId = "build-1") => {
  const indexKey = `_search/builds/${buildId}/index.bin`;
  bucket.put(indexKey, fixtureIndex(docs, buildId));
  bucket.put("_search/current.json", JSON.stringify({ format: 1, buildId, indexKey, stateKey: "x", docs: docs.length }));
};

let errors: ReturnType<typeof vi.spyOn>;
let warns: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  bedrock.reset();
  ddb.reset();
  s3.reset();
  rollout("all");
  bucket = new FakeBucket();
  s3.on(GetObjectCommand).callsFake((input) => bucket.get(input));
  metadata({ nofo_name: "Bridge Repair Program", status: "active" }, { nofo_name: "Library Grants", status: "active" });
  queryAxis = 1;
  bedrock.on(InvokeModelCommand).callsFake(() => ({
    body: new TextEncoder().encode(JSON.stringify({ embedding: topicVector(queryAxis, 0.6, 99) })) as any,
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  await freshHandler();
});
afterEach(() => {
  vi.useRealTimers();
});

const search = (body: object, claims: Record<string, unknown> = { email: "Ana@Example.org", sub: "u1" }) =>
  handler({ requestContext: { authorizer: { jwt: { claims } } }, body: JSON.stringify(body) });
const names = (res: { body: string }) => JSON.parse(res.body).results.map((r: any) => r.name);

const filler = Array.from({ length: 70 }, (_, i) => ({ name: `Filler ${i}`, topic: 200 + i, body: `unrelated ${i}` }));

describe("AI grant search", () => {
  it("embeds the query through the Titan inference profile and makes no other model call", async () => {
    publish([{ name: "Bridge Repair Program", topic: 1 }]);
    await search({ query: "bridge repair" });
    const calls = bedrock.commandCalls(InvokeModelCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.modelId).toBe(TITAN_PROFILE);
    expect(JSON.parse(calls[0].args[0].input.body as string)).toEqual({ inputText: "bridge repair", dimensions: 1024, normalize: true });
  });

  it("answers in today's response shape", async () => {
    publish([{ name: "Bridge Repair Program", topic: 1, body: "repair bridges" }, { name: "Library Grants", topic: 2 }, ...filler]);
    metadata({ nofo_name: "Bridge Repair Program" }, { nofo_name: "Library Grants" }, ...filler.map((f) => ({ nofo_name: f.name })));
    await freshHandler();
    const res = await search({ query: "bridge repair" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Object.keys(body).sort()).toEqual(["query", "results", "searchTimeMs"]);
    expect(body.query).toBe("bridge repair");
    expect(body.results[0]).toEqual({ name: "Bridge Repair Program", score: expect.any(Number), source: "hybrid", reason: "Matched by keyword and meaning" });
    for (const r of body.results) expect(Object.keys(r).sort()).toEqual(["name", "reason", "score", "source"]);
  });

  it("says the index is still being built and answers from names until it exists", async () => {
    const res = await search({ query: "bridge repair" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.indexStatus).toBe("building");
    expect(body.message).toMatch(/still being set up/);
    expect(body.results.map((r: any) => r.name)).toEqual(["Bridge Repair Program"]);
    expect(body.results[0].source).toBe("name");
    expect(errors.mock.calls.some(([line]) => line === LOG_MARKERS.grantSearchFailed[0])).toBe(false);
  });

  it("logs grantSearchFailed and still answers from name matches when the index can't be read", async () => {
    s3.on(GetObjectCommand).rejects(s3Error("AccessDenied", 403));
    const res = await search({ query: "bridge repair" });
    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(["Bridge Repair Program"]);
    expect(JSON.parse(res.body).indexStatus).toBeUndefined();
    expect(errors.mock.calls.some(([line]) => line === LOG_MARKERS.grantSearchFailed[0])).toBe(true);
  });

  it("keeps the loaded index warm and swaps it when the pointer moves", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    publish([{ name: "Bridge Repair Program", topic: 1, body: "bridge" }, ...filler], "build-1");
    metadata({ nofo_name: "Bridge Repair Program" }, { nofo_name: "Bridge Inspection Fund" }, ...filler.map((f) => ({ nofo_name: f.name })));
    await freshHandler();
    await search({ query: "bridge inspection" });
    await search({ query: "bridge inspection" });
    expect(s3.commandCalls(GetObjectCommand)).toHaveLength(2);

    publish([{ name: "Bridge Repair Program", topic: 1, body: "bridge" }, { name: "Bridge Inspection Fund", topic: 1, body: "bridge inspection" }, ...filler], "build-2");
    vi.setSystemTime(Date.now() + 61_000);
    const res = await search({ query: "bridge inspection" });
    const keys = s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key);
    expect(keys.slice(2)).toEqual(["_search/current.json", "_search/builds/build-2/index.bin"]);
    expect(s3.commandCalls(GetObjectCommand)[2].args[0].input.IfNoneMatch).toMatch(/^"/);
    expect(names(res)[0]).toBe("Bridge Inspection Fund");

    vi.setSystemTime(Date.now() + 61_000);
    await search({ query: "bridge inspection" });
    expect(s3.commandCalls(GetObjectCommand)).toHaveLength(5);
  });

  it("keeps serving the loaded index when a refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    publish([{ name: "Bridge Repair Program", topic: 1, body: "bridge repair" }, ...filler]);
    metadata({ nofo_name: "Bridge Repair Program" }, ...filler.map((f) => ({ nofo_name: f.name })));
    await freshHandler();
    await search({ query: "bridge repair" });
    s3.on(GetObjectCommand).rejects(s3Error("InternalError", 500));
    vi.setSystemTime(Date.now() + 61_000);
    const res = await search({ query: "bridge repair" });
    expect(JSON.parse(res.body).results[0]).toMatchObject({ name: "Bridge Repair Program", source: "hybrid" });
    expect(warns.mock.calls.some(([line]) => String(line).startsWith("Search index refresh failed"))).toBe(true);
  });

  it("answers 401 without an email claim", async () => {
    const res = await search({ query: "bridge repair" }, { sub: "u1" });
    expect(res.statusCode).toBe(401);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("answers 403 to a user who isn't allowlisted while the rollout is allowlist-only", async () => {
    ddb.reset();
    rollout("allowlisted", false);
    expect((await search({ query: "bridge repair" })).statusCode).toBe(403);
    expect(bedrock.calls()).toHaveLength(0);
    expect(s3.calls()).toHaveLength(0);
  });

  it("lets an allowlisted user search, matching the email case-insensitively", async () => {
    ddb.reset();
    rollout("allowlisted", true);
    ddb.on(ScanCommand).resolves({ Items: [] });
    expect((await search({ query: "bridge repair" })).statusCode).toBe(200);
  });

  it("answers 403 when the feature is disabled", async () => {
    ddb.reset();
    rollout("disabled", true);
    expect((await search({ query: "bridge repair" })).statusCode).toBe(403);
  });

  it("rejects queries shorter than 3 characters", async () => {
    const res = await search({ query: " a " });
    expect(res.statusCode).toBe(400);
    expect(bedrock.calls()).toHaveLength(0);
  });

  it("drops closed grants when the query asks for open ones", async () => {
    metadata(
      { nofo_name: "Bridge Repair Program", status: "active", expiration_date: "2099-01-01" },
      { nofo_name: "Bridge Repair Legacy", status: "archived" },
    );
    await freshHandler();
    const res = await search({ query: "open bridge repair" });
    expect(names(res)).toEqual(["Bridge Repair Program"]);
  });

  it("matches names and categories past the first page of metadata, from one scan", async () => {
    const page = (start: any) =>
      start
        ? { Items: [marshall({ nofo_name: "Bridge Repair Program", status: "active", category: "Transportation" })] }
        : { Items: [marshall({ nofo_name: "Library Grants", status: "active", category: "Arts" })], LastEvaluatedKey: marshall({ nofo_name: "Library Grants" }) };
    ddb.on(ScanCommand).callsFake((input) => page(input.ExclusiveStartKey));
    await freshHandler();

    expect(names(await search({ query: "bridge repair" }))).toEqual(["Bridge Repair Program"]);
    const res = await search({ query: "transportation" });
    expect(JSON.parse(res.body).results).toEqual([
      { name: "Bridge Repair Program", score: 0.45, source: "category", reason: "In category: Transportation" },
    ]);
    expect(ddb.commandCalls(ScanCommand).map((c) => Boolean(c.args[0].input.ExclusiveStartKey))).toEqual([false, true]);
    expect(ddb.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it("matches the Other category only for the word itself", async () => {
    metadata({ nofo_name: "Misc Fund", category: "Other" }, { nofo_name: "Motherhood Health", category: "Health" });
    await freshHandler();
    expect(names(await search({ query: "other grants" }))).toEqual(["Misc Fund"]);
    expect(names(await search({ query: "mother" }))).not.toContain("Misc Fund");
  });

  it("escapes regex characters in name matching", async () => {
    expect((await search({ query: "c++ (training" })).statusCode).toBe(200);
  });

  it("records a committed search without delaying or failing it", async () => {
    ddb.on(PutItemCommand).rejects(new Error("analytics down"));
    ddb.on(UpdateItemCommand).resolves({});
    const res = await search({ query: "bridge repair", committed: true }, { email: "ana@example.org", sub: "u1", "custom:state": "ma" });
    expect(res.statusCode).toBe(200);
    expect(ddb.commandCalls(PutItemCommand)[0].args[0].input.TableName).toBe("analytics");
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(1);
  });

  describe("scoping", () => {
    const stateFixture = async () => {
      metadata(
        { nofo_name: "Bridge Repair Program" },
        { nofo_name: "Coastal Resilience MA", scope: "state", state: "MA" },
        { nofo_name: "Coastal Resilience NY", scope: "state", state: "NY" },
        { nofo_name: "Bridge Repair NY", scope: "state", state: "NY" },
        { nofo_name: "Highway Safety NY", scope: "state", state: "NY", category: "Transportation" },
        ...filler.map((f) => ({ nofo_name: f.name })),
      );
      publish([
        { name: "Bridge Repair Program", topic: 1, body: "bridge repair" },
        { name: "Coastal Resilience MA", topic: 1, scope: "state", state: "MA", body: "bridge repair coastal" },
        { name: "Coastal Resilience NY", topic: 1, scope: "state", state: "NY", body: "bridge repair coastal" },
        { name: "Orphan Grant", topic: 1, body: "bridge repair" },
        ...filler,
      ]);
      await freshHandler();
    };

    it("hides other states' grants from every layer", async () => {
      await stateFixture();
      const res = await search({ query: "bridge repair transportation" }, { email: "ana@example.org", sub: "u1", "custom:state": "MA" });
      expect(res.statusCode).toBe(200);
      expect(names(res).sort()).toEqual(["Bridge Repair Program", "Coastal Resilience MA"]);
    });

    it("treats a user with no state as federal-only", async () => {
      await stateFixture();
      expect(names(await search({ query: "bridge repair" }))).toEqual(["Bridge Repair Program"]);
    });

    it("drops a grant with no metadata row for a regular user", async () => {
      await stateFixture();
      const res = await search({ query: "bridge repair transportation" }, { email: "ana@example.org", sub: "u1", "custom:state": "NY" });
      expect(names(res)).not.toContain("Orphan Grant");
      expect(names(res)).toEqual(expect.arrayContaining(["Coastal Resilience NY", "Bridge Repair NY", "Highway Safety NY"]));
    });

    it.each([
      ["a developer", { "custom:role": '["Developer"]', "custom:state": "MA" }],
      ["a platform admin", { "custom:role": '["PlatformAdmin"]' }],
      ["a legacy stateless admin", { "custom:role": '["Admin"]' }],
    ])("shows %s every grant", async (_label, extra) => {
      await stateFixture();
      const res = await search({ query: "bridge repair transportation" }, { email: "ana@example.org", sub: "u1", ...extra });
      expect(names(res).sort()).toEqual([
        "Bridge Repair NY", "Bridge Repair Program", "Coastal Resilience MA", "Coastal Resilience NY", "Highway Safety NY", "Orphan Grant",
      ]);
    });

    it("keeps a state admin to their own state", async () => {
      await stateFixture();
      const res = await search({ query: "bridge repair" }, { email: "ana@example.org", sub: "u1", "custom:role": '["Admin"]', "custom:state": "MA" });
      expect(names(res).sort()).toEqual(["Bridge Repair Program", "Coastal Resilience MA"]);
    });

    it("boosts grants in the searcher's own state", async () => {
      await stateFixture();
      const scores = async (extra: object) =>
        Object.fromEntries(JSON.parse((await search({ query: "bridge repair" }, { email: "ana@example.org", sub: "u1", "custom:role": '["Developer"]', ...extra })).body)
          .results.map((r: any) => [r.name, r.score]));
      const [ma, none] = [await scores({ "custom:state": "MA" }), await scores({})];
      expect(ma["Coastal Resilience MA"] - none["Coastal Resilience MA"]).toBeCloseTo(0.04, 2);
      expect(ma["Coastal Resilience NY"]).toBe(none["Coastal Resilience NY"]);
    });

    it("fails the search when grant metadata can't be loaded", async () => {
      ddb.on(ScanCommand).rejects(new Error("scan down"));
      publish([{ name: "Bridge Repair Program", topic: 1 }]);
      await freshHandler();
      const res = await search({ query: "bridge repair" });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).results).toEqual([]);
    });
  });

  it("keeps a short state-name query on topic", async () => {
    queryAxis = 10;
    metadata(
      { nofo_name: "NC Housing Trust", scope: "state", state: "NC", category: "Housing" },
      { nofo_name: "HOME Investment Partnerships", category: "Housing" },
      { nofo_name: "Tribal Opioid Response", category: "Health" },
      ...filler.map((f) => ({ nofo_name: f.name })),
    );
    publish([
      { name: "NC Housing Trust", topic: 10, scope: "state", state: "NC", body: "affordable housing in North Carolina" },
      { name: "HOME Investment Partnerships", topic: 10, body: "affordable housing" },
      { name: "Tribal Opioid Response", topic: 30, body: "opioid treatment for tribes in North Carolina" },
      ...filler,
    ]);
    await freshHandler();
    const res = await search({ query: "north carolina housing" }, { email: "ana@example.org", sub: "u1", "custom:state": "NC" });
    expect(names(res)[0]).toBe("NC Housing Trust");
    expect(names(res)).not.toContain("Tribal Opioid Response");
  });
});

describe("latency on a 2,500-grant index", () => {
  it("adds little to the Titan and DynamoDB round trips, warm or cold", async () => {
    const docs = syntheticDocs(2500);
    const bytes = encodeIndex({ buildId: "bench", builtAt: "", dims: 1024, views: ["card", "detail"], docs });
    bucket.put("_search/builds/bench/index.bin", bytes);
    bucket.put("_search/current.json", JSON.stringify({ format: 1, buildId: "bench", indexKey: "_search/builds/bench/index.bin" }));
    metadata(...docs.map((d) => ({ nofo_name: d.name, category: d.category, scope: d.scope, ...(d.state && { state: d.state }), status: "active" })));
    await freshHandler();

    const queries = ["term1 term2", "term3a program", "termzz9 termab term4f term12", "massachusetts term5 grants", "open term7 term8"];
    const claims = { email: "ana@example.org", sub: "u1", "custom:state": "MA" };
    const coldStart = performance.now();
    await search({ query: queries[0] }, claims);
    const coldMs = performance.now() - coldStart;

    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      queryAxis = i;
      const t = performance.now();
      const res = await search({ query: queries[i % queries.length] }, claims);
      times.push(performance.now() - t);
      expect(res.statusCode).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p50 = times[25];
    const p90 = times[45];
    process.stdout.write(`${JSON.stringify({ bench: "ai-grant-search-handler-2500", indexMb: Math.round(bytes.length / 1e4) / 100, coldMs: Math.round(coldMs), p50Ms: Math.round(p50 * 10) / 10, p90Ms: Math.round(p90 * 10) / 10 })}\n`);
    expect(coldMs).toBeLessThan(1500);
    expect(p50).toBeLessThan(100);
    expect(p90).toBeLessThan(200);
  });
});

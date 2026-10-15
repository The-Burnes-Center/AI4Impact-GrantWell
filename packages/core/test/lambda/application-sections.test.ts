import { readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeApplicationSections,
  orderedSections,
  sectionSlug,
  withSectionIds,
} from "grantwell-shared";

const kb = mockClient(BedrockAgentRuntimeClient);
const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);
const sfn = mockClient(SFNClient);
const lambda = mockClient(LambdaClient);

const fixture = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/section-ids.json"), "utf8"));

type Handler = (event: any) => Promise<any>;
let start: Handler;
let prepare: Handler;
let generateSection: Handler;
let assemble: Handler;
let summaryUpdate: Handler;
let retrieveSummary: Handler;

beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("KB_ID", "kb-1");
  vi.stubEnv("BUCKET", "nofos");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofo-metadata");
  vi.stubEnv("DRAFT_GENERATION_JOBS_TABLE_NAME", "jobs");
  vi.stubEnv("DRAFT_TABLE_NAME", "drafts");
  vi.stubEnv("DRAFT_GENERATION_STATE_MACHINE_ARN", "arn:aws:states:us-east-1:111111111111:stateMachine:draft");
  vi.stubEnv("SONNET_MODEL_ID", "model-1");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }]));
  const fn = "../../lib/chatbot-api/functions";
  ({ handler: start } = await import("../../lib/chatbot-api/gateway/api-routes/draft-generation/index.mjs"));
  ({ handler: prepare } = await import(`${fn}/draft-pipeline/prepare/index.mjs`));
  ({ handler: generateSection } = await import(`${fn}/draft-pipeline/generate-section/index.mjs`));
  ({ handler: assemble } = await import(`${fn}/draft-pipeline/assemble/index.mjs`));
  ({ handler: summaryUpdate } = await import(`${fn}/landing-page/nofo-summary-update/index.mjs`));
  ({ handler: retrieveSummary } = await import(`${fn}/landing-page/retrieveNOFOSummary/index.mjs`));
});

beforeEach(() => {
  for (const m of [kb, bedrock, ddb, s3, sfn, lambda]) m.reset();
  ddb.on(GetItemCommand).resolves({});
  ddb.on(PutItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  sfn.on(StartExecutionCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  kb.on(RetrieveCommand).resolves({ retrievalResults: [] });
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});

const summaryBody = (summary: object) => ({ Body: { transformToString: async () => JSON.stringify(summary) } }) as any;

describe("section ids", () => {
  it("slug the same way as the Python and UI copies", () => {
    for (const [name, slug] of fixture.slugs) expect(sectionSlug(name)).toBe(slug);
  });

  it("keep stored ids, and give duplicates and new rows their own", () => {
    expect(withSectionIds(fixture.withIds.input).map((s: { id: string }) => s.id)).toEqual(fixture.withIds.ids);
  });

  it("map an application keyed by name onto the grant's ids, keeping sections the grant no longer lists", () => {
    const outline = [
      { id: "need", name: "Statement of Need" },
      { id: "budget", name: "Budget" },
    ];
    expect(normalizeApplicationSections({ "Statement of Need": "A", "Old section": "B" }, undefined, outline)).toEqual({
      sections: { need: "A", "old-section": "B" },
      order: [...outline, { id: "old-section", name: "Old section" }],
    });
  });

  it("leave an application keyed by id alone, using the grant's current names and order", () => {
    const stored = [
      { id: "custom-annex", name: "Annex" },
      { id: "need", name: "Need (old name)" },
    ];
    expect(normalizeApplicationSections({ need: "A" }, stored, [{ id: "need", name: "Statement of Need" }])).toEqual({
      sections: { need: "A" },
      order: [{ id: "need", name: "Statement of Need" }, { id: "custom-annex", name: "Annex" }],
    });
  });

  it("export in the application's order with its headings, falling back to the map for older clients", () => {
    const sections = { "1": "One", b: "Bee", a: "Ay" };
    expect(
      orderedSections({ sections, sectionOrder: [{ id: "a", name: "First" }, { id: "b", name: "Second" }] })
    ).toEqual([
      { name: "First", content: "Ay" },
      { name: "Second", content: "Bee" },
      { name: "1", content: "One" },
    ]);
    expect(orderedSections({ sections: { Need: "N" } })).toEqual([{ name: "Need", content: "N" }]);
  });
});

describe("preparing a run", () => {
  const summary = {
    ProjectNarrativeSections: [
      { item: "Need", description: "Describe the need." },
      { item: "Budget", description: "Explain costs.", id: "budget-narrative" },
      { item: "Need", description: "A second need." },
    ],
  };
  const run = (fields: object = {}) =>
    prepare({ jobId: "job-1", query: "q", documentIdentifier: "Grant A/", sessionId: "s1", userId: "user-1", ...fields });

  beforeEach(() => {
    s3.on(GetObjectCommand).resolves(summaryBody(summary));
  });

  it("gives every section an id and the whole outline", async () => {
    const out = await run();
    expect(out.sections.map((s: any) => [s.id, s.index])).toEqual([["need", 0], ["budget-narrative", 1], ["need-2", 2]]);
    expect(out.outline).toEqual([
      { id: "need", name: "Need" },
      { id: "budget-narrative", name: "Budget" },
      { id: "need-2", name: "Need" },
    ]);
    const meta = unmarshall(ddb.commandCalls(UpdateItemCommand)[0].args[0].input.ExpressionAttributeValues as any);
    expect(meta[":si"]).toEqual(["need", "budget-narrative", "need-2"]);
  });

  it("writes only the requested sections on a retry, with the whole outline for context", async () => {
    const out = await run({ sectionIds: ["need-2"] });
    expect(out.sections.map((s: any) => s.id)).toEqual(["need-2"]);
    expect(out.totalSections).toBe(1);
    expect(out.sectionNames).toEqual(["Need", "Budget", "Need"]);
  });

  it("refuses a retry that names no section of the grant", async () => {
    await expect(run({ sectionIds: ["gone"] })).rejects.toThrow(/None of the requested sections/);
  });
});

describe("starting a retry", () => {
  it("passes the named sections to the pipeline", async () => {
    ddb.on(GetItemCommand, { TableName: "nofo-metadata" }).resolves({
      Item: { nofo_name: { S: "Grant A" }, scope: { S: "federal" } },
    });
    const res = await start({
      requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "user-1" } } } },
      body: JSON.stringify({ query: "q", documentIdentifier: "Grant A", sessionId: "s1", sectionIds: ["need", 7, ""] }),
    });
    expect(res.statusCode).toBe(200);
    const input = JSON.parse(sfn.commandCalls(StartExecutionCommand)[0].args[0].input.input as string);
    expect(input.sectionIds).toEqual(["need"]);
  });
});

describe("writing a section", () => {
  it("stores the text under the section's id", async () => {
    bedrock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(
        JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ content: "Text." }) }] })
      ),
    } as any);
    const out = await generateSection({
      sectionItem: { id: "need-2", item: "Need", description: "d", index: 2 },
      jobId: "job-1",
      totalSections: 3,
      sectionNames: ["Need", "Budget", "Need"],
    });
    expect(out).toEqual({ sectionId: "need-2", sectionName: "Need", status: "completed" });
    const input = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(input.ExpressionAttributeNames?.["#sectionId"]).toBe("need-2");
  });
});

describe("assembling a run", () => {
  const outline = [
    { id: "need", name: "Statement of Need" },
    { id: "budget", name: "Budget" },
  ];
  const STARTED = "2026-10-15T12:00:00.000Z";

  const given = (draft: Record<string, unknown> | null, jobSections = { need: "AI need", budget: "AI budget" }) => {
    ddb.on(GetItemCommand, { TableName: "jobs" }).resolves({ Item: marshall({ sections: jobSections, createdAt: STARTED }) });
    ddb.on(GetItemCommand, { TableName: "drafts" }).resolves(draft ? { Item: marshall(draft) } : {});
  };

  const run = () =>
    assemble({
      jobId: "job-1",
      sessionId: "s1",
      userId: "user-1",
      outline,
      totalSections: 2,
      sectionResults: [
        { sectionId: "need", sectionName: "Statement of Need", status: "completed" },
        { sectionId: "budget", sectionName: "Budget", status: "completed" },
      ],
    });

  const draftWrites = () =>
    ddb
      .commandCalls(UpdateItemCommand)
      .filter((c) => c.args[0].input.TableName === "drafts")
      .map((c) => ({
        input: c.args[0].input,
        values: unmarshall(c.args[0].input.ExpressionAttributeValues as any),
      }));

  it("writes the draft before marking the job done, keyed by id in the grant's order", async () => {
    given({ rev: 3, sections: {}, section_order: [] });
    const out = await run();
    expect(out.status).toBe("completed");
    const tables = ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input.TableName);
    expect(tables).toEqual(["drafts", "jobs"]);
    const [write] = draftWrites();
    expect(write.values[":sections"]).toEqual({ need: "AI need", budget: "AI budget" });
    expect(write.values[":order"]).toEqual(outline);
    expect(write.input.ConditionExpression).toBe("#rev = :readRev");
    expect(write.values[":readRev"]).toBe(3);
  });

  it("converts an application keyed by name", async () => {
    given({ rev: 2, sections: { "Statement of Need": "", "My notes": "Keep me" } });
    await run();
    const [write] = draftWrites();
    expect(write.values[":sections"]).toEqual({ need: "AI need", budget: "AI budget", "my-notes": "Keep me" });
    expect(write.values[":order"]).toEqual([...outline, { id: "my-notes", name: "My notes" }]);
  });

  it("keeps text the user saved after the run started", async () => {
    given({
      rev: 4,
      sections: { need: "My own need", budget: "Old budget" },
      section_order: outline,
      section_saved_at: { need: "2026-10-15T12:00:05.123456+00:00", budget: "2026-10-15T11:59:00.000000+00:00" },
    });
    await run();
    const [write] = draftWrites();
    expect(write.values[":sections"]).toEqual({ need: "My own need", budget: "AI budget" });
  });

  it("re-reads and merges again when the draft changed underneath it", async () => {
    let reads = 0;
    ddb.on(GetItemCommand, { TableName: "jobs" }).resolves({ Item: marshall({ sections: { need: "AI need" }, createdAt: STARTED }) });
    ddb.on(GetItemCommand, { TableName: "drafts" }).callsFake(() => {
      reads += 1;
      return reads === 1
        ? { Item: marshall({ rev: 1, sections: {}, section_order: outline }) }
        : {
            Item: marshall({
              rev: 2,
              sections: { need: "Typed in another tab" },
              section_order: outline,
              section_saved_at: { need: "2026-10-15T12:01:00Z" },
            }),
          };
    });
    ddb.on(UpdateItemCommand, { TableName: "drafts" })
      .rejectsOnce(Object.assign(new Error("changed"), { name: "ConditionalCheckFailedException" }))
      .resolves({});

    await assemble({
      jobId: "job-1",
      sessionId: "s1",
      userId: "user-1",
      outline,
      sectionResults: [{ sectionId: "need", sectionName: "Statement of Need", status: "completed" }],
    });

    const writes = draftWrites();
    expect(writes).toHaveLength(2);
    expect(writes[1].values[":sections"]).toEqual({ need: "Typed in another tab" });
    expect(writes[1].values[":readRev"]).toBe(2);
  });

  it("reads results from a run started before section ids", async () => {
    given({ rev: 1, sections: {}, section_order: [] }, { "Statement of Need": "Old-style" } as any);
    const out = await assemble({
      jobId: "job-1",
      sessionId: "s1",
      userId: "user-1",
      outline,
      sectionResults: [{ sectionName: "Statement of Need", status: "completed" }],
    });
    expect(out.sectionsGenerated).toBe(1);
  });
});

describe("grant summaries", () => {
  const adminEvent = (summary: object) => ({
    requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { "custom:role": '["Developer"]' } } } },
    body: JSON.stringify({ nofoName: "Grant A", summary }),
  });

  it("are read with an id on every narrative section", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: Readable.from([Buffer.from(JSON.stringify({ ProjectNarrativeSections: [{ item: "Work Plan", description: "d" }] }))]),
    } as any);
    ddb.on(GetItemCommand, { TableName: "nofo-metadata" }).resolves({ Item: marshall({ nofo_name: "Grant A", scope: "federal" }) });
    const res = await retrieveSummary({
      queryStringParameters: { documentKey: "Grant A" },
      requestContext: { authorizer: { jwt: { claims: { sub: "user-1" } } } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.ProjectNarrativeSections[0].id).toBe("work-plan");
  });

  it("keep a section's id through an admin rename and give new rows one", async () => {
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Grant A", scope: "federal" }) });
    s3.on(GetObjectCommand).callsFake(() => ({
      Body: Readable.from([Buffer.from(JSON.stringify({ ProjectNarrativeSections: [{ item: "Work Plan", description: "d" }] }))]),
    }));
    s3.on(PutObjectCommand).resolves({});

    const res = await summaryUpdate(
      adminEvent({
        ProjectNarrativeSections: [
          { item: "Project Work Plan", description: "d", id: "work-plan" },
          { item: "Evaluation", description: "e" },
        ],
      })
    );

    expect(res.statusCode).toBe(200);
    const written = JSON.parse(s3.commandCalls(PutObjectCommand)[0].args[0].input.Body as string);
    expect(written.ProjectNarrativeSections.map((s: any) => s.id)).toEqual(["work-plan", "evaluation"]);
  });
});

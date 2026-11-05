import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Lambda runtime provides lib-storage and this package doesn't install it; small uploads are one PUT.
vi.mock("@aws-sdk/lib-storage", async () => {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  return {
    Upload: class {
      constructor(private readonly options: { client: S3Client; params: any }) {}
      done() {
        return this.options.client.send(new PutObjectCommand(this.options.params));
      }
    },
  };
});

vi.mock("../../lib/chatbot-api/functions/nofo-pipeline/shared/questions.mjs", () => ({
  hasQuestions: (q: any) => Array.isArray(q?.questions) && q.questions.length > 0,
  documentSampleOf: (text: string) => text ?? "",
  generateQuestions: async () => ({ questions: [{ id: 1, question: "How will you serve the area?" }] }),
  generateQuestionsWithRetry: async () => ({ questions: [{ id: 1, question: "How will you serve the area?" }] }),
}));

const s3 = mockClient(S3Client);
const ddb = mockClient(DynamoDBClient);
const bedrock = mockClient(BedrockRuntimeClient);
const lambda = mockClient(LambdaClient);

const GRANTS = "nofos";
const ARTIFACTS = "grant-artifacts";
const ENV = {
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "example",
  BUCKET: GRANTS,
  ARTIFACTS_BUCKET: ARTIFACTS,
  NOFO_METADATA_TABLE_NAME: "nofo-meta",
  REVIEW_TABLE_NAME: "reviews",
  PUBLISH_FUNCTION_NAME: "publish-fn",
};
const fns = "../../lib/chatbot-api/functions";

/** A versioned two-bucket S3 that keeps every version, as GrantWell's buckets do. */
type Version = { versionId: string; body: Buffer | null; etag: string | null; contentType?: string; metadata?: Record<string, string> };
let objects: Map<string, Version[]>;
let versionCounter: number;
let log: string[];
let failRestores: boolean;

const id = (bucket: string, key: string) => `${bucket}/${key}`;
const md5 = (body: Buffer) => createHash("md5").update(body).digest("hex");
const current = (bucket: string, key: string) => {
  const v = objects.get(id(bucket, key))?.at(-1);
  return v && v.body ? v : null;
};
function write(bucket: string, key: string, body: Buffer | null, contentType?: string, metadata?: Record<string, string>) {
  const version: Version = { versionId: `v${++versionCounter}`, body, etag: body ? md5(body) : null, contentType, metadata };
  objects.set(id(bucket, key), [...(objects.get(id(bucket, key)) ?? []), version]);
  return version;
}
const put = (bucket: string, key: string, text: string, metadata?: Record<string, string>) => write(bucket, key, Buffer.from(text), undefined, metadata);
const text = (bucket: string, key: string) => current(bucket, key)?.body?.toString() ?? null;
const keysUnder = (bucket: string, prefix: string) =>
  [...objects.keys()]
    .filter((k) => k.startsWith(`${bucket}/${prefix}`) && current(bucket, k.slice(bucket.length + 1)))
    .map((k) => k.slice(bucket.length + 1))
    .sort();
const notFound = () => Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
const noSuchKey = () => Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
const asBuffer = (body: unknown) => (typeof body === "string" ? Buffer.from(body) : Buffer.from(body as Uint8Array));

function serveS3() {
  s3.on(HeadObjectCommand).callsFake(({ Bucket, Key }) => {
    const v = current(Bucket, Key);
    if (!v) throw notFound();
    return { VersionId: v.versionId, ETag: `"${v.etag}"`, Metadata: v.metadata ?? {} };
  });
  s3.on(GetObjectCommand).callsFake(({ Bucket, Key, VersionId }) => {
    const v = VersionId ? objects.get(id(Bucket, Key))?.find((x) => x.versionId === VersionId) : current(Bucket, Key);
    if (!v) throw noSuchKey();
    const body = Object.assign(Readable.from([v.body!]), { transformToString: async () => v.body!.toString() });
    return { Body: body, ETag: `"${v.etag}"` };
  });
  s3.on(PutObjectCommand).callsFake(({ Bucket, Key, Body, ContentType, Metadata }) => {
    log.push(`put ${Bucket}/${Key}`);
    const v = write(Bucket, Key, asBuffer(Body), ContentType, Metadata);
    return { VersionId: v.versionId, ETag: `"${v.etag}"` };
  });
  s3.on(CopyObjectCommand).callsFake(({ Bucket, Key, CopySource }) => {
    const [path, versionId] = String(CopySource).split("?versionId=");
    const [fromBucket, ...rest] = path.split("/").map(decodeURIComponent);
    const fromKey = rest.join("/");
    if (versionId && failRestores) throw new Error("restore failed");
    const source = versionId
      ? objects.get(id(fromBucket, fromKey))?.find((v) => v.versionId === decodeURIComponent(versionId))
      : current(fromBucket, fromKey);
    if (!source?.body) throw noSuchKey();
    log.push(`copy ${fromBucket}/${fromKey} -> ${Bucket}/${Key}`);
    const v = write(Bucket, Key, source.body, source.contentType, source.metadata);
    return { VersionId: v.versionId, CopyObjectResult: { ETag: `"${v.etag}"` } };
  });
  s3.on(DeleteObjectCommand).callsFake(({ Bucket, Key }) => {
    log.push(`delete ${Bucket}/${Key}`);
    if (current(Bucket, Key)) write(Bucket, Key, null);
    return {};
  });
  s3.on(DeleteObjectsCommand).callsFake(({ Bucket, Delete }) => {
    for (const { Key } of Delete!.Objects!) {
      log.push(`delete ${Bucket}/${Key}`);
      if (current(Bucket, Key!)) write(Bucket, Key!, null);
    }
    return {};
  });
  s3.on(ListObjectsV2Command).callsFake(({ Bucket, Prefix }) => ({
    Contents: keysUnder(Bucket, Prefix ?? "").map((Key) => ({ Key })),
  }));
}

let metaRow: Record<string, any> | null;
let reviews: Record<string, any>[];
const metaUpdates = () =>
  ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input).filter((u) => u.TableName === ENV.NOFO_METADATA_TABLE_NAME);

function serveDynamo() {
  ddb.on(GetItemCommand).callsFake(({ TableName, Key }) => {
    const key = unmarshall(Key);
    if (TableName === ENV.REVIEW_TABLE_NAME) {
      const r = reviews.find((x) => x.nofo_name === key.nofo_name && x.review_id === key.review_id);
      return r ? { Item: marshall(r) } : {};
    }
    return metaRow && key.nofo_name === metaRow.nofo_name ? { Item: marshall(metaRow, { removeUndefinedValues: true }) } : {};
  });
  ddb.on(QueryCommand).callsFake(({ ExpressionAttributeValues }) => {
    const name = unmarshall(ExpressionAttributeValues)[":name"];
    return { Items: reviews.filter((r) => r.nofo_name === name).map((r) => marshall(r)) };
  });
  ddb.on(UpdateItemCommand).callsFake((input) => {
    if (String(input.UpdateExpression).startsWith("ADD swap_document_etags")) log.push("record etag");
    return {};
  });
}

async function load(path: string, env: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ...ENV, ...env })) vi.stubEnv(k, v);
  vi.resetModules();
  return import(`${fns}/${path}`);
}

const STAGED = "_pending/Grant/NOFO-File-PDF";
const SUMMARY = { GrantName: "Grant", EligibilityCriteria: [{ item: "Towns", description: "Towns may apply." }] };
const QUESTIONS = { questions: [{ id: 1, question: "How will you serve the area?" }] };

/** A live grant published from a TXT, with a new PDF version staged by its run. */
function liveGrantWithStagedVersion() {
  put(GRANTS, "Grant/NOFO-File-TXT", "old document");
  put(GRANTS, "Grant/NOFO-File-TXT.metadata.json", "{}");
  put(ARTIFACTS, "Grant/raw-text.txt", "old text");
  put(ARTIFACTS, "Grant/summary.json", "old summary");
  put(ARTIFACTS, "Grant/questions.json", "old questions");
  put(ARTIFACTS, "Grant/requirements-citations.json", JSON.stringify({ items: {} }));
  put(ARTIFACTS, STAGED, "new document");
  put(ARTIFACTS, "_pending/Grant/raw-text.txt", "new text");
  put(ARTIFACTS, "_pending/Grant/raw-text-pages.json", "[0]");
  put(ARTIFACTS, "_pending/Grant/requirements-citations.json", JSON.stringify({ items: { a: 1 } }));
}
const published = () => ({
  document: { pdf: text(GRANTS, "Grant/NOFO-File-PDF"), txt: text(GRANTS, "Grant/NOFO-File-TXT") },
  sidecars: keysUnder(GRANTS, "Grant/").filter((k) => k.endsWith(".metadata.json")),
  rawText: text(ARTIFACTS, "Grant/raw-text.txt"),
  pageMap: text(ARTIFACTS, "Grant/raw-text-pages.json"),
  summary: text(ARTIFACTS, "Grant/summary.json"),
});
const BEFORE = {
  document: { pdf: null, txt: "old document" },
  sidecars: ["Grant/NOFO-File-TXT.metadata.json"],
  rawText: "old text",
  pageMap: null,
  summary: "old summary",
};

const publishEvent = (extra: Record<string, unknown> = {}) => ({
  s3Bucket: ARTIFACTS,
  documentKey: STAGED,
  nofoName: "Grant",
  mergedSummary: SUMMARY,
  questionsData: QUESTIONS,
  applicationDeadline: null,
  existingExpirationDate: "2027-01-15",
  ...extra,
});

beforeEach(() => {
  objects = new Map();
  versionCounter = 0;
  log = [];
  failRestores = false;
  metaRow = { nofo_name: "Grant", status: "active", expiration_date: "2027-01-15", scope: "federal" };
  reviews = [];
  for (const m of [s3, ddb, bedrock, lambda]) m.reset();
  serveS3();
  serveDynamo();
  lambda.on(InvokeCommand).resolves({});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T15:00:00.000Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe("a live grant's new version while it is staged", () => {
  it("extracts its text beside the staged document and leaves the published text alone", async () => {
    liveGrantWithStagedVersion();
    put(ARTIFACTS, "_pending/Grant/NOFO-File-TXT", "This grant program offers funding to each eligible applicant. ".repeat(20));
    const { handler } = await load("nofo-pipeline/extract-text/index.mjs");

    const out = await handler({ s3Bucket: ARTIFACTS, documentKey: "_pending/Grant/NOFO-File-TXT", nofoName: "Grant" });

    expect(out.rawTextKey).toBe("_pending/Grant/raw-text.txt");
    expect(text(ARTIFACTS, "_pending/Grant/raw-text.txt")).toContain("This grant program");
    expect(published()).toEqual(BEFORE);
    expect(log.filter((l) => l.includes(`${ARTIFACTS}/Grant/`) || l.includes(`${GRANTS}/`))).toEqual([]);
  });

  it("is uploaded to _pending/ by an admin re-upload, with no sidecar beside the published document", async () => {
    ddb.on(UpdateItemCommand).resolves({ Attributes: marshall({ nofo_name: "Grant", status: "active" }) });
    const { handler } = await load("landing-page/upload-nofos/index.mjs");

    const res = await handler({
      requestContext: { authorizer: { jwt: { claims: { "custom:role": '["Developer"]' } } } },
      body: JSON.stringify({ fileName: "Grant/NOFO-File-PDF", fileType: "application/pdf", scope: "federal" }),
    });

    const url = new URL(JSON.parse(res.body).signedUrl);
    expect(url.hostname.startsWith(`${ARTIFACTS}.`)).toBe(true);
    expect(decodeURIComponent(url.pathname)).toBe(`/${STAGED}`);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("is uploaded in place, with its sidecar, for a grant that was never published", async () => {
    ddb.on(UpdateItemCommand).resolves({ Attributes: marshall({ nofo_name: "Grant", status: "quarantined" }) });
    const { handler } = await load("landing-page/upload-nofos/index.mjs");

    const res = await handler({
      requestContext: { authorizer: { jwt: { claims: { "custom:role": '["Developer"]' } } } },
      body: JSON.stringify({ fileName: "Grant/NOFO-File-PDF", fileType: "application/pdf", scope: "federal" }),
    });

    const url = new URL(JSON.parse(res.body).signedUrl);
    expect(url.hostname.startsWith(`${GRANTS}.`)).toBe(true);
    expect(s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key)).toEqual(["Grant/NOFO-File-PDF.metadata.json"]);
  });

  it("is uploaded to _pending/ from the review's re-upload", async () => {
    const { handler } = await load("nofo-pipeline/admin/index.mjs");

    const res = await handler({
      requestContext: { http: { method: "POST", path: "/admin/reupload-nofo" }, authorizer: { jwt: { claims: { "custom:role": '["Developer"]' } } } },
      body: JSON.stringify({ nofoName: "Grant", fileType: "application/pdf" }),
    });

    const body = JSON.parse(res.body);
    expect(body.objectKey).toBe(STAGED);
    expect(new URL(body.signedUrl).hostname.startsWith(`${ARTIFACTS}.`)).toBe(true);
  });

  it("is what Reprocess runs, rather than the published document", async () => {
    liveGrantWithStagedVersion();
    const sqs = mockClient((await import("@aws-sdk/client-sqs")).SQSClient);
    sqs.onAnyCommand().resolves({});
    const { handler } = await load("nofo-pipeline/reprocess/index.mjs");
    vi.stubEnv("QUEUE_URL", "https://sqs/queue");

    const res = await handler({
      requestContext: { authorizer: { jwt: { claims: { "custom:role": '["Developer"]' } } } },
      body: JSON.stringify({ nofoName: "Grant" }),
    });

    expect(JSON.parse(res.body).documentKey).toBe(STAGED);
    const sent = JSON.parse(sqs.calls()[0].args[0].input.MessageBody);
    expect(sent.Records[0].s3).toEqual({ bucket: { name: ARTIFACTS }, object: { key: STAGED } });
    sqs.restore();
  });
});

describe("an upload over a grant that already exists", () => {
  const STATES = { SUPPORTED_STATES: JSON.stringify([{ code: "MA", name: "Massachusetts" }, { code: "NY", name: "New York" }]) };
  const as = (claims: Record<string, string>) => ({ requestContext: { authorizer: { jwt: { claims } } } });
  const maAdmin = as({ "custom:role": '["Admin"]', "custom:state": "MA" });
  const upload = async (caller: object, body: Record<string, string>, env: Record<string, string> = {}) => {
    const { handler } = await load("landing-page/upload-nofos/index.mjs", { ...STATES, ...env });
    return handler({ ...caller, body: JSON.stringify({ fileName: "Grant/NOFO-File-PDF", fileType: "application/pdf", ...body }) });
  };
  const asMa = { scope: "state", state: "MA" };

  it("refuses a state admin who claims a federal or another state's grant, changing nothing", async () => {
    for (const row of [{ scope: "federal" }, { scope: "state", state: "NY" }, {}]) {
      metaRow = { nofo_name: "Grant", status: "active", ...row };
      const res = await upload(maAdmin, asMa);
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body)).not.toHaveProperty("signedUrl");
    }
    expect(metaUpdates()).toHaveLength(0);
  });

  it("lets a state admin upload their own state's grant, new or existing, only where the row still matches", async () => {
    metaRow = { nofo_name: "Grant", status: "active", scope: "state", state: "MA" };
    expect((await upload(maAdmin, asMa)).statusCode).toBe(200);
    metaRow = null;
    expect((await upload(maAdmin, asMa)).statusCode).toBe(200);
    for (const update of metaUpdates()) {
      expect(update.ConditionExpression).toBe("attribute_not_exists(nofo_name) OR (#scope = :scope AND #state = :state)");
    }
    expect(metaUpdates()).toHaveLength(2);
  });

  it("refuses when the row changed between the check and the write", async () => {
    metaRow = null;
    ddb.on(UpdateItemCommand).rejects(new ConditionalCheckFailedException({ message: "failed", $metadata: {} }));
    const res = await upload(maAdmin, asMa);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).not.toHaveProperty("signedUrl");
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("keeps a single-state site's admin to the grant's own scope too", async () => {
    metaRow = { nofo_name: "Grant", status: "active", scope: "federal", state: null };
    const res = await upload(maAdmin, { scope: "federal" }, { SINGLE_STATE: "MA" });
    expect(res.statusCode).toBe(200);
    expect(metaUpdates()[0].ConditionExpression).toBe(
      "attribute_not_exists(nofo_name) OR (#scope = :scope AND (attribute_not_exists(#state) OR attribute_type(#state, :nullType)))"
    );
  });

  it("still lets a Developer or platform admin move a grant to another scope", async () => {
    metaRow = { nofo_name: "Grant", status: "active", scope: "federal" };
    for (const role of ["Developer", "PlatformAdmin"]) {
      expect((await upload(as({ "custom:role": JSON.stringify([role]) }), asMa)).statusCode).toBe(200);
    }
    expect(metaUpdates().map((u) => u.ConditionExpression)).toEqual([undefined, undefined]);
  });
});

describe("publishing a staged version", () => {
  it("swaps the document and every derived file in, then clears _pending/", async () => {
    liveGrantWithStagedVersion();
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await handler(publishEvent());

    expect(published()).toEqual({
      document: { pdf: "new document", txt: null },
      sidecars: ["Grant/NOFO-File-PDF.metadata.json"],
      rawText: "new text",
      pageMap: "[0]",
      summary: expect.stringContaining('"Towns"'),
    });
    expect(text(ARTIFACTS, "Grant/requirements-citations.json")).toBe(JSON.stringify({ items: { a: 1 } }));
    expect(keysUnder(ARTIFACTS, "_pending/")).toEqual([]);
    expect(metaUpdates().some((u) => String(u.UpdateExpression).includes("#status = :status"))).toBe(true);
  });

  it("saves the published versions before replacing anything, and records the document's ETag before copying it", async () => {
    liveGrantWithStagedVersion();
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await handler(publishEvent());

    const journal = log.indexOf(`put ${ARTIFACTS}/_pending/Grant/swap.json`);
    const recorded = log.indexOf("record etag");
    const swapped = log.indexOf(`copy ${ARTIFACTS}/${STAGED} -> ${GRANTS}/Grant/NOFO-File-PDF`);
    const firstWrite = log.findIndex((l) => l.includes(`${GRANTS}/Grant/`) || l.includes(`${ARTIFACTS}/Grant/`));
    expect(journal).toBeGreaterThanOrEqual(0);
    expect(journal).toBeLessThan(firstWrite);
    expect(recorded).toBeLessThan(swapped);
    const etag = metaUpdates().find((u) => String(u.UpdateExpression).startsWith("ADD swap_document_etags"))!;
    expect(etag.ExpressionAttributeValues).toEqual({ ":etags": { SS: [md5(Buffer.from("new document"))] } });
  });

  it("puts every published file back when the publish fails partway, and keeps the staged version to retry", async () => {
    liveGrantWithStagedVersion();
    ddb.on(UpdateItemCommand, { TableName: ENV.NOFO_METADATA_TABLE_NAME }).callsFake((input) => {
      if (String(input.UpdateExpression).includes("#status = :status")) throw new Error("throttled");
      return {};
    });
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await expect(handler(publishEvent())).rejects.toThrow("throttled");

    expect(published()).toEqual(BEFORE);
    expect(text(ARTIFACTS, "Grant/requirements-citations.json")).toBe(JSON.stringify({ items: {} }));
    expect(text(ARTIFACTS, "Grant/questions.json")).toBe("old questions");
    expect(text(ARTIFACTS, "_pending/Grant/swap.json")).toBeNull();
    expect(text(ARTIFACTS, STAGED)).toBe("new document");
    const restoredEtags = metaUpdates()
      .filter((u) => String(u.UpdateExpression).startsWith("ADD swap_document_etags"))
      .map((u) => u.ExpressionAttributeValues![":etags"].SS);
    expect(restoredEtags.at(-1)).toEqual([md5(Buffer.from("old document"))]);
  });

  it("refuses, changing nothing, when the staged version is gone", async () => {
    liveGrantWithStagedVersion();
    for (const key of keysUnder(ARTIFACTS, "_pending/")) write(ARTIFACTS, key, null);
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await expect(handler(publishEvent())).rejects.toThrow(/no longer staged/);

    expect(published()).toEqual(BEFORE);
  });
});

describe("a newer upload while a staged version is processing", () => {
  /** The run started for the first upload (`older`); then the admin uploaded again. */
  function replacedWhileProcessing() {
    liveGrantWithStagedVersion();
    const older = current(ARTIFACTS, STAGED)!.versionId;
    for (const name of ["raw-text.txt", "raw-text-pages.json", "requirements-citations.json"]) {
      put(ARTIFACTS, `_pending/Grant/${name}`, text(ARTIFACTS, `_pending/Grant/${name}`)!, { "source-version": older });
    }
    const newer = put(ARTIFACTS, STAGED, "newest document").versionId;
    return { older, newer };
  }

  it("refuses to swap in the older run's version, changing nothing", async () => {
    const { older } = replacedWhileProcessing();
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await expect(handler(publishEvent({ documentVersionId: older }))).rejects.toThrow(/newer document for "Grant" was uploaded/);

    expect(published()).toEqual(BEFORE);
    expect(text(ARTIFACTS, "_pending/Grant/swap.json")).toBeNull();
    expect(text(ARTIFACTS, STAGED)).toBe("newest document");
    expect(log.filter((l) => !l.startsWith("put") || !l.includes("_pending/"))).toEqual([]);
  });

  it("refuses a newer run's version whose text a stopped older run overwrote", async () => {
    const { older, newer } = replacedWhileProcessing();
    put(ARTIFACTS, "_pending/Grant/raw-text.txt", "newest text", { "source-version": newer });
    put(ARTIFACTS, "_pending/Grant/raw-text-pages.json", "[0]", { "source-version": newer });
    put(ARTIFACTS, "_pending/Grant/requirements-citations.json", "{}", { "source-version": older });
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await expect(handler(publishEvent({ documentVersionId: newer }))).rejects.toThrow(/newer document/);

    expect(published()).toEqual(BEFORE);
  });

  it("swaps in exactly the version the newest run processed", async () => {
    const { newer } = replacedWhileProcessing();
    for (const name of ["raw-text.txt", "raw-text-pages.json", "requirements-citations.json"]) {
      put(ARTIFACTS, `_pending/Grant/${name}`, `newest ${name}`, { "source-version": newer });
    }
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await handler(publishEvent({ documentVersionId: newer }));

    expect(published()).toMatchObject({ document: { pdf: "newest document", txt: null }, rawText: "newest raw-text.txt" });
  });

  it("extracts the exact version its run was started for, and stamps that version on what it writes", async () => {
    put(ARTIFACTS, "_pending/Grant/NOFO-File-TXT", "This grant program offers funding to each eligible applicant. ".repeat(20));
    const first = current(ARTIFACTS, "_pending/Grant/NOFO-File-TXT")!.versionId;
    put(ARTIFACTS, "_pending/Grant/NOFO-File-TXT", "A newer upload.");
    const { handler } = await load("nofo-pipeline/extract-text/index.mjs");

    await handler({ s3Bucket: ARTIFACTS, documentKey: "_pending/Grant/NOFO-File-TXT", documentVersionId: first, nofoName: "Grant" });

    const raw = current(ARTIFACTS, "_pending/Grant/raw-text.txt")!;
    expect(raw.body!.toString()).toContain("This grant program");
    expect(raw.metadata).toEqual({ "source-version": first });
  });

  it("the older run holds nothing for review, so the newest run's claim and review stand", async () => {
    const { older } = replacedWhileProcessing();
    const { handler } = await load("nofo-pipeline/quarantine/index.mjs");

    const out = await handler({
      nofoName: "Grant",
      s3Bucket: ARTIFACTS,
      documentKey: STAGED,
      documentVersionId: older,
      rawTextKey: "_pending/Grant/raw-text.txt",
      mergedSummary: SUMMARY,
      source: "pipeline",
    });

    expect(out).toMatchObject({ quarantined: false, superseded: true });
    expect(ddb.calls()).toHaveLength(0);
  });

  it("the newest run's review records the version Approve must swap in", async () => {
    const { newer } = replacedWhileProcessing();
    const { PutItemCommand } = await import("@aws-sdk/client-dynamodb");
    ddb.on(PutItemCommand).resolves({});
    const { handler } = await load("nofo-pipeline/quarantine/index.mjs");

    await handler({ nofoName: "Grant", s3Bucket: ARTIFACTS, documentKey: STAGED, documentVersionId: newer, rawTextKey: "", mergedSummary: SUMMARY, source: "pipeline" });

    const item = unmarshall(ddb.commandCalls(PutItemCommand)[0].args[0].input.Item!);
    expect(item).toMatchObject({ s3DocumentKey: STAGED, s3DocumentVersionId: newer, live_status: "active" });
  });
});

describe("the review of a staged version", () => {
  const admin = { "custom:role": '["Developer"]' };
  const call = async (action: string, body: Record<string, unknown>) => {
    const { handler } = await load("nofo-pipeline/admin/index.mjs");
    return handler({
      requestContext: { http: { method: "POST", path: `/admin/processing-reviews/Grant/${action}` }, authorizer: { jwt: { claims: admin } } },
      body: JSON.stringify(body),
    });
  };
  const openReview = (status = "pending_review") => {
    reviews = [{
      nofo_name: "Grant",
      review_id: "r1",
      status,
      created_at: "2026-11-04T12:00:00Z",
      s3DocumentKey: STAGED,
      s3RawTextKey: "_pending/Grant/raw-text.txt",
      extractedSummary: JSON.stringify(SUMMARY),
      extractedQuestions: JSON.stringify(QUESTIONS),
      live_status: "active",
    }];
  };

  it("Reject discards only the staged files; the published version and its row stay", async () => {
    liveGrantWithStagedVersion();
    openReview();

    const res = await call("reject", { reason: "Wrong document", reviewId: "r1" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).keptLive).toBe(true);
    expect(keysUnder(ARTIFACTS, "_pending/")).toEqual([]);
    expect(published()).toEqual(BEFORE);
    expect(text(ARTIFACTS, "Grant/questions.json")).toBe("old questions");
    expect(log.filter((l) => l.startsWith("delete") && !l.includes("/_pending/"))).toEqual([]);
    expect(ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input).find((u) => u.TableName === "reviews")!.ExpressionAttributeValues)
      .toMatchObject({ ":status": { S: "rejected" } });
  });

  it("Reject first puts back a publish that stopped partway", async () => {
    liveGrantWithStagedVersion();
    openReview();
    ddb.on(UpdateItemCommand, { TableName: ENV.NOFO_METADATA_TABLE_NAME }).callsFake((input) => {
      if (String(input.UpdateExpression).includes("#status = :status")) throw new Error("throttled");
      return {};
    });
    failRestores = true;
    const { handler: publish } = await load("nofo-pipeline/publish/index.mjs");
    await expect(publish(publishEvent())).rejects.toThrow("throttled");
    expect(text(ARTIFACTS, "_pending/Grant/swap.json")).not.toBeNull();
    expect(published()).not.toEqual(BEFORE);
    failRestores = false;

    await call("reject", { reason: "Wrong document", reviewId: "r1" });

    expect(published()).toEqual(BEFORE);
    expect(keysUnder(ARTIFACTS, "_pending/")).toEqual([]);
  });

  it("Approve asks publish to swap in the version this review checked", async () => {
    liveGrantWithStagedVersion();
    openReview();
    reviews[0].s3DocumentVersionId = "v7";
    lambda.on(InvokeCommand).resolves({ Payload: new TextEncoder().encode("{}") as any });

    expect((await call("approve", { reviewId: "r1" })).statusCode).toBe(200);

    const payload = JSON.parse(String(lambda.commandCalls(InvokeCommand)[0].args[0].input.Payload));
    expect(payload).toMatchObject({ documentKey: STAGED, documentVersionId: "v7" });
  });

  it.each(["approve", "reject"])("refuses to %s a closed review, whose staged files may be a newer run's", async (action) => {
    liveGrantWithStagedVersion();
    openReview("superseded");

    const res = await call(action, { reason: "Wrong document", reviewId: "r1" });

    expect(res.statusCode).toBe(409);
    expect(keysUnder(ARTIFACTS, "_pending/")).toContain(STAGED);
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);
  });
});

describe("the status a new version publishes under", () => {
  it.each([
    ["an archived grant whose new deadline is ahead", undefined, { status: "archived" }, "2027-02-01", "active"],
    ["an archived grant whose deadline has passed", undefined, { status: "archived" }, "2026-10-01", "archived"],
    ["a held grant that was archived, approved with a deadline ahead", "archived", { status: "quarantined", previousStatus: "archived" }, "2027-02-01", "active"],
    ["a held grant that was archived, with no known deadline", "archived", { status: "quarantined", previousStatus: "archived" }, null, "archived"],
    ["an archived rolling grant", undefined, { status: "archived", isRolling: "true" }, "2027-02-01", "archived"],
    ["an active grant whose deadline has passed", undefined, { status: "active" }, "2026-10-01", "active"],
    ["a new grant", undefined, { status: "processing" }, null, "active"],
  ])("%s", async (_label, publishStatus, row, deadline, expected) => {
    const { statusToPublish } = await load("nofo-pipeline/publish/index.mjs");
    expect(statusToPublish(publishStatus, row, deadline, new Date("2026-11-04T15:00:00Z"))).toBe(expected);
  });

  const statusWritten = () =>
    unmarshall(metaUpdates().find((u) => String(u.UpdateExpression).includes("#status = :status"))!.ExpressionAttributeValues!)[":status"];

  it("opens an archived grant again when the approved version's deadline is ahead", async () => {
    liveGrantWithStagedVersion();
    metaRow = { ...metaRow, status: "archived", expiration_date: "2026-09-30" };
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await handler(publishEvent({ existingExpirationDate: null, applicationDeadline: "2027-03-01" }));

    expect(statusWritten()).toBe("active");
  });

  it("keeps an archived grant archived when the approved version brings no new deadline", async () => {
    liveGrantWithStagedVersion();
    metaRow = { ...metaRow, status: "archived", expiration_date: "2026-09-30" };
    const { handler } = await load("nofo-pipeline/publish/index.mjs");

    await handler(publishEvent({ existingExpirationDate: null, applicationDeadline: null }));

    expect(statusWritten()).toBe("archived");
  });

  describe("synthesize", () => {
    const deadlineReply = (date: string) => {
      bedrock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text: date }], stop_reason: "end_turn" })) as any,
      });
    };
    const run = async () => {
      put(ARTIFACTS, "_pending/Grant/raw-text.txt", "new text");
      const { handler } = await load("nofo-pipeline/synthesize/index.mjs");
      return handler({
        s3Bucket: ARTIFACTS,
        rawTextKey: "_pending/Grant/raw-text.txt",
        nofoName: "Grant",
        mergedSummary: { KeyDeadlines: [{ item: "Applications due", description: "March 1, 2027" }] },
      });
    };

    it("reads the new version's deadline when the stored one has passed, and keeps it when it is ahead", async () => {
      metaRow = { ...metaRow, status: "archived", expiration_date: "2026-09-30" };
      deadlineReply("2027-03-01");

      const out = await run();

      expect(out.applicationDeadline).toBe("2027-03-01");
      expect(out.existingExpirationDate).toBeNull();
    });

    it("keeps the stored deadline when the new version's has passed too", async () => {
      metaRow = { ...metaRow, status: "archived", expiration_date: "2026-09-30" };
      deadlineReply("2026-08-01");

      const out = await run();

      expect(out.applicationDeadline).toBeNull();
      expect(out.existingExpirationDate).toBe("2026-09-30");
    });

    it("keeps a stored deadline that is still ahead without asking the model", async () => {
      deadlineReply("2027-03-01");

      const out = await run();

      expect(out.existingExpirationDate).toBe("2027-01-15");
      expect(bedrock.commandCalls(InvokeModelCommand)).toHaveLength(0);
    });
  });
});

describe("the guidance on a live grant's failing new version", () => {
  it("tells the admin users keep the published version, and that an archived grant was published", async () => {
    const { keptLiveGuidance, unverifiedItemsGuidance } = await load("nofo-pipeline/shared/unverified-guidance.mjs");
    const guidance = unverifiedItemsGuidance("Grant", [{ category: "EligibilityCriteria", item: "Towns", reason: "Not stated." }]);

    const live = keptLiveGuidance(guidance, "Grant", "active").message;
    const archived = keptLiveGuidance(guidance, "Grant", "archived").message;

    expect(live.startsWith('"Grant" is live.')).toBe(true);
    expect(archived.startsWith('"Grant" was published.')).toBe(true);
    expect(archived).not.toMatch(/is live/);
    for (const message of [live, archived]) {
      expect(message.endsWith("Users keep seeing the published version until you approve or reject this new one.")).toBe(true);
      expect(message).not.toMatch(/Users won't see this grant/);
    }
  });

  it("adds the note to guidance that had none", async () => {
    const { keptLiveGuidance } = await load("nofo-pipeline/shared/unverified-guidance.mjs");
    expect(keptLiveGuidance({ message: "Two sections are missing." }, "Grant", "active").message).toBe(
      '"Grant" is live. Two sections are missing. Users keep seeing the published version until you approve or reject this new one.'
    );
  });
});

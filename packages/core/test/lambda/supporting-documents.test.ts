import { readFileSync } from "node:fs";
import path from "node:path";
import { mockClient } from "aws-sdk-client-mock";
import { deflateRawSync } from "node:zlib";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractDocxText,
  legacyGrantPrefix,
  loadSupportingDocuments,
  pdfContentBlocks,
} from "../../lib/chatbot-api/functions/draft-pipeline/generate-section/supporting-documents.mjs";

const s3 = mockClient(S3Client);
const bedrock = mockClient(BedrockRuntimeClient);
const ddb = mockClient(DynamoDBClient);

function zip(name: string, content: string): Buffer {
  const data = deflateRawSync(Buffer.from(content, "utf8"));
  const fileName = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);
  const centralStart = local.length + fileName.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([local, fileName, data, central, fileName, end]);
}

const docx = (paragraphs: string[]) =>
  zip(
    "word/document.xml",
    `<?xml version="1.0"?><w:document><w:body>${paragraphs
      .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
      .join("")}</w:body></w:document>`
  );
const pdf = (pages: number) =>
  Buffer.from(`%PDF-1.7\n${Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj << /Type /Page >> endobj`).join("\n")}\n<< /Type /Pages >>`, "latin1");

type Stored = { body: Buffer; size?: number; modified?: string };
function bucket(files: Record<string, Stored>) {
  s3.on(ListObjectsV2Command).callsFake((input) => ({
    Contents: Object.entries(files)
      .filter(([key]) => key.startsWith(input.Prefix))
      .map(([Key, f]) => ({ Key, Size: f.size ?? f.body.length, LastModified: new Date(f.modified ?? "2026-11-01T00:00:00Z") })),
  }));
  s3.on(GetObjectCommand).callsFake((input) => {
    const file = files[input.Key];
    if (!file) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    return {
      Body: {
        transformToByteArray: async () => new Uint8Array(file.body),
        transformToString: async () => file.body.toString("utf8"),
      },
    } as any;
  });
}

beforeEach(() => {
  for (const m of [s3, bedrock, ddb]) m.reset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const load = (documentKeys?: string[] | null, limits = {}) =>
  loadSupportingDocuments({
    s3: new S3Client({}),
    bucket: "user-docs",
    userId: "user-1",
    documentKeys,
    documentIdentifier: "Bridge Grant/",
    limits,
  });

const LIB = path.join(__dirname, "../../lib/chatbot-api/functions");

describe("loading supporting documents", () => {
  it("is one module, copied byte for byte into the chat Lambda", () => {
    const read = (dir: string) => readFileSync(path.join(LIB, dir, "supporting-documents.mjs"), "utf8");
    expect(read("websocket-chat")).toBe(read("draft-pipeline/generate-section"));
  });

  it("finds a grant's pre-library folder from a trailing-slash grant id", () => {
    expect(legacyGrantPrefix("user-1", "Bridge Grant/")).toBe("user-1/Bridge Grant/");
    expect(legacyGrantPrefix("user-1", "federal/Bridge Grant")).toBe("user-1/Bridge Grant/");
    expect(legacyGrantPrefix("user-1", "")).toBeNull();
  });

  it("with no stored selection reads the grant's old folder, both slash forms, and nothing else", async () => {
    bucket({
      "user-1/Bridge Grant/budget.pdf": { body: pdf(2) },
      "user-1/Bridge Grant/budget.pdf.metadata.json": { body: Buffer.from("{}") },
      "user-1/Bridge Grant//letter.docx": { body: docx(["Dear funder,", "We serve 400 seniors &amp; families."]) },
      "user-1/Bridge Grant/notes.md": { body: Buffer.from("# Notes\nStaff: 6"), modified: "2026-10-01T00:00:00Z" },
      "user-1/Bridge Grant/sheet.xlsx": { body: Buffer.from("xlsx") },
      "user-1/Other Grant/other.txt": { body: Buffer.from("other grant") },
      "user-1/documents/library.txt": { body: Buffer.from("library file") },
    });

    const docs = await load(undefined);

    expect(s3.commandCalls(ListObjectsV2Command)[0].args[0].input).toMatchObject({ Bucket: "user-docs", Prefix: "user-1/" });
    expect(docs.pdfs.map((p) => [p.fileName, p.pages])).toEqual([["budget.pdf", 2]]);
    expect(docs.texts).toEqual([
      { key: "user-1/Bridge Grant//letter.docx", fileName: "letter.docx", content: "Dear funder,\nWe serve 400 seniors & families." },
      { key: "user-1/Bridge Grant/notes.md", fileName: "notes.md", content: "# Notes\nStaff: 6" },
    ]);
    expect(docs.skipped).toEqual([{ key: "user-1/Bridge Grant/sheet.xlsx", fileName: "sheet.xlsx", reason: "unsupported" }]);
    expect(s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key)).not.toContain("user-1/Bridge Grant/sheet.xlsx");
  });

  it("with a stored selection reads only those keys of the caller's that still exist", async () => {
    bucket({
      "user-1/documents/plan.txt": { body: Buffer.from("plan") },
      "user-1/Bridge Grant//old.txt": { body: Buffer.from("old") },
      "user-1/Bridge Grant/unticked.txt": { body: Buffer.from("unticked") },
      "user-2/documents/theirs.txt": { body: Buffer.from("theirs") },
    });

    const docs = await load(["user-1/documents/plan.txt", "user-1/Bridge Grant//old.txt", "user-2/documents/theirs.txt", "user-1/documents/deleted.pdf"]);

    expect(docs.selected.sort()).toEqual(["user-1/Bridge Grant//old.txt", "user-1/documents/plan.txt"]);
    expect(docs.texts.map((t) => t.content).sort()).toEqual(["old", "plan"]);
  });

  it("an empty selection reads nothing, without listing", async () => {
    expect(await load([])).toEqual({ selected: [], pdfs: [], texts: [], skipped: [] });
    expect(s3.calls()).toHaveLength(0);
  });

  it("skips files over a per-file cap or the total budget, newest first", async () => {
    bucket({
      "user-1/documents/huge.pdf": { body: pdf(1), size: 21 * 1024 * 1024, modified: "2026-11-03T00:00:00Z" },
      "user-1/documents/new.pdf": { body: pdf(100), modified: "2026-11-02T00:00:00Z" },
      "user-1/documents/old.pdf": { body: pdf(60), modified: "2026-10-01T00:00:00Z" },
      "user-1/documents/a.txt": { body: Buffer.from("a".repeat(60)), modified: "2026-11-02T00:00:00Z" },
      "user-1/documents/b.txt": { body: Buffer.from("b".repeat(60)), modified: "2026-10-02T00:00:00Z" },
      "user-1/documents/long.txt": { body: Buffer.from("c".repeat(200)), modified: "2026-10-03T00:00:00Z" },
    });
    const all = ["huge.pdf", "new.pdf", "old.pdf", "a.txt", "b.txt", "long.txt"].map((n) => `user-1/documents/${n}`);

    const docs = await load(all, { maxTextChars: 100 });

    expect(docs.pdfs.map((p) => p.fileName)).toEqual(["new.pdf"]);
    expect(docs.texts.map((t) => t.fileName)).toEqual(["a.txt"]);
    expect(Object.fromEntries(docs.skipped.map((f) => [f.fileName, f.reason]))).toEqual({
      "huge.pdf": "too-large",
      "old.pdf": "over-budget",
      "long.txt": "too-large",
      "b.txt": "over-budget",
    });
    expect(s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key)).not.toContain("user-1/documents/huge.pdf");
  });

  it("skips a file that isn't what its extension says", async () => {
    bucket({
      "user-1/documents/fake.pdf": { body: Buffer.from("not a pdf") },
      "user-1/documents/fake.docx": { body: Buffer.from("not a zip") },
    });
    const docs = await load(["user-1/documents/fake.pdf", "user-1/documents/fake.docx"]);
    expect(docs.skipped.map((f) => f.reason)).toEqual(["unreadable", "unreadable"]);
  });

  it("attaches each PDF as a base64 document block after its name", () => {
    const bytes = pdf(1);
    expect(pdfContentBlocks({ pdfs: [{ fileName: 'a "b".pdf', bytes }] })).toEqual([
      { type: "text", text: 'Applicant supporting document "a b.pdf" (PDF):' },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
    ]);
  });

  it("skips a .docx that inflates past 50 MB as too large instead of inflating it", async () => {
    const bomb = zip("word/document.xml", "<w:p>" + "a".repeat(51 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(() => extractDocxText(bomb)).toThrow(expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }));
    bucket({
      "user-1/documents/bomb.docx": { body: bomb, modified: "2026-11-03T00:00:00Z" },
      "user-1/documents/ok.docx": { body: docx(["Fine."]), modified: "2026-11-02T00:00:00Z" },
    });

    const docs = await load(["user-1/documents/bomb.docx", "user-1/documents/ok.docx"]);

    expect(docs.skipped).toEqual([{ key: "user-1/documents/bomb.docx", fileName: "bomb.docx", reason: "too-large" }]);
    expect(docs.texts.map((t) => t.content)).toEqual(["Fine."]);
  });

  it("returns null for a zip without a Word body", () => {
    expect(extractDocxText(zip("other.xml", "<x/>"))).toBeNull();
  });
});

describe("writing a section from the applicant's selected files", () => {
  let generateSection: (event: any) => Promise<any>;
  beforeAll(async () => {
    vi.stubEnv("SONNET_MODEL_ID", "model-1");
    vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
    vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
    vi.stubEnv("DRAFT_GENERATION_JOBS_TABLE_NAME", "jobs");
    ({ handler: generateSection } = await import("../../lib/chatbot-api/functions/draft-pipeline/generate-section/index.mjs"));
  });

  const reply = () => ({
    body: new TextEncoder().encode(
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ content: "Section text." }) }] })
    ),
  });
  const bodies = () => bedrock.commandCalls(InvokeModelCommand).map((c) => JSON.parse(c.args[0].input.body as string));
  const write = () =>
    generateSection({
      sectionItem: { id: "need", item: "Need", description: "Describe the need.", index: 0 },
      jobId: "job-1",
      query: "Generate all sections",
      documentIdentifier: "Bridge Grant/",
      projectBasics: {},
      questionnaire: {},
      userId: "sub-1",
      documentOwner: "user-1",
      documentKeys: ["user-1/documents/budget.pdf", "user-1/documents/plan.txt", "user-1/documents/sheet.xlsx"],
      totalSections: 1,
    });

  beforeEach(() => {
    ddb.on(UpdateItemCommand).resolves({});
    bucket({
      "user-1/documents/budget.pdf": { body: pdf(1) },
      "user-1/documents/plan.txt": { body: Buffer.from("We will deliver 12,000 meals.") },
      "user-1/documents/sheet.xlsx": { body: Buffer.from("xlsx") },
      "user-1/documents/unticked.txt": { body: Buffer.from("Not for this application.") },
      "Bridge Grant/raw-text.txt": { body: Buffer.from("The grant.") },
    });
  });

  it("attaches PDFs after the grant, includes text files in full, and records what it skipped on the job", async () => {
    bedrock.on(InvokeModelCommand).resolves(reply() as any);
    await write();

    const content = bodies()[0].messages[0].content;
    expect(content[0].text).toContain("The grant.");
    expect(content[1]).toEqual({ type: "text", text: 'Applicant supporting document "budget.pdf" (PDF):' });
    expect(content[2]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
    const draft = content[3].text as string;
    expect(content[3].cache_control).toEqual({ type: "ephemeral" });
    expect(draft).toContain('<document name="budget.pdf">Attached above as a PDF.</document>');
    expect(draft).toContain('<document name="plan.txt">\nWe will deliver 12,000 meals.\n</document>');
    expect(draft).not.toContain("Not for this application.");
    expect(draft).not.toContain("sheet.xlsx");

    const update = ddb.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(update.ExpressionAttributeValues?.[":skipped"]).toEqual({
      L: [{ M: { name: { S: "sheet.xlsx" }, reason: { S: "unsupported" } } }],
    });
  });

  it("drops the PDFs and names them when the model rejects the request", async () => {
    bedrock
      .on(InvokeModelCommand)
      .rejectsOnce(Object.assign(new Error("Input is too long"), { name: "ValidationException" }))
      .resolves(reply() as any);

    await expect(write()).resolves.toMatchObject({ status: "completed" });

    const retry = bodies()[1].messages[0].content;
    expect(retry.some((b: any) => b.type === "document")).toBe(false);
    expect(retry[1].text).toContain("We will deliver 12,000 meals.");
    const skipped = ddb.commandCalls(UpdateItemCommand)[0].args[0].input.ExpressionAttributeValues?.[":skipped"];
    expect(skipped?.L?.map((s: any) => s.M.name.S)).toEqual(["sheet.xlsx", "budget.pdf"]);
  });
});

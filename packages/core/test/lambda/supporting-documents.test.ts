import { mockClient } from "aws-sdk-client-mock";
import { deflateRawSync } from "node:zlib";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractDocxText,
  loadSupportingDocuments,
  pdfContentBlocks,
  userDocumentsPrefix,
} from "../../lib/chatbot-api/functions/draft-pipeline/generate-section/supporting-documents.mjs";

const s3 = mockClient(S3Client);
const kb = mockClient(BedrockAgentRuntimeClient);
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
    return { Body: { transformToByteArray: async () => new Uint8Array(file.body) } } as any;
  });
}

beforeEach(() => {
  for (const m of [s3, kb, bedrock, ddb]) m.reset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const load = (limits = {}) =>
  loadSupportingDocuments({ s3: new S3Client({}), bucket: "user-docs", userId: "user-1", documentIdentifier: "Bridge Grant/", limits });

describe("loading supporting documents", () => {
  it("reads the grant's folder from a trailing-slash grant id", () => {
    expect(userDocumentsPrefix("user-1", "Bridge Grant/")).toBe("user-1/Bridge Grant/");
    expect(userDocumentsPrefix("user-1", "federal/Bridge Grant")).toBe("user-1/Bridge Grant/");
    expect(userDocumentsPrefix("user-1", "")).toBeNull();
  });

  it("loads PDFs, DOCX text and plain text in full and leaves the rest to search", async () => {
    bucket({
      "user-1/Bridge Grant/budget.pdf": { body: pdf(2) },
      "user-1/Bridge Grant/budget.pdf.metadata.json": { body: Buffer.from("{}") },
      "user-1/Bridge Grant/letter.docx": { body: docx(["Dear funder,", "We serve 400 seniors &amp; families."]) },
      "user-1/Bridge Grant/notes.md": { body: Buffer.from("# Notes\nStaff: 6") },
      "user-1/Bridge Grant/sheet.xlsx": { body: Buffer.from("xlsx") },
      "user-1/Other Grant/other.txt": { body: Buffer.from("other grant") },
    });

    const docs = await load();

    expect(s3.commandCalls(ListObjectsV2Command)[0].args[0].input).toMatchObject({ Bucket: "user-docs", Prefix: "user-1/Bridge Grant/", Delimiter: "/" });
    expect(docs.pdfs.map((p) => [p.fileName, p.pages])).toEqual([["budget.pdf", 2]]);
    expect(docs.texts).toEqual([
      { key: "user-1/Bridge Grant/letter.docx", fileName: "letter.docx", content: "Dear funder,\nWe serve 400 seniors & families." },
      { key: "user-1/Bridge Grant/notes.md", fileName: "notes.md", content: "# Notes\nStaff: 6" },
    ]);
    expect(docs.fallback).toEqual([{ key: "user-1/Bridge Grant/sheet.xlsx", fileName: "sheet.xlsx", reason: "unsupported" }]);
    expect(s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key)).not.toContain("user-1/Bridge Grant/sheet.xlsx");
  });

  it("sends files over a per-file cap or the total budget to search, newest first", async () => {
    bucket({
      "user-1/Bridge Grant/huge.pdf": { body: pdf(1), size: 11 * 1024 * 1024, modified: "2026-11-03T00:00:00Z" },
      "user-1/Bridge Grant/new.pdf": { body: pdf(60), modified: "2026-11-02T00:00:00Z" },
      "user-1/Bridge Grant/old.pdf": { body: pdf(60), modified: "2026-10-01T00:00:00Z" },
      "user-1/Bridge Grant/a.txt": { body: Buffer.from("a".repeat(60)), modified: "2026-11-02T00:00:00Z" },
      "user-1/Bridge Grant/b.txt": { body: Buffer.from("b".repeat(60)), modified: "2026-10-02T00:00:00Z" },
      "user-1/Bridge Grant/long.txt": { body: Buffer.from("c".repeat(200)), modified: "2026-10-03T00:00:00Z" },
    });

    const docs = await load({ maxTextChars: 100, maxTextFileChars: 150 });

    expect(docs.pdfs.map((p) => p.fileName)).toEqual(["new.pdf"]);
    expect(docs.texts.map((t) => t.fileName)).toEqual(["a.txt"]);
    expect(Object.fromEntries(docs.fallback.map((f) => [f.fileName, f.reason]))).toEqual({
      "huge.pdf": "file-too-large",
      "old.pdf": "over-budget",
      "long.txt": "file-too-large",
      "b.txt": "over-budget",
    });
    expect(s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key)).not.toContain("user-1/Bridge Grant/huge.pdf");
  });

  it("searches a file that isn't what its extension says", async () => {
    bucket({
      "user-1/Bridge Grant/fake.pdf": { body: Buffer.from("not a pdf") },
      "user-1/Bridge Grant/fake.docx": { body: Buffer.from("not a zip") },
    });
    const docs = await load();
    expect(docs.fallback.map((f) => f.reason)).toEqual(["unreadable", "unreadable"]);
  });

  it("attaches each PDF as a base64 document block after its name", () => {
    const bytes = pdf(1);
    expect(pdfContentBlocks({ pdfs: [{ fileName: 'a "b".pdf', bytes }] })).toEqual([
      { type: "text", text: 'Applicant supporting document "a b.pdf" (PDF):' },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
    ]);
  });

  it("returns null for a zip without a Word body", () => {
    expect(extractDocxText(zip("other.xml", "<x/>"))).toBeNull();
  });
});

describe("writing a section from the applicant's own files", () => {
  let generateSection: (event: any) => Promise<any>;
  beforeAll(async () => {
    vi.stubEnv("KB_ID", "kb-1");
    vi.stubEnv("SONNET_MODEL_ID", "model-1");
    vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
    ({ handler: generateSection } = await import("../../lib/chatbot-api/functions/draft-pipeline/generate-section/index.mjs"));
  });

  const reply = () => ({
    body: new TextEncoder().encode(
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ content: "Section text." }) }] })
    ),
  });
  const chunk = (uri: string, text: string) => ({
    content: { text, type: "TEXT" },
    location: { s3Location: { uri } },
    metadata: { documentType: "userDocument", fileName: uri.split("/").pop() },
  });
  const isUserSearch = (input: any) =>
    input.retrievalConfiguration.vectorSearchConfiguration.filter.andAll[0].equals.value === "userDocument";
  const bodies = () => bedrock.commandCalls(InvokeModelCommand).map((c) => JSON.parse(c.args[0].input.body as string));
  const write = () =>
    generateSection({
      sectionItem: { id: "need", item: "Need", description: "Describe the need.", index: 0 },
      jobId: "job-1",
      query: "Generate all sections",
      documentIdentifier: "Bridge Grant/",
      projectBasics: {},
      questionnaire: {},
      userId: "user-1",
      totalSections: 1,
    });

  beforeEach(() => {
    ddb.on(UpdateItemCommand).resolves({});
    bucket({
      "user-1/Bridge Grant/budget.pdf": { body: pdf(1) },
      "user-1/Bridge Grant/plan.txt": { body: Buffer.from("We will deliver 12,000 meals.") },
      "user-1/Bridge Grant/sheet.xlsx": { body: Buffer.from("xlsx") },
    });
    kb.on(RetrieveCommand).callsFake((input) =>
      isUserSearch(input)
        ? {
            retrievalResults: [
              chunk("s3://user-docs/user-1/Bridge Grant/plan.txt", "plan excerpt"),
              chunk("s3://user-docs/user-1/Bridge Grant/sheet.xlsx", "Line item: vans $30,000"),
            ],
          }
        : { retrievalResults: [] }
    );
  });

  it("attaches PDFs, includes text files in full and keeps search excerpts only for files it couldn't load", async () => {
    bedrock.on(InvokeModelCommand).resolves(reply() as any);
    await write();

    const [body] = bodies();
    const content = body.messages[0].content;
    expect(content[0]).toEqual({ type: "text", text: 'Applicant supporting document "budget.pdf" (PDF):' });
    expect(content[1]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
    const prompt = content[2].text as string;
    const docs = prompt.slice(prompt.indexOf("<applicant_documents>"), prompt.indexOf("</applicant_documents>"));
    expect(docs).toContain("applicant's own supporting documents");
    expect(docs).toContain('<document name="budget.pdf">Attached as a PDF at the start of this message.</document>');
    expect(docs).toContain('<document name="plan.txt">\nWe will deliver 12,000 meals.\n</document>');
    expect(docs).toContain('<document name="sheet.xlsx">\nLine item: vans $30,000\n</document>');
    expect(docs).not.toContain("plan excerpt");
  });

  it("falls back to search excerpts when the model rejects the full documents", async () => {
    bedrock
      .on(InvokeModelCommand)
      .rejectsOnce(Object.assign(new Error("Input is too long"), { name: "ValidationException" }))
      .resolves(reply() as any);

    await expect(write()).resolves.toMatchObject({ status: "completed" });

    const retry = bodies()[1].messages[0].content;
    expect(typeof retry).toBe("string");
    expect(retry).toContain("plan excerpt");
    expect(retry).not.toContain("Attached as a PDF");
  });
});

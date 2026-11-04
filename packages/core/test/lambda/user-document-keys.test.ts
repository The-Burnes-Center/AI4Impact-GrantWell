import { mockClient } from "aws-sdk-client-mock";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const s3 = mockClient(S3Client);

type Handler = (event: any) => Promise<{ statusCode: number; body: string }>;
let upload: Handler;
let download: Handler;
let list: Handler;
beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "testing");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "testing");
  vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
  const km = "../../lib/chatbot-api/functions/knowledge-management";
  ({ handler: upload } = await import(`${km}/generate-upload-url/index.mjs`));
  ({ handler: download } = await import(`${km}/generate-download-url/index.mjs`));
  ({ handler: list } = await import(`${km}/list-documents/index.mjs`));
});

beforeEach(() => {
  s3.reset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const event = (body: object, username = "user-1") => ({
  requestContext: { authorizer: { jwt: { claims: { "cognito:username": username } } } },
  body: JSON.stringify(body),
});
const ask = (fileName: string, fileSize = 10) => upload(event({ fileName, fileType: "application/pdf", fileSize }));

describe("upload URLs", () => {
  it("signs a clean key in the caller's own folder", async () => {
    const res = await ask("user-1/Bridge Grant/budget.pdf");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).signedUrl).toContain("/user-1/Bridge%20Grant/budget.pdf");
  });

  it.each([
    ["a parent segment into another user's folder", "user-1/../user-2/budget.pdf", 403],
    ["a dot segment", "user-1/./Bridge Grant/budget.pdf", 403],
    ["another user's folder", "user-2/Bridge Grant/budget.pdf", 403],
    ["an empty segment", "user-1/Bridge Grant//budget.pdf", 400],
    ["a trailing slash", "user-1/Bridge Grant/", 400],
  ])("rejects %s", async (_label, key, status) => {
    expect((await ask(key)).statusCode).toBe(status);
  });

  it("rejects an empty file", async () => {
    const res = await ask("user-1/Bridge Grant/empty.pdf", 0);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/positive/);
  });
});

describe("reading the caller's documents", () => {
  it("won't sign a download that climbs out of the caller's folder", async () => {
    expect((await download(event({ fileName: "user-1/../user-2/x.pdf" }))).statusCode).toBe(403);
    expect((await download(event({ fileName: "user-1/Bridge Grant/x.pdf" }))).statusCode).toBe(200);
  });

  it("signs downloads as attachments, so the browser saves the file", async () => {
    const res = await download(event({ fileName: "user-1/documents/board notes.txt" }));
    const url = new URL(JSON.parse(res.body).signedUrl);
    expect(url.searchParams.get("response-content-disposition")).toBe(
      `attachment; filename="board notes.txt"; filename*=UTF-8''board%20notes.txt`
    );
  });

  it("lists the caller's whole library, old grant folders included, whatever prefix is asked for", async () => {
    const at = new Date("2026-11-01T00:00:00Z");
    s3.on(ListObjectsV2Command)
      .resolvesOnce({
        IsTruncated: true,
        NextContinuationToken: "t",
        Contents: [
          { Key: "user-1/documents/plan.pdf", Size: 10, LastModified: at },
          { Key: "user-1/documents/plan.pdf.metadata.json", Size: 1, LastModified: at },
        ],
      })
      .resolves({
        Contents: [
          { Key: "user-1/Bridge Grant//budget.xlsx", Size: 20, LastModified: at },
          { Key: "user-1/Old Grant/letter.docx", Size: 30, LastModified: at },
        ],
      });

    const res = await list(event({ folderPrefix: "user-2/" }));

    expect(res.statusCode).toBe(200);
    expect(s3.commandCalls(ListObjectsV2Command).map((c) => c.args[0].input.Prefix)).toEqual(["user-1/", "user-1/"]);
    expect(JSON.parse(res.body).documents).toEqual([
      { key: "user-1/documents/plan.pdf", name: "plan.pdf", folder: "documents", size: 10, lastModified: at.toISOString() },
      { key: "user-1/Bridge Grant//budget.xlsx", name: "budget.xlsx", folder: "Bridge Grant", size: 20, lastModified: at.toISOString() },
      { key: "user-1/Old Grant/letter.docx", name: "letter.docx", folder: "Old Grant", size: 30, lastModified: at.toISOString() },
    ]);
  });
});

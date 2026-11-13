import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { docSortKey } from "../../lib/chatbot-api/functions/knowledge-management/document-safeguards/document-relevance.mjs";

const s3 = mockClient(S3Client);
const ddb = mockClient(DynamoDBClient);

type Handler = (event: any) => Promise<{ statusCode: number; body: string }>;
let upload: Handler;
let download: Handler;
let list: Handler;
beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "testing");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "testing");
  vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
  vi.stubEnv("USER_DOCUMENT_TABLE_NAME", "user-document-table");
  const km = "../../lib/chatbot-api/functions/knowledge-management";
  ({ handler: upload } = await import(`${km}/generate-upload-url/index.mjs`));
  ({ handler: download } = await import(`${km}/generate-download-url/index.mjs`));
  ({ handler: list } = await import(`${km}/list-documents/index.mjs`));
});

beforeEach(() => {
  s3.reset();
  ddb.reset();
  ddb.on(PutItemCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
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

  const libraryUpload = (extra: object) =>
    upload(event({ fileName: "user-1/documents/budget.pdf", fileType: "application/pdf", fileSize: 10, ...extra }));

  it.each([
    ["no type", {}, /Choose a document type/],
    ["an unknown type", { documentType: "homework" }, /Choose a document type/],
    ["Other without a description", { documentType: "other", description: "  " }, /Describe the document/],
    ["a description over 200 characters", { documentType: "other", description: "x".repeat(201) }, /200 characters/],
  ])("won't sign a library upload with %s", async (_label, extra, message) => {
    const res = await libraryUpload(extra);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(message);
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("stores a library upload's type before signing it", async () => {
    const res = await libraryUpload({ documentType: "other", description: " Board   minutes " });
    expect(res.statusCode).toBe(200);
    const item = unmarshall(ddb.commandCalls(PutItemCommand)[0].args[0].input.Item!);
    expect(item).toMatchObject({
      user_id: "user-1",
      sk: docSortKey("user-1/documents/budget.pdf"),
      document_key: "user-1/documents/budget.pdf",
      doc_type: "other",
      description: "Board minutes",
    });
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
      { key: "user-1/documents/plan.pdf", name: "plan.pdf", folder: "documents", size: 10, lastModified: at.toISOString(), type: null },
      { key: "user-1/Bridge Grant//budget.xlsx", name: "budget.xlsx", folder: "Bridge Grant", size: 20, lastModified: at.toISOString(), type: null },
      { key: "user-1/Old Grant/letter.docx", name: "letter.docx", folder: "Old Grant", size: 30, lastModified: at.toISOString(), type: null },
    ]);
  });

  it("gives each document the type its owner chose", async () => {
    const at = new Date("2026-11-01T00:00:00Z");
    s3.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: "user-1/documents/plan.pdf", Size: 10, LastModified: at },
        { Key: "user-1/documents/minutes.txt", Size: 10, LastModified: at },
      ],
    });
    ddb.on(QueryCommand).resolves({
      Items: [
        marshall({ user_id: "user-1", sk: "DOC#a", document_key: "user-1/documents/plan.pdf", doc_type: "budget" }),
        marshall({ user_id: "user-1", sk: "DOC#b", document_key: "user-1/documents/minutes.txt", doc_type: "other", description: "Board minutes" }),
      ],
    });

    const res = await list(event({}));

    const query = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(unmarshall(query.ExpressionAttributeValues!)).toEqual({ ":u": "user-1", ":doc": "DOC#" });
    expect(JSON.parse(res.body).documents.map((d: any) => [d.name, d.type, d.description])).toEqual([
      ["plan.pdf", "budget", undefined],
      ["minutes.txt", "other", "Board minutes"],
    ]);
  });

  it("still lists the documents when their types can't be read", async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "user-1/documents/plan.pdf", Size: 10, LastModified: new Date() }] });
    ddb.on(QueryCommand).rejects(Object.assign(new Error("boom"), { name: "InternalServerError" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await list(event({}));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).documents[0].type).toBeNull();
  });
});

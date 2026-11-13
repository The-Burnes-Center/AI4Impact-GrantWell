import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);

type Handler = (event: any) => Promise<{ statusCode: number; body: string }>;
let handler: Handler;

beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "testing");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "testing");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }, { code: "NY", name: "New York" }]));
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("NOFO_BUCKET", "nofo-bucket");
  vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
  ({ handler } = await import("../../lib/chatbot-api/functions/knowledge-management/generate-download-url/index.mjs"));
});

const grants: Record<string, Record<string, unknown>> = {
  "MA Grant": { nofo_name: "MA Grant", scope: "state", state: "MA", status: "active" },
  "NY Grant": { nofo_name: "NY Grant", scope: "state", state: "NY", status: "active" },
  "Federal Grant": { nofo_name: "Federal Grant", scope: "federal", status: "active" },
  "Legacy Grant": { nofo_name: "Legacy Grant" },
  "Archived Grant": { nofo_name: "Archived Grant", scope: "federal", status: "archived" },
  "Held Grant": { nofo_name: "Held Grant", scope: "federal", status: "quarantined" },
  "New MA Grant": { nofo_name: "New MA Grant", scope: "state", state: "MA", status: "processing" },
  "Text Grant": { nofo_name: "Text Grant", scope: "federal", status: "active" },
  "Empty Grant": { nofo_name: "Empty Grant", scope: "federal", status: "active" },
};

const objects = new Set([
  "MA Grant/NOFO-File-PDF",
  "NY Grant/NOFO-File-PDF",
  "Federal Grant/NOFO-File-PDF",
  "Legacy Grant/NOFO-File-PDF",
  "Archived Grant/NOFO-File-PDF",
  "Held Grant/NOFO-File-PDF",
  "New MA Grant/NOFO-File-PDF",
  "Unknown Grant/NOFO-File-PDF",
  "Text Grant/NOFO-File-TXT",
]);

beforeEach(() => {
  ddb.reset();
  s3.reset();
  ddb.on(GetItemCommand).callsFake((input) => {
    const row = grants[input.Key?.nofo_name?.S];
    return row ? { Item: marshall(row) } : {};
  });
  s3.on(HeadObjectCommand).callsFake((input) => {
    if (input.Bucket === "nofo-bucket" && objects.has(input.Key)) return {};
    throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function claimsFor(role: string | null, state: string) {
  return {
    "cognito:username": "user-1",
    sub: "user-1",
    "custom:state": state,
    ...(role ? { "custom:role": JSON.stringify([role]) } : {}),
  };
}

const pdf = (grant: string | undefined, role: string | null = null, state = "MA") =>
  handler({
    queryStringParameters: grant === undefined ? undefined : { grant },
    requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: claimsFor(role, state) } } },
  });

const body = (res: { body: string }) => JSON.parse(res.body);

describe("grant PDF URLs", () => {
  it("signs a short-lived inline link to the published PDF in the grant bucket", async () => {
    const res = await pdf("MA Grant");
    expect(res.statusCode).toBe(200);
    const { available, signedUrl } = body(res);
    expect(available).toBe(true);
    const url = new URL(signedUrl);
    expect(url.hostname).toContain("nofo-bucket");
    expect(url.pathname).toBe("/MA%20Grant/NOFO-File-PDF");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^inline; filename="MA Grant\.pdf"/);
  });

  it("serves federal and untagged grants to any signed-in user", async () => {
    expect((await pdf("Federal Grant", null, "NY")).statusCode).toBe(200);
    expect((await pdf("Legacy Grant", null, "")).statusCode).toBe(200);
  });

  it("answers 404 for another state's grant and never looks for its file", async () => {
    const res = await pdf("NY Grant", null, "MA");
    expect(res.statusCode).toBe(404);
    expect(s3.commandCalls(HeadObjectCommand)).toHaveLength(0);
    expect((await pdf("NY Grant", "Admin", "MA")).statusCode).toBe(404);
  });

  it("lets a Developer and a platform admin open any state's grant", async () => {
    expect((await pdf("NY Grant", "Developer", "MA")).statusCode).toBe(200);
    expect((await pdf("NY Grant", "PlatformAdmin", "")).statusCode).toBe(200);
  });

  it("answers 404 for a grant with no metadata row, except to a Developer", async () => {
    expect((await pdf("Unknown Grant")).statusCode).toBe(404);
    expect((await pdf("Unknown Grant", "Developer")).statusCode).toBe(200);
  });

  it("answers 404 when the metadata table can't be read", async () => {
    ddb.on(GetItemCommand).rejects(new Error("Throttled"));
    expect((await pdf("Federal Grant")).statusCode).toBe(404);
  });

  it("serves an archived grant, as the summary does", async () => {
    expect((await pdf("Archived Grant")).statusCode).toBe(200);
  });

  it("hides a grant held for review from anyone who can't open it there", async () => {
    expect((await pdf("Held Grant")).statusCode).toBe(404);
    expect((await pdf("New MA Grant")).statusCode).toBe(404);
    expect((await pdf("Held Grant", "Admin", "MA")).statusCode).toBe(404);
    expect((await pdf("New MA Grant", "Admin", "MA")).statusCode).toBe(200);
    expect((await pdf("Held Grant", "Developer", "MA")).statusCode).toBe(200);
  });

  it("says no PDF is available when the grant's source is text", async () => {
    const res = await pdf("Text Grant");
    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({ available: false });
  });

  it("answers 404 when the grant has no source document", async () => {
    expect((await pdf("Empty Grant")).statusCode).toBe(404);
  });

  it.each([
    ["the staged-version folder", "_pending"],
    ["a staged version's path", "_pending/MA Grant"],
    ["a nested key", "MA Grant/NOFO-File-PDF"],
    ["a parent segment", ".."],
  ])("never signs %s", async (_label, grant) => {
    expect((await pdf(grant, "Developer")).statusCode).toBe(404);
    expect(s3.calls()).toHaveLength(0);
    expect(ddb.calls()).toHaveLength(0);
  });

  it("only ever checks the published keys in the grant bucket", async () => {
    await pdf("MA Grant");
    await pdf("Text Grant");
    for (const call of s3.commandCalls(HeadObjectCommand)) {
      expect(call.args[0].input.Bucket).toBe("nofo-bucket");
      expect(call.args[0].input.Key).toMatch(/^[^/_][^/]*\/NOFO-File-(PDF|TXT)$/);
    }
  });

  it("asks for the grant", async () => {
    expect((await pdf(undefined)).statusCode).toBe(400);
  });

  it("still signs the caller's own documents on POST", async () => {
    const res = await handler({
      requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: claimsFor(null, "MA") } } },
      body: JSON.stringify({ fileName: "user-1/documents/plan.pdf" }),
    });
    expect(res.statusCode).toBe(200);
    expect(body(res).signedUrl).toContain("user-docs");
  });
});

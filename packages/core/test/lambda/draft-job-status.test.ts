import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ddb = mockClient(DynamoDBClient);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  vi.stubEnv("DRAFT_GENERATION_JOBS_TABLE_NAME", "jobs");
  vi.stubEnv("EXPORTS_BUCKET", "exports");
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  ({ handler } = await import("../../lib/chatbot-api/gateway/api-routes/draft-job-status/index.mjs"));
});

const job = (fields: Record<string, unknown>) => {
  ddb.on(GetItemCommand, { TableName: "jobs", Key: { jobId: { S: "job-1" } } }).resolves({ Item: marshall({ jobId: "job-1", ...fields }) });
};
const poll = (sub?: string, jobId = "job-1") =>
  handler({
    pathParameters: { jobId },
    requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: sub ? { sub, email: "a@example.org" } : {} } } },
    headers: { authorization: "Bearer secret-token" },
  });

let logs: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ddb.reset();
  ddb.on(GetItemCommand).resolves({});
  logs = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("draft job status", () => {
  it("returns the owner's job progress", async () => {
    job({ userId: "owner", status: "in_progress", totalSections: 4, completedSectionCount: 1 });
    const res = await poll("owner");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ jobId: "job-1", status: "in_progress", totalSections: 4, completedSectionCount: 1 });
  });

  it("answers 404, as if the job didn't exist, to anyone but its owner", async () => {
    job({ userId: "owner", status: "completed", sections: { Summary: "private text" } });
    const res = await poll("someone-else");
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("private text");
  });

  it("answers 404 to everyone for a job with no owner", async () => {
    job({ status: "completed", sections: { Summary: "orphaned text" } });
    const res = await poll("anyone");
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("orphaned text");
  });

  it("answers 401 without JWT claims", async () => {
    job({ userId: "owner", status: "completed" });
    expect((await poll(undefined)).statusCode).toBe(401);
  });

  it("answers 404 for an unknown job", async () => {
    expect((await poll("owner", "nope")).statusCode).toBe(404);
  });

  it("mints a short-lived download URL for the owner's finished export", async () => {
    job({ userId: "owner", status: "completed", jobType: "export", objectKey: "exports/owner/job-1.pdf" });
    const { downloadUrl } = JSON.parse((await poll("owner")).body);
    const url = new URL(downloadUrl);
    expect(url.hostname).toBe("exports.s3.us-east-1.amazonaws.com");
    expect(url.pathname).toBe("/exports/owner/job-1.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("keeps the bearer token and email out of its logs", async () => {
    job({ userId: "owner", status: "in_progress" });
    await poll("owner");
    const logged = logs.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("a@example.org");
  });
});

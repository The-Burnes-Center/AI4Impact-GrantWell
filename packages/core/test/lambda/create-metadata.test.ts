import { mockClient } from "aws-sdk-client-mock";
import { BedrockAgentClient, ListIngestionJobsCommand } from "@aws-sdk/client-bedrock-agent";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const s3 = mockClient(S3Client);
const lambda = mockClient(LambdaClient);
const agent = mockClient(BedrockAgentClient);
const ddb = mockClient(DynamoDBClient);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  vi.stubEnv("USER_DOCUMENTS_BUCKET", "user-docs");
  vi.stubEnv("SYNC_KB_FUNCTION_NAME", "sync-kb");
  vi.stubEnv("KB_ID", "kb-1");
  vi.stubEnv("USER_DOCUMENTS_SOURCE", "ds-user");
  vi.stubEnv("SOURCE", "ds-nofo");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("ENABLE_DYNAMODB_CACHE", "true");
  ({ handler } = await import("../../lib/chatbot-api/functions/knowledge-management/create-metadata/index.mjs"));
});

const upload = (bucket: string, key: string) => ({ s3: { bucket: { name: bucket }, object: { key } } });
const notFound = () => new NoSuchKey({ message: "missing", $metadata: {} });
const written = () =>
  s3.commandCalls(PutObjectCommand).map((c) => ({ key: c.args[0].input.Key, body: JSON.parse(c.args[0].input.Body as string) }));

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const m of [s3, lambda, agent, ddb]) m.reset();
  s3.on(GetObjectCommand).rejects(notFound());
  s3.on(PutObjectCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  agent.on(ListIngestionJobsCommand).resolves({ ingestionJobSummaries: [] });
  ddb.on(GetItemCommand).resolves({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("create-metadata", () => {
  it("tags a user document with its owner and grant, then syncs only the user-documents source", async () => {
    await handler({ Records: [upload("user-docs", "user-1/Bridge+Grant/budget+v2.pdf")] });

    expect(written()).toEqual([
      {
        key: "user-1/Bridge Grant/budget v2.pdf.metadata.json",
        body: {
          metadataAttributes: expect.objectContaining({
            documentType: "userDocument",
            userId: "user-1",
            nofoName: "Bridge Grant",
            fileName: "budget v2.pdf",
          }),
        },
      },
    ]);
    const invokes = lambda.commandCalls(InvokeCommand).map((c) => c.args[0].input);
    expect(invokes).toHaveLength(1);
    expect(invokes[0]).toMatchObject({ FunctionName: "sync-kb", InvocationType: "Event" });
    expect(JSON.parse(invokes[0].Payload as unknown as string)).toEqual({ syncSource: "user-documents" });
  });

  it("copies agency and category from the metadata table onto a NOFO file", async () => {
    ddb.on(GetItemCommand, { TableName: "nofos", Key: marshall({ nofo_name: "Bridge Grant" }) }).resolves({
      Item: marshall({ nofo_name: "Bridge Grant", agency: "DOT", category: "Transportation" }),
    });
    await handler({ Records: [upload("nofos", "Bridge Grant/NOFO-File-PDF")] });
    expect(written()[0].body.metadataAttributes).toMatchObject({
      documentType: "NOFO",
      documentIdentifier: "Bridge Grant",
      agency: "DOT",
      category: "Transportation",
    });
  });

  it("never overwrites an existing metadata file and skips non-NOFO files", async () => {
    s3.on(GetObjectCommand, { Key: "Bridge Grant/NOFO-File-PDF.metadata.json" }).resolves({});
    await handler({ Records: [upload("nofos", "Bridge Grant/NOFO-File-PDF"), upload("nofos", "Bridge Grant/summary.json")] });
    expect(written()).toEqual([]);
    expect(lambda.calls()).toHaveLength(0);
  });

  it("logs createMetadataFailed for a failing record and still processes the rest", async () => {
    s3.on(GetObjectCommand, { Key: "user-1/A/bad.pdf.metadata.json" }).rejects(
      Object.assign(new Error("Access Denied"), { name: "AccessDenied" })
    );
    await handler({ Records: [upload("user-docs", "user-1/A/bad.pdf"), upload("user-docs", "user-1/A/good.pdf")] });

    expect(errors.mock.calls.some(([line]) => String(line).startsWith(LOG_MARKERS.createMetadataFailed[0]))).toBe(true);
    expect(written().map((w) => w.key)).toEqual(["user-1/A/good.pdf.metadata.json"]);
  });

  it("doesn't start a sync while one is already running", async () => {
    agent.on(ListIngestionJobsCommand).resolves({ ingestionJobSummaries: [{ ingestionJobId: "j1" } as any] });
    await handler({ Records: [upload("user-docs", "user-1/A/doc.pdf")] });
    expect(lambda.calls()).toHaveLength(0);
  });
});

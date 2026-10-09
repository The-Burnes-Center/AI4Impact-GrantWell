import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const ddb = mockClient(DynamoDBClient);
const sfn = mockClient(SFNClient);

let handler: (event: any) => Promise<{ batchItemFailures: { itemIdentifier: string }[] }>;
beforeAll(async () => {
  vi.stubEnv("STATE_MACHINE_ARN", "arn:aws:states:us-east-1:111111111111:stateMachine:nofo");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("REVIEW_TABLE_NAME", "reviews");
  ({ handler } = await import("../../lib/chatbot-api/functions/nofo-pipeline/dispatcher/index.mjs"));
});

const sqsRecord = (messageId: string, key: string) => ({
  messageId,
  body: JSON.stringify({ Records: [{ s3: { bucket: { name: "nofos" }, object: { key } } }] }),
});

const updates = () => ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input);
const isClaim = (u: any) => String(u.ConditionExpression || "").includes("pipeline_claim_at");
const isRelease = (u: any) => String(u.UpdateExpression).startsWith("REMOVE pipeline_claim_at");

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ddb.reset();
  sfn.reset();
  ddb.on(UpdateItemCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("NOFO pipeline dispatcher", () => {
  it("claims the NOFO, starts one execution with the decoded key and records its ARN", async () => {
    sfn.on(StartExecutionCommand).resolves({ executionArn: "arn:exec:1", startDate: new Date() });

    const res = await handler({ Records: [sqsRecord("m1", "Bridge+Repair%3A+2026/NOFO-File-PDF")] });

    expect(res.batchItemFailures).toEqual([]);
    const start = sfn.commandCalls(StartExecutionCommand)[0].args[0].input;
    expect(JSON.parse(start.input!)).toEqual({
      s3Bucket: "nofos",
      documentKey: "Bridge Repair: 2026/NOFO-File-PDF",
      nofoName: "Bridge Repair: 2026",
      retryCount: 0,
      validationFeedback: null,
    });
    const claim = updates().find(isClaim)!;
    expect(unmarshall(claim.Key!)).toEqual({ nofo_name: "Bridge Repair: 2026" });
    expect(claim.ExpressionAttributeValues![":name"]).toEqual({ S: start.name });
    expect(updates().some((u) => u.ExpressionAttributeValues?.[":arn"]?.S === "arn:exec:1")).toBe(true);
  });

  it("skips a NOFO another run already holds, without failing the message", async () => {
    ddb.on(UpdateItemCommand, { ConditionExpression: "attribute_not_exists(pipeline_claim_at) OR pipeline_claim_at < :staleBefore" })
      .rejects(new ConditionalCheckFailedException({ message: "held", $metadata: {} }));

    const res = await handler({ Records: [sqsRecord("m1", "Grant/NOFO-File-PDF")] });

    expect(res.batchItemFailures).toEqual([]);
    expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
  });

  it("logs pipelineDispatchFailed, releases the claim and retries only the failed message", async () => {
    sfn.on(StartExecutionCommand).callsFake((input) => {
      if (JSON.parse(input.input).nofoName === "Bad") throw new Error("ExecutionLimitExceeded");
      return { executionArn: "arn:exec:ok", startDate: new Date() };
    });

    const res = await handler({ Records: [sqsRecord("m-bad", "Bad/NOFO-File-PDF"), sqsRecord("m-ok", "Good/NOFO-File-PDF")] });

    expect(res.batchItemFailures).toEqual([{ itemIdentifier: "m-bad" }]);
    expect(errors.mock.calls.some(([line]) => line === LOG_MARKERS.pipelineDispatchFailed[0])).toBe(true);
    const released = updates().filter(isRelease).map((u) => unmarshall(u.Key!).nofo_name);
    expect(released).toEqual(["Bad"]);
  });

  it("supersedes open reviews before reprocessing", async () => {
    sfn.on(StartExecutionCommand).resolves({ executionArn: "arn:exec:1", startDate: new Date() });
    ddb.on(QueryCommand).resolves({
      Items: [
        marshall({ nofo_name: "Grant", review_id: "r1", status: "pending_review" }),
        marshall({ nofo_name: "Grant", review_id: "r2", status: "approved" }),
      ],
    });

    await handler({ Records: [sqsRecord("m1", "Grant/NOFO-File-PDF")] });

    const superseded = updates().filter((u) => u.TableName === "reviews").map((u) => unmarshall(u.Key!).review_id);
    expect(superseded).toEqual(["r1"]);
  });
});

import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DescribeExecutionCommand, SFNClient, StartExecutionCommand, StopExecutionCommand } from "@aws-sdk/client-sfn";
import { CopyObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const ddb = mockClient(DynamoDBClient);
const sfn = mockClient(SFNClient);
const s3 = mockClient(S3Client);

let handler: (event: any) => Promise<{ batchItemFailures: { itemIdentifier: string }[] }>;
beforeAll(async () => {
  vi.stubEnv("STATE_MACHINE_ARN", "arn:aws:states:us-east-1:111111111111:stateMachine:nofo");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("REVIEW_TABLE_NAME", "reviews");
  ({ handler } = await import("../../lib/chatbot-api/functions/nofo-pipeline/dispatcher/index.mjs"));
});

const sqsRecord = (messageId: string, key: string, bucket = "nofos", eTag?: string, versionId?: string) => ({
  messageId,
  body: JSON.stringify({ Records: [{ s3: { bucket: { name: bucket }, object: { key, ...(eTag && { eTag }), ...(versionId && { versionId }) } } }] }),
});

const updates = () => ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input);
const isClaim = (u: any) => String(u.ConditionExpression || "").includes("pipeline_claim_at");
const isRelease = (u: any) => String(u.UpdateExpression).startsWith("REMOVE pipeline_claim_at");

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ddb.reset();
  sfn.reset();
  s3.reset();
  ddb.on(UpdateItemCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(GetItemCommand).resolves({});
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
      documentVersionId: null,
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

  describe("a grant that is already live", () => {
    const notFound = () => Object.assign(new Error("Not Found"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    const statusWrites = () => updates().filter((u) => String(u.UpdateExpression).includes("#status = :processing"));
    const stages = () => updates().map((u) => u.ExpressionAttributeValues?.[":s"]?.S).filter(Boolean);
    const STAGED = "_pending/Grant/NOFO-File-PDF";
    const dispatch = async (
      row: Record<string, unknown>,
      record = sqsRecord("m1", STAGED, "grant-artifacts", undefined, "v2"),
      stagedVersion = "v2"
    ) => {
      s3.on(HeadObjectCommand, { Bucket: "grant-artifacts", Key: STAGED }).resolves({ VersionId: stagedVersion });
      ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Grant", ...row }) });
      ddb.on(UpdateItemCommand).callsFake((input) =>
        isClaim(input) ? { Attributes: marshall({ nofo_name: "Grant", ...row }) } : {}
      );
      sfn.on(StartExecutionCommand).resolves({ executionArn: "arn:exec:1", startDate: new Date() });
      return handler({ Records: [record] });
    };
    const started = () => sfn.commandCalls(StartExecutionCommand).map((c) => JSON.parse(c.args[0].input.input!));

    beforeEach(() => {
      vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
      vi.stubEnv("BUCKET", "nofos");
    });
    afterEach(() => {
      vi.stubEnv("ARTIFACTS_BUCKET", "");
      vi.stubEnv("BUCKET", "");
    });

    it.each(["active", "archived"])("keeps a published %s grant's status while its new version runs from _pending/", async (status) => {
      s3.on(HeadObjectCommand).resolves({});
      s3.on(ListObjectsV2Command).resolves({ Contents: [] });

      expect((await dispatch({ status })).batchItemFailures).toEqual([]);

      expect(statusWrites()).toHaveLength(0);
      expect(stages()).toEqual(["uploading"]);
      expect(s3.commandCalls(HeadObjectCommand).map((c) => c.args[0].input)).toContainEqual({ Bucket: "grant-artifacts", Key: "Grant/summary.json" });
      expect(started()).toEqual([
        { s3Bucket: "grant-artifacts", documentKey: STAGED, documentVersionId: "v2", nofoName: "Grant", retryCount: 0, validationFeedback: null },
      ]);
    });

    describe("a newer upload while a staged version is processing", () => {
      const older = { status: "active", pipeline_claim_at: new Date().toISOString(), pipeline_claim_document: `${STAGED}#v1`, pipeline_execution_arn: "arn:exec:old" };
      beforeEach(() => {
        s3.on(HeadObjectCommand).resolves({});
        s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: STAGED }, { Key: "_pending/Grant/raw-text.txt" }] });
        s3.on(DeleteObjectsCommand).resolves({});
        sfn.on(DescribeExecutionCommand).resolves({ status: "RUNNING" });
        sfn.on(StopExecutionCommand).resolves({});
      });

      it("takes over the claim, stops the older run, clears its files and restarts with the newest", async () => {
        ddb.on(QueryCommand).resolves({ Items: [marshall({ nofo_name: "Grant", review_id: "r-old", status: "pending_review" })] });

        expect((await dispatch(older)).batchItemFailures).toEqual([]);

        const claim = updates().find(isClaim)!;
        expect(claim.ConditionExpression).toContain("pipeline_claim_document <> :document");
        expect(claim.ExpressionAttributeValues![":document"]).toEqual({ S: `${STAGED}#v2` });
        expect(sfn.commandCalls(StopExecutionCommand).map((c) => c.args[0].input.executionArn)).toEqual(["arn:exec:old"]);
        const superseded = updates().filter((u) => u.TableName === "reviews").map((u) => unmarshall(u.Key!).review_id);
        expect(superseded).toEqual(["r-old"]);
        const deleted = s3.commandCalls(DeleteObjectsCommand).flatMap((c) => c.args[0].input.Delete!.Objects!.map((o) => o.Key));
        expect(deleted).toEqual(["_pending/Grant/raw-text.txt"]);
        expect(started().map((i) => i.documentVersionId)).toEqual(["v2"]);
      });

      it("treats the same version arriving again as a duplicate", async () => {
        s3.on(HeadObjectCommand, { Key: STAGED }).resolves({ VersionId: "v1" });
        ddb.on(UpdateItemCommand).callsFake((input) => {
          if (isClaim(input)) throw new ConditionalCheckFailedException({ message: "held", $metadata: {} });
          return {};
        });

        const res = await handler({ Records: [sqsRecord("m1", STAGED, "grant-artifacts", undefined, "v1")] });

        expect(res.batchItemFailures).toEqual([]);
        expect(updates().filter(isClaim)).toHaveLength(1);
        expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
        expect(sfn.commandCalls(StopExecutionCommand)).toHaveLength(0);
      });

      it("reads the staged document's version when Reprocess sends no version", async () => {
        await dispatch({ status: "active" }, sqsRecord("m1", STAGED, "grant-artifacts"), "v3");

        expect(started().map((i) => i.documentVersionId)).toEqual(["v3"]);
      });

      it("ignores an older upload's event that arrives after the newer one, leaving the newest run alone", async () => {
        await dispatch(older, sqsRecord("m1", STAGED, "grant-artifacts", undefined, "v1"), "v2");

        expect(updates().filter(isClaim)).toHaveLength(0);
        expect(sfn.commandCalls(StopExecutionCommand)).toHaveLength(0);
        expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
      });

      it("keeps the old rule for a document that isn't staged: a held claim is never taken over", async () => {
        s3.on(HeadObjectCommand).rejects(notFound());

        await dispatch({ status: "processing" }, sqsRecord("m1", "Grant/NOFO-File-PDF", "nofos", undefined, "v9"));

        expect(updates().find(isClaim)!.ConditionExpression).toBe("attribute_not_exists(pipeline_claim_at) OR pipeline_claim_at < :staleBefore");
      });
    });

    it("runs a live grant's published document from a staged copy, not in place", async () => {
      s3.on(HeadObjectCommand).resolves({});
      s3.on(CopyObjectCommand).resolves({});

      const res = await dispatch({ status: "active" }, sqsRecord("m1", "Grant/NOFO-File-TXT"));

      expect(res.batchItemFailures).toEqual([]);
      expect(s3.commandCalls(CopyObjectCommand).map((c) => c.args[0].input)).toEqual([
        { Bucket: "grant-artifacts", CopySource: "nofos/Grant/NOFO-File-TXT", Key: "_pending/Grant/NOFO-File-TXT" },
      ]);
      expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
      expect(updates().filter(isClaim)).toHaveLength(0);
    });

    it("stages the copy when S3 can't say whether the grant is published, so its files are never overwritten", async () => {
      s3.on(HeadObjectCommand).rejects(Object.assign(new Error("Slow down"), { name: "SlowDown" }));
      s3.on(CopyObjectCommand).resolves({});

      await dispatch({ status: "active" }, sqsRecord("m1", "Grant/NOFO-File-PDF"));

      expect(s3.commandCalls(CopyObjectCommand)).toHaveLength(1);
      expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
    });

    it("does not run again on the document publish just swapped in, and forgets its ETag", async () => {
      const res = await dispatch(
        { status: "active", swap_document_etags: new Set(["abc123"]) },
        sqsRecord("m1", "Grant/NOFO-File-PDF", "nofos", "abc123")
      );

      expect(res.batchItemFailures).toEqual([]);
      expect(sfn.commandCalls(StartExecutionCommand)).toHaveLength(0);
      expect(s3.commandCalls(CopyObjectCommand)).toHaveLength(0);
      const consumed = updates().find((u) => String(u.UpdateExpression).startsWith("DELETE swap_document_etags"))!;
      expect(consumed.ExpressionAttributeValues).toEqual({ ":etag": { SS: ["abc123"] } });
      expect(ddb.commandCalls(GetItemCommand)[0].args[0].input.ConsistentRead).toBe(true);
    });

    it("processes other bytes that land on a grant with a recorded ETag as usual", async () => {
      s3.on(HeadObjectCommand).rejects(notFound());

      await dispatch({ status: "processing", swap_document_etags: new Set(["abc123"]) }, sqsRecord("m1", "Grant/NOFO-File-PDF", "nofos", "other"));

      expect(started()).toHaveLength(1);
    });

    it("clears an earlier run's staged files, keeping this run's document and the swap journal", async () => {
      s3.on(HeadObjectCommand).resolves({});
      s3.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: STAGED },
          { Key: "_pending/Grant/NOFO-File-TXT" },
          { Key: "_pending/Grant/raw-text-pages.json" },
          { Key: "_pending/Grant/swap.json" },
        ],
      });
      s3.on(DeleteObjectsCommand).resolves({});

      await dispatch({ status: "active" });

      expect(s3.commandCalls(ListObjectsV2Command)[0].args[0].input).toMatchObject({ Bucket: "grant-artifacts", Prefix: "_pending/Grant/" });
      const deleted = s3.commandCalls(DeleteObjectsCommand).flatMap((c) => c.args[0].input.Delete!.Objects!.map((o) => o.Key));
      expect(deleted).toEqual(["_pending/Grant/NOFO-File-TXT", "_pending/Grant/raw-text-pages.json"]);
    });

    it("finds a summary published before the artifacts bucket existed", async () => {
      s3.on(HeadObjectCommand, { Bucket: "grant-artifacts" }).rejects(notFound());
      s3.on(HeadObjectCommand, { Bucket: "nofos" }).resolves({});

      await dispatch({ status: "active" });

      expect(statusWrites()).toHaveLength(0);
    });

    it("marks an active row with no published summary as processing, as a new grant", async () => {
      s3.on(HeadObjectCommand).rejects(notFound());

      await dispatch({ status: "active" });

      expect(statusWrites()).toHaveLength(1);
    });

    it("keeps a grant held for review held: it has no version users can see", async () => {
      s3.on(HeadObjectCommand).resolves({});

      await dispatch({ status: "quarantined", previous_status: "archived" }, sqsRecord("m1", "Grant/NOFO-File-PDF"));

      expect(statusWrites()).toHaveLength(1);
      expect(s3.commandCalls(HeadObjectCommand)).toHaveLength(0);
    });

    it("falls back to processing when S3 can't say whether a summary is published", async () => {
      s3.on(HeadObjectCommand).rejects(Object.assign(new Error("Slow down"), { name: "SlowDown" }));

      await dispatch({ status: "active" });

      expect(statusWrites()).toHaveLength(1);
    });
  });
});

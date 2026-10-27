import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyArtifacts, copySource, deleteArtifacts, getArtifact, putArtifact, readArtifactText } from "grantwell-shared";

const s3 = mockClient(S3Client);
const client = new S3Client({ region: "us-east-1" });

const body = (text: string) => ({ Body: Readable.from([Buffer.from(text)]) }) as any;
const missing = () => Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
const buckets = () => s3.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Bucket);

beforeEach(() => {
  s3.reset();
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  vi.stubEnv("BUCKET", "nofos");
});

describe("reading a grant's derived files", () => {
  it("reads from the artifacts bucket when the file is there", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts" }).resolves(body("new"));

    expect(await readArtifactText(client, "G/raw-text.txt")).toBe("new");
    expect(buckets()).toEqual(["grant-artifacts"]);
  });

  it("falls back to the grant bucket for a file written before the move", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts" }).rejects(missing());
    s3.on(GetObjectCommand, { Bucket: "nofos" }).resolves(body("old"));

    expect(await readArtifactText(client, "G/summary.json")).toBe("old");
    expect(buckets()).toEqual(["grant-artifacts", "nofos"]);
  });

  it("uses the bucket the caller names as the fallback", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts" }).rejects(missing());
    s3.on(GetObjectCommand, { Bucket: "event-bucket" }).resolves(body("old"));

    expect(await readArtifactText(client, "G/raw-text.txt", "event-bucket")).toBe("old");
  });

  it("does not fall back on an error other than a missing file", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts" }).rejects(Object.assign(new Error("denied"), { name: "AccessDenied" }));

    await expect(getArtifact(client, "G/summary.json")).rejects.toThrow("denied");
    expect(buckets()).toEqual(["grant-artifacts"]);
  });

  it("reports a file missing from both buckets as missing", async () => {
    s3.on(GetObjectCommand).rejects(missing());

    await expect(getArtifact(client, "G/questions.json")).rejects.toMatchObject({ name: "NoSuchKey" });
  });

  it("fails loudly when the function was deployed without the bucket", async () => {
    vi.stubEnv("ARTIFACTS_BUCKET", "");

    await expect(getArtifact(client, "G/summary.json")).rejects.toThrow(/ARTIFACTS_BUCKET/);
  });
});

describe("writing a grant's derived files", () => {
  it("writes only to the artifacts bucket", async () => {
    s3.on(PutObjectCommand).resolves({});

    await putArtifact(client, "G/summary.json", "{}", "application/json");

    expect(s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input)).toEqual([
      { Bucket: "grant-artifacts", Key: "G/summary.json", Body: "{}", ContentType: "application/json" },
    ]);
  });
});

describe("moving a grant's derived files", () => {
  it("copies every file under the grant to the new name", async () => {
    s3.on(ListObjectsV2Command, { ContinuationToken: undefined })
      .resolves({ Contents: [{ Key: "Old/summary.json" }], IsTruncated: true, NextContinuationToken: "t" });
    s3.on(ListObjectsV2Command, { ContinuationToken: "t" }).resolves({ Contents: [{ Key: "Old/questions.json" }] });
    s3.on(CopyObjectCommand).resolves({});

    expect(await copyArtifacts(client, "Old", "New (Massachusetts)")).toBe(2);
    expect(s3.commandCalls(ListObjectsV2Command)[0].args[0].input).toMatchObject({ Bucket: "grant-artifacts", Prefix: "Old/" });
    expect(s3.commandCalls(CopyObjectCommand).map((c) => c.args[0].input)).toEqual([
      { Bucket: "grant-artifacts", CopySource: "grant-artifacts/Old/summary.json", Key: "New (Massachusetts)/summary.json" },
      { Bucket: "grant-artifacts", CopySource: "grant-artifacts/Old/questions.json", Key: "New (Massachusetts)/questions.json" },
    ]);
  });

  it("encodes a grant name's special characters in the copy source", () => {
    expect(copySource("b", "AI & Tech: 100% #1?/summary.json")).toBe("b/AI%20%26%20Tech%3A%20100%25%20%231%3F/summary.json");
  });

  it("deletes every file under the grant, in batches S3 accepts", async () => {
    const keys = Array.from({ length: 1001 }, (_, i) => ({ Key: `G/f${i}` }));
    s3.on(ListObjectsV2Command).resolves({ Contents: keys });
    s3.on(DeleteObjectsCommand).resolves({});

    expect(await deleteArtifacts(client, "G")).toBe(1001);
    const batches = s3.commandCalls(DeleteObjectsCommand).map((c) => c.args[0].input);
    expect(batches.map((b) => [b.Bucket, b.Delete!.Objects!.length])).toEqual([["grant-artifacts", 1000], ["grant-artifacts", 1]]);
  });

  it("deletes nothing for a grant with no derived files", async () => {
    s3.on(ListObjectsV2Command).resolves({});

    expect(await deleteArtifacts(client, "G")).toBe(0);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });
});

import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const s3 = mockClient(S3Client);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
let reviewFlagResolved: (flag: any, summary: any) => boolean;
beforeAll(async () => {
  vi.stubEnv("BUCKET", "nofos-bucket");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("ENABLE_DYNAMODB_CACHE", "true");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }]));
  ({ handler, reviewFlagResolved } = await import(
    "../../lib/chatbot-api/functions/landing-page/nofo-summary-update/index.mjs"
  ));
});

const section = (item: string) => ({ item, description: `${item} details` });
const flag = (missingCategories: string[]) => ({ reason: "partial_extraction", missingCategories, flaggedAt: "2026-10-14T00:00:00Z" });

function given(meta: Record<string, unknown>, summary: Record<string, unknown>) {
  ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Grant A", status: "active", scope: "state", state: "MA", ...meta }) });
  s3.on(GetObjectCommand).callsFake(() => ({ Body: Readable.from([Buffer.from(JSON.stringify(summary))]) }));
}

const save = (summary: Record<string, unknown>) =>
  handler({
    requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { "custom:role": '["Developer"]' } } } },
    body: JSON.stringify({ nofoName: "Grant A", summary }),
  });

const updateExpressions = () => ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input.UpdateExpression);

beforeEach(() => {
  for (const m of [s3, ddb, lambda]) m.reset();
  s3.on(PutObjectCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("nofo-summary-update review flag", () => {
  it("clears the flag once every flagged section has content", async () => {
    given({ review_flag: flag(["ProjectNarrativeSections"]) }, { ProjectNarrativeSections: [], KeyDeadlines: [section("Due")] });

    const res = await save({ ProjectNarrativeSections: [section("Project Description")] });

    expect(res.statusCode).toBe(200);
    expect(updateExpressions()).toEqual([expect.stringMatching(/ REMOVE review_flag$/)]);
  });

  it("keeps the flag while another flagged section is still empty", async () => {
    given({ review_flag: flag(["ProjectNarrativeSections", "EligibilityCriteria"]) }, { EligibilityCriteria: [] });

    await save({ ProjectNarrativeSections: [section("Work Plan")] });

    expect(updateExpressions()).toEqual([expect.not.stringContaining("REMOVE")]);
  });

  it("leaves unflagged grants alone", async () => {
    given({}, { ProjectNarrativeSections: [section("Narrative")] });

    await save({ Agency: "EOHLC" });

    expect(updateExpressions()).toEqual([expect.not.stringContaining("REMOVE")]);
  });

  it("does not treat blank or removed rows as filled", () => {
    expect(reviewFlagResolved(flag(["ProjectNarrativeSections"]), { ProjectNarrativeSections: [{ item: "  ", description: "x" }] })).toBe(false);
    expect(reviewFlagResolved(flag([]), { ProjectNarrativeSections: [section("A")] })).toBe(false);
    expect(reviewFlagResolved(null, { ProjectNarrativeSections: [section("A")] })).toBe(false);
  });
});

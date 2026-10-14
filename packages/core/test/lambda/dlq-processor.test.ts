import { mockClient } from "aws-sdk-client-mock";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ddb = mockClient(DynamoDBClient);
const sqs = mockClient(SQSClient);

const ENV = {
  DLQ_URL: "https://sqs/pipeline-dlq",
  SCRAPER_DLQ_URL: "https://sqs/scraper-dlq",
  REVIEW_TABLE_NAME: "reviews",
  NOFO_METADATA_TABLE_NAME: "nofos",
};

async function load() {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import("../../lib/chatbot-api/functions/nofo-pipeline/dlq-processor/index.mjs")).handler;
}

const NOW = "2026-10-14T13:00:00.000Z";
const TTL = Math.floor(Date.parse(NOW) / 1000) + 90 * 86400;

// One message per run on the given DLQ (scraper by default); the other stays empty.
function queue(body: unknown, receiveCount = "4", queueUrl = ENV.SCRAPER_DLQ_URL) {
  sqs.on(ReceiveMessageCommand).resolves({});
  sqs
    .on(ReceiveMessageCommand, { QueueUrl: queueUrl })
    .resolvesOnce({
      Messages: [
        {
          Body: typeof body === "string" ? body : JSON.stringify(body),
          ReceiptHandle: "rh-1",
          Attributes: { ApproximateReceiveCount: receiveCount },
        },
      ],
    })
    .resolves({});
  sqs.on(DeleteMessageCommand).resolves({});
}

function serveReviews(rows: Record<string, unknown>[]) {
  ddb.on(QueryCommand).callsFake((input) => {
    const name = unmarshall(input.ExpressionAttributeValues)[":name"];
    return { Items: rows.filter((r) => r.nofo_name === name).map((r) => marshall(r)) };
  });
}

const reviewUpdates = () =>
  ddb
    .commandCalls(UpdateItemCommand)
    .map((c) => c.args[0].input)
    .filter((i) => i.TableName === "reviews");
const puts = () => ddb.commandCalls(PutItemCommand).map((c) => unmarshall(c.args[0].input.Item!));

beforeEach(() => {
  ddb.reset();
  sqs.reset();
  ddb.on(UpdateItemCommand).resolves({});
  ddb.on(PutItemCommand).resolves({});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe("DLQ processor", () => {
  it("writes a new failed row with failure_count 1 for a first failure", async () => {
    queue({ opportunityTitle: "Stuck Grant", detail: "boom" });
    serveReviews([{ nofo_name: "Stuck Grant", review_id: "old", status: "approved", source: "scraper-dlq" }]);

    const result = await (await load())();

    expect(result).toEqual({ processedCount: 1, pipelineCount: 0, scraperCount: 1 });
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({
      nofo_name: "Stuck Grant",
      status: "failed",
      source: "scraper-dlq",
      created_at: NOW,
      last_failed_at: NOW,
      failure_count: 1,
      retryCount: 4,
      ttl: TTL,
    });
    expect(puts()[0].review_id).not.toBe("old");
    expect(reviewUpdates()).toHaveLength(0);
    expect(sqs.commandCalls(DeleteMessageCommand)[0].args[0].input).toEqual({
      QueueUrl: ENV.SCRAPER_DLQ_URL,
      ReceiptHandle: "rh-1",
    });
  });

  it("refreshes the open failed row of the same source instead of adding another", async () => {
    const body = { opportunityTitle: "Stuck Grant", detail: "x".repeat(1500) };
    queue(body, "5");
    serveReviews([
      { nofo_name: "Stuck Grant", review_id: "pipeline-row", status: "failed", source: "dlq" },
      { nofo_name: "Stuck Grant", review_id: "open-row", status: "failed", source: "scraper-dlq" },
    ]);

    const result = await (await load())();

    expect(result.scraperCount).toBe(1);
    expect(puts()).toHaveLength(0);
    const [update] = reviewUpdates();
    expect(reviewUpdates()).toHaveLength(1);
    expect(unmarshall(update.Key!)).toEqual({ nofo_name: "Stuck Grant", review_id: "open-row" });
    expect(update.UpdateExpression).toContain("failure_count = if_not_exists(failure_count, :one) + :one");
    expect(update.ConditionExpression).toBe("#status = :failed");
    expect(unmarshall(update.ExpressionAttributeValues!)).toEqual({
      ":err": JSON.stringify(body).substring(0, 1000),
      ":retry": 5,
      ":now": NOW,
      ":ttl": TTL,
      ":one": 1,
      ":failed": "failed",
    });
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(1);
  });

  it("follows LastEvaluatedKey to find the open row", async () => {
    queue({ opportunityTitle: "Busy Grant" });
    ddb
      .on(QueryCommand)
      .resolvesOnce({
        Items: [marshall({ nofo_name: "Busy Grant", review_id: "a", status: "rejected", source: "scraper-dlq" })],
        LastEvaluatedKey: marshall({ nofo_name: "Busy Grant", review_id: "a" }),
      })
      .resolvesOnce({
        Items: [marshall({ nofo_name: "Busy Grant", review_id: "b", status: "failed", source: "scraper-dlq" })],
      });

    await (await load())();

    const queries = ddb.commandCalls(QueryCommand).map((c) => c.args[0].input);
    expect(queries).toHaveLength(2);
    expect(queries[0].KeyConditionExpression).toBe("nofo_name = :name");
    expect(unmarshall(queries[1].ExclusiveStartKey!)).toEqual({ nofo_name: "Busy Grant", review_id: "a" });
    expect(unmarshall(reviewUpdates()[0].Key!).review_id).toBe("b");
    expect(puts()).toHaveLength(0);
  });

  it("puts a new row when the only matches are another source or no longer failed", async () => {
    queue({ opportunityTitle: "Stuck Grant" });
    serveReviews([
      { nofo_name: "Stuck Grant", review_id: "pipeline-row", status: "failed", source: "dlq" },
      { nofo_name: "Stuck Grant", review_id: "reviewed-row", status: "rejected", source: "scraper-dlq" },
    ]);

    await (await load())();

    expect(reviewUpdates()).toHaveLength(0);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({ source: "scraper-dlq", failure_count: 1 });
  });

  it("falls back to a new row when the open row was resolved between the read and the update", async () => {
    queue({ opportunityTitle: "Stuck Grant" });
    serveReviews([{ nofo_name: "Stuck Grant", review_id: "open-row", status: "failed", source: "scraper-dlq" }]);
    ddb
      .on(UpdateItemCommand, { TableName: "reviews" })
      .rejects(new ConditionalCheckFailedException({ message: "changed", $metadata: {} }));

    const result = await (await load())();

    expect(reviewUpdates()).toHaveLength(1);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({ nofo_name: "Stuck Grant", failure_count: 1 });
    expect(puts()[0].review_id).not.toBe("open-row");
    expect(result.scraperCount).toBe(1);
  });

  it("always puts a new row for an unknown grant, without looking for one to reuse", async () => {
    queue("not json");
    serveReviews([{ nofo_name: "unknown", review_id: "old", status: "failed", source: "scraper-dlq" }]);

    await (await load())();

    expect(ddb.commandCalls(QueryCommand)).toHaveLength(0);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({ nofo_name: "unknown", errorMessage: "not json", failure_count: 1 });
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
  });

  const metaUpdates = () =>
    ddb
      .commandCalls(UpdateItemCommand)
      .map((c) => c.args[0].input)
      .filter((i) => i.TableName === "nofos");
  const s3Event = (key: string) => ({ Records: [{ s3: { object: { key: encodeURIComponent(key) } } }] });

  it("quarantines an existing grant whose pipeline run landed in the DLQ", async () => {
    queue(s3Event("Broken Grant/NOFO-File-PDF"), "3", ENV.DLQ_URL);
    serveReviews([]);
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Broken Grant" }) });

    await (await load())();

    expect(puts()[0]).toMatchObject({ nofo_name: "Broken Grant", source: "dlq", status: "failed" });
    expect(metaUpdates()).toHaveLength(3);
    expect(metaUpdates().every((i) => unmarshall(i.Key!).nofo_name === "Broken Grant")).toBe(true);
  });

  it("doesn't create a metadata row for a pipeline failure whose grant has none", async () => {
    queue(s3Event("Never Ingested/NOFO-File-PDF"), "3", ENV.DLQ_URL);
    serveReviews([]);
    ddb.on(GetItemCommand).resolves({});

    await (await load())();

    expect(puts()).toHaveLength(1);
    expect(metaUpdates()).toHaveLength(0);
  });

  it("leaves metadata alone for scraper failures, which may be a live grant's failed refresh", async () => {
    queue({ opportunityTitle: "Live Grant" });
    serveReviews([{ nofo_name: "Live Grant", review_id: "open-row", status: "failed", source: "scraper-dlq" }]);
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Live Grant" }) });

    await (await load())();

    expect(reviewUpdates()).toHaveLength(1);
    expect(metaUpdates()).toHaveLength(0);
    expect(ddb.commandCalls(GetItemCommand)).toHaveLength(0);
  });
});

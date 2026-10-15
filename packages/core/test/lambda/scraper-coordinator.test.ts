import { mockClient } from "aws-sdk-client-mock";
import { BatchGetItemCommand, DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import { marshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const ddb = mockClient(DynamoDBClient);
const sqs = mockClient(SQSClient);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  vi.stubEnv("GRANTS_GOV_API_KEY", "key");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("SCRAPER_DOWNLOAD_QUEUE_URL", "https://sqs.example/queue");
  ({ handler } = await import("../../lib/chatbot-api/functions/nofo-scraper/coordinator/index.mjs"));
});

/** One Simpler.Grants.gov search response per call, then empty pages. */
function grantsApi(...pages: unknown[]) {
  const queue = [...pages];
  return vi.fn(async (_url: string, _init: any) => ({
    ok: true,
    json: async () => (queue.length ? queue.shift() : { data: [] }),
  }));
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  ddb.reset();
  sqs.reset();
  sqs.on(SendMessageBatchCommand).resolves({ Successful: [], Failed: [] });
  ddb.on(QueryCommand).resolves({ Items: [] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("grants.gov scraper coordinator", () => {
  it("queues new and updated opportunities and skips unchanged ones", async () => {
    vi.stubGlobal(
      "fetch",
      grantsApi({
        data: [
          { opportunity_id: 1, opportunity_title: "New Grant", updated_at: "2026-10-01" },
          { opportunity_id: 2, opportunity_title: "Changed Grant", updated_at: "2026-10-05" },
          { opportunity_id: 3, opportunity_title: "Same Grant", updated_at: "2026-09-01" },
        ],
      })
    );
    ddb.on(BatchGetItemCommand).resolves({
      Responses: {
        nofos: [
          marshall({ nofo_name: "Changed Grant", source_updated_at: "2026-09-30" }),
          marshall({ nofo_name: "Same Grant", source_updated_at: "2026-09-01" }),
        ],
      },
    });

    const res = await handler({ source: "aws.events" });

    expect(JSON.parse(res.body)).toMatchObject({ totalChecked: 3, newQueued: 1, updatedQueued: 1, skipped: 1, errors: 0 });
    const queued = sqs.commandCalls(SendMessageBatchCommand).flatMap((c) => c.args[0].input.Entries!.map((e) => JSON.parse(e.MessageBody!)));
    expect(queued).toEqual([
      { opportunityId: 1, opportunityTitle: "New Grant", isUpdate: false, apiUpdatedAt: "2026-10-01" },
      { opportunityId: 2, opportunityTitle: "Changed Grant", isUpdate: true, apiUpdatedAt: "2026-10-05" },
    ]);
  });

  it("matches a retitled grant by opportunity_id and updates it under its stored name", async () => {
    vi.stubGlobal(
      "fetch",
      grantsApi({
        data: [
          { opportunity_id: "a1", opportunity_title: "Renamed Changed Grant", updated_at: "2026-10-05" },
          { opportunity_id: "b2", opportunity_title: "Renamed Same Grant", updated_at: "2026-09-01" },
          { opportunity_id: "c3", opportunity_title: "Brand New Grant", updated_at: "2026-10-01" },
        ],
      })
    );
    ddb.on(BatchGetItemCommand).resolves({ Responses: { nofos: [] } });
    const stored: Record<string, Record<string, string>> = {
      a1: { nofo_name: "Old Changed Grant", opportunity_id: "a1", source_updated_at: "2026-09-30" },
      b2: { nofo_name: "Old Same Grant", opportunity_id: "b2", source_updated_at: "2026-09-01" },
    };
    ddb.on(QueryCommand).callsFake((input) => {
      const row = stored[input.ExpressionAttributeValues[":id"].S];
      return { Items: row ? [marshall(row)] : [] };
    });

    const res = await handler({ source: "aws.events" });

    expect(JSON.parse(res.body)).toMatchObject({ newQueued: 1, updatedQueued: 1, skipped: 1 });
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input.IndexName).toBe("OpportunityIdIndex");
    const queued = sqs.commandCalls(SendMessageBatchCommand).flatMap((c) => c.args[0].input.Entries!.map((e) => JSON.parse(e.MessageBody!)));
    expect(queued).toEqual([
      { opportunityId: "a1", opportunityTitle: "Renamed Changed Grant", isUpdate: true, apiUpdatedAt: "2026-10-05", nofoName: "Old Changed Grant" },
      { opportunityId: "c3", opportunityTitle: "Brand New Grant", isUpdate: false, apiUpdatedAt: "2026-10-01" },
    ]);
  });

  it("re-queues a grants.gov grant whose row was written but whose file never landed", async () => {
    vi.stubGlobal(
      "fetch",
      grantsApi({
        data: [
          { opportunity_id: "n1", opportunity_title: "Upload Failed Grant", updated_at: "2026-10-01" },
          { opportunity_id: "r2", opportunity_title: "Renamed Upload Failed Grant", updated_at: "2026-10-01" },
        ],
      })
    );
    ddb.on(BatchGetItemCommand).resolves({
      Responses: { nofos: [marshall({ nofo_name: "Upload Failed Grant", opportunity_id: "n1", status: "active" })] },
    });
    ddb.on(QueryCommand).callsFake((input) =>
      input.ExpressionAttributeValues[":id"].S === "r2"
        ? { Items: [marshall({ nofo_name: "Old Upload Failed Grant", opportunity_id: "r2", status: "active" })] }
        : { Items: [] }
    );

    const res = await handler({ source: "aws.events" });

    expect(JSON.parse(res.body)).toMatchObject({ newQueued: 2, updatedQueued: 0, skipped: 0 });
    const queued = sqs.commandCalls(SendMessageBatchCommand).flatMap((c) => c.args[0].input.Entries!.map((e) => JSON.parse(e.MessageBody!)));
    expect(queued).toEqual([
      { opportunityId: "n1", opportunityTitle: "Upload Failed Grant", isUpdate: false, apiUpdatedAt: "2026-10-01" },
      { opportunityId: "r2", opportunityTitle: "Renamed Upload Failed Grant", isUpdate: false, apiUpdatedAt: "2026-10-01", nofoName: "Old Upload Failed Grant" },
    ]);
  });

  it("leaves rows with no source date alone unless they are this opportunity's live scraper row", async () => {
    vi.stubGlobal(
      "fetch",
      grantsApi({
        data: [
          { opportunity_id: "a1", opportunity_title: "Archived Stub", updated_at: "2026-10-01" },
          { opportunity_id: "m2", opportunity_title: "Manual State Grant", updated_at: "2026-10-01" },
          { opportunity_id: "o3", opportunity_title: "Other Opportunity Grant", updated_at: "2026-10-01" },
          { opportunity_id: "d4", opportunity_title: "Undated Grant" },
        ],
      })
    );
    ddb.on(BatchGetItemCommand).resolves({
      Responses: {
        nofos: [
          marshall({ nofo_name: "Archived Stub", opportunity_id: "a1", status: "archived" }),
          marshall({ nofo_name: "Manual State Grant", scope: "state", state: "MA", status: "active" }),
          marshall({ nofo_name: "Other Opportunity Grant", opportunity_id: "x9", status: "active" }),
          marshall({ nofo_name: "Undated Grant", opportunity_id: "d4", status: "active", source_updated_at: null }),
        ],
      },
    });

    const res = await handler({ source: "aws.events" });

    expect(JSON.parse(res.body)).toMatchObject({ newQueued: 0, updatedQueued: 0, skipped: 4 });
    expect(sqs.commandCalls(SendMessageBatchCommand)).toHaveLength(0);
  });

  it("treats a failed opportunity_id lookup as new, so a missing index doesn't stop the scrape", async () => {
    vi.stubGlobal("fetch", grantsApi({ data: [{ opportunity_id: "z9", opportunity_title: "Grant", updated_at: "2026-10-01" }] }));
    ddb.on(BatchGetItemCommand).resolves({ Responses: { nofos: [] } });
    ddb.on(QueryCommand).rejects(new Error("The table does not have the specified index: OpportunityIdIndex"));

    const res = await handler({ source: "aws.events" });

    expect(JSON.parse(res.body)).toMatchObject({ newQueued: 1, errors: 0 });
  });

  it("logs scraperFatal and reports an error when the API changes shape", async () => {
    vi.stubGlobal("fetch", grantsApi({ data: { opportunities: [] } }));

    const res = await handler({ source: "aws.events" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).errors).toBe(1);
    expect(errors.mock.calls.some(([line]) => line === LOG_MARKERS.scraperFatal[0])).toBe(true);
    expect(sqs.calls()).toHaveLength(0);
  });

  it("refuses a manual run from a non-admin, before calling grants.gov", async () => {
    const api = grantsApi();
    vi.stubGlobal("fetch", api);
    const res = await handler({ requestContext: { authorizer: { jwt: { claims: { "custom:role": '["User"]' } } } } });
    expect(res.statusCode).toBe(403);
    expect(api).not.toHaveBeenCalled();
  });
});

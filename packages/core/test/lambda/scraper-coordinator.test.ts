import { mockClient } from "aws-sdk-client-mock";
import { BatchGetItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
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

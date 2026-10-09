import { mockClient } from "aws-sdk-client-mock";
import {
  BatchGetItemCommand,
  BatchWriteItemCommand,
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ddb = mockClient(DynamoDBClient);

const ENV = {
  REVIEW_TABLE_NAME: "reviews",
  NOFO_METADATA_TABLE_NAME: "nofos",
  SUPPORTED_STATES: JSON.stringify([
    { code: "MA", name: "Massachusetts" },
    { code: "CO", name: "Colorado" },
  ]),
};

async function load(env: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ...ENV, ...env })) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import("../../lib/chatbot-api/functions/nofo-pipeline/admin/index.mjs")).handler;
}

type Review = { nofo_name: string; review_id: string; status: string; created_at: string };
type Meta = Record<string, unknown>;

const review = (nofo_name: string, status: string, created_at = "2026-10-01T12:00:00Z"): Review => ({
  nofo_name,
  review_id: `${nofo_name}-r`,
  status,
  created_at,
});

// "Today" is 2026-10-09 in Eastern time for every test unless one moves the clock.
const REVIEWS: Review[] = [
  review("Far Grant", "pending_review"),
  review("Old Grant", "pending_review"),
  review("Soon Grant", "pending_review", "2026-09-20T12:00:00Z"),
  review("No Deadline Grant", "pending_review"),
  review("Other State Expired", "pending_review"),
  review("Later Grant", "pending_review"),
  review("Failed Expired", "failed"),
  review("Rolling Grant", "needs_reupload"),
  review("Approved Expired", "approved"),
];
const META: Meta[] = [
  { nofo_name: "Soon Grant", expiration_date: "2026-10-12", status: "active", scope: "state", state: "MA" },
  { nofo_name: "Later Grant", expiration_date: "2026-11-01", status: "active", scope: "federal" },
  { nofo_name: "Far Grant", expiration_date: "2027-01-01", status: "active", scope: "state", state: "MA" },
  { nofo_name: "Old Grant", expiration_date: "2026-09-01", status: "archived", scope: "state", state: "MA" },
  { nofo_name: "Failed Expired", expiration_date: "2026-10-08T23:59:59Z", status: "active", scope: "federal" },
  { nofo_name: "Rolling Grant", expiration_date: "2026-01-01", is_rolling: "true", status: "active", scope: "state", state: "MA" },
  { nofo_name: "Other State Expired", expiration_date: "2026-08-01", status: "active", scope: "state", state: "CO" },
  { nofo_name: "Approved Expired", expiration_date: "2026-01-01", status: "active", scope: "state", state: "MA" },
];

function serve(reviews: Review[] = REVIEWS, meta: Meta[] = META) {
  ddb.on(QueryCommand).callsFake((input) => {
    const status = unmarshall(input.ExpressionAttributeValues)[":status"];
    return { Items: reviews.filter((r) => r.status === status).map((r) => marshall(r)) };
  });
  ddb.on(ScanCommand).resolves({ Items: reviews.map((r) => marshall(r)) });
  ddb.on(BatchGetItemCommand).callsFake((input) => {
    const [table, req] = Object.entries(input.RequestItems as Record<string, { Keys: any[] }>)[0];
    const names = new Set(req.Keys.map((k) => unmarshall(k).nofo_name));
    return { Responses: { [table]: meta.filter((m) => names.has(m.nofo_name)).map((m) => marshall(m)) } };
  });
  ddb.on(UpdateItemCommand).resolves({});
}

const event = (
  method: string,
  path: string,
  opts: { roles?: string[]; state?: string; query?: Record<string, string> } = {}
) => ({
  requestContext: {
    http: { method, path },
    authorizer: {
      jwt: {
        claims: {
          "custom:role": JSON.stringify(opts.roles ?? ["Admin"]),
          ...(opts.state ? { "custom:state": opts.state } : {}),
          email: "admin@example.org",
        },
      },
    },
  },
  queryStringParameters: opts.query,
});

const list = async (handler: any, opts = {}) => {
  const res = await handler(event("GET", "/admin/processing-reviews", opts));
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
};

const closeExpired = async (handler: any, opts = {}) =>
  handler(event("POST", "/admin/processing-reviews/close-expired", opts));

const updates = () => ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input);

beforeEach(() => {
  ddb.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T14:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe("deadline helpers", () => {
  it("counts days in Eastern time, so late evening still belongs to that day", async () => {
    const { grantDeadline } = await import("grantwell-shared");
    const lateEvening = new Date("2026-10-10T02:30:00Z"); // 22:30 on Oct 9 in New York
    expect(grantDeadline({ expiration_date: "2026-10-09" }, lateEvening)).toEqual({
      deadline: "2026-10-09",
      daysLeft: 0,
      urgency: "due_soon",
    });
    expect(grantDeadline({ expiration_date: "2026-10-08T23:59:59Z" }, lateEvening).urgency).toBe("expired");
  });

  it("labels ≤7 days, ≤30 days and past, and nothing further out or unknown", async () => {
    const { grantDeadline, deadlineLabel } = await import("grantwell-shared");
    const label = (d: string | undefined) => deadlineLabel(grantDeadline(d ? { expiration_date: d } : undefined));
    expect(label("2026-10-09")).toBe("Due today");
    expect(label("2026-10-10")).toBe("Due in 1 day");
    expect(label("2026-10-16")).toBe("Due in 7 days");
    expect(grantDeadline({ expiration_date: "2026-10-17" }).urgency).toBe("upcoming");
    expect(label("2026-11-08")).toBe("Due in 30 days");
    expect(label("2026-11-09")).toBe("");
    expect(label("2026-10-08")).toBe("Expired");
    expect(label(undefined)).toBe("");
    expect(label("not a date")).toBe("");
    expect(label("2026-02-30")).toBe("");
  });

  it("treats a rolling grant as having no deadline", async () => {
    const { grantDeadline } = await import("grantwell-shared");
    expect(grantDeadline({ expiration_date: "2020-01-01", is_rolling: true }).urgency).toBeNull();
  });
});

describe("GET /admin/processing-reviews", () => {
  it("joins each review with its grant's deadline and orders soonest first, unknown next, expired last", async () => {
    serve();
    const body = await list(await load());

    expect(body.reviews.map((r: any) => r.nofo_name)).toEqual([
      "Soon Grant",
      "Later Grant",
      "Far Grant",
      "No Deadline Grant",
      "Old Grant",
      "Other State Expired",
    ]);
    expect(body.reviews[0]).toMatchObject({ deadline: "2026-10-12", daysLeft: 3, deadlineUrgency: "due_soon", grantStatus: "active" });
    expect(body.reviews[3]).toMatchObject({ deadline: null, daysLeft: null, deadlineUrgency: null, grantStatus: null });
    expect(body.reviews[4]).toMatchObject({ deadlineUrgency: "expired", grantStatus: "archived" });
    // Pending, failed and needs re-upload all count; approved never does.
    expect(body.expiredOpenCount).toBe(3);
  });

  it("reads metadata with one projected BatchGetItem", async () => {
    serve();
    await list(await load());
    const calls = ddb.commandCalls(BatchGetItemCommand);
    expect(calls).toHaveLength(1);
    const req = calls[0].args[0].input.RequestItems!.nofos;
    expect(req.ProjectionExpression).toBe("#n, #e, #s, #sc, #st, #r");
    expect(Object.values(req.ExpressionAttributeNames!)).toContain("expiration_date");
  });

  it("shows a state admin only their state's grants, and counts only those", async () => {
    serve();
    const body = await list(await load(), { state: "MA" });
    expect(body.reviews.map((r: any) => r.nofo_name)).toEqual(["Soon Grant", "Far Grant", "Old Grant"]);
    expect(body.expiredOpenCount).toBe(1);
  });

  it("orders status=all the same way", async () => {
    serve();
    const body = await list(await load(), { query: { status: "all" } });
    expect(body.reviews[0].nofo_name).toBe("Soon Grant");
    expect(body.reviews.at(-1).nofo_name).toBe("Approved Expired");
    expect(body.expiredOpenCount).toBe(3);
  });

  it("still lists reviews without deadlines when metadata can't be read, and hides them from a state admin", async () => {
    serve();
    ddb.on(BatchGetItemCommand).rejects(new Error("throttled"));
    const handler = await load();
    const body = await list(handler);
    expect(body.reviews).toHaveLength(6);
    expect(body.reviews.every((r: any) => r.deadline === null)).toBe(true);
    expect(body.expiredOpenCount).toBe(0);
    expect((await list(handler, { state: "MA" })).reviews).toEqual([]);
  });

  it("asks for at most 100 keys per batch and retries unprocessed keys", async () => {
    const many = Array.from({ length: 150 }, (_, i) => review(`Grant ${i}`, "pending_review"));
    serve(many, many.map((r) => ({ nofo_name: r.nofo_name, expiration_date: "2026-12-01" })));
    let first = true;
    ddb.on(BatchGetItemCommand).callsFake((input) => {
      const keys = input.RequestItems.nofos.Keys;
      if (first) {
        first = false;
        return { Responses: { nofos: [] }, UnprocessedKeys: { nofos: { Keys: keys } } };
      }
      return {
        Responses: {
          nofos: keys.map((k: any) => marshall({ nofo_name: unmarshall(k).nofo_name, expiration_date: "2026-12-01" })),
        },
      };
    });
    const body = await list(await load());
    const sizes = ddb.commandCalls(BatchGetItemCommand).map((c) => c.args[0].input.RequestItems!.nofos.Keys!.length);
    expect(sizes).toEqual([100, 100, 50]);
    expect(body.reviews.every((r: any) => r.deadline === "2026-12-01")).toBe(true);
  });
});

describe("POST /admin/processing-reviews/close-expired", () => {
  it("supersedes every open review on an expired grant, recording who and when, and writes nothing else", async () => {
    serve();
    const res = await closeExpired(await load());

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ closed: 3 });
    const written = updates();
    expect(written.map((u) => unmarshall(u.Key!).nofo_name).sort()).toEqual(["Failed Expired", "Old Grant", "Other State Expired"]);
    for (const u of written) {
      expect(u.TableName).toBe("reviews");
      expect(u.ConditionExpression).toBe("#s = :was");
      expect(unmarshall(u.ExpressionAttributeValues!)).toMatchObject({
        ":closed": "superseded",
        ":by": "admin@example.org",
        ":now": "2026-10-09T14:00:00.000Z",
        ":notes": "Closed: grant expired",
      });
    }
    for (const cmd of [PutItemCommand, DeleteItemCommand, BatchWriteItemCommand]) {
      expect(ddb.commandCalls(cmd)).toHaveLength(0);
    }
  });

  it("only closes a state admin's own state's grants", async () => {
    serve();
    const res = await closeExpired(await load(), { state: "MA" });
    expect(JSON.parse(res.body)).toEqual({ closed: 1 });
    expect(updates().map((u) => unmarshall(u.Key!).nofo_name)).toEqual(["Old Grant"]);
  });

  it("skips a review someone else acted on in the meantime", async () => {
    serve();
    ddb
      .on(UpdateItemCommand, { Key: marshall({ nofo_name: "Old Grant", review_id: "Old Grant-r" }) })
      .rejects(new ConditionalCheckFailedException({ message: "changed", $metadata: {} }));
    const res = await closeExpired(await load());
    expect(JSON.parse(res.body)).toEqual({ closed: 2 });
  });

  it("refuses an admin with no edit authority over grants", async () => {
    serve();
    const res = await closeExpired(await load({ LEGACY_STATELESS_ADMIN_IS_PLATFORM: "false" }));
    expect(res.statusCode).toBe(403);
    expect(updates()).toHaveLength(0);
  });

  it("refuses a non-admin before reading anything", async () => {
    serve();
    const res = await closeExpired(await load(), { roles: ["User"] });
    expect(res.statusCode).toBe(403);
    expect(ddb.calls()).toHaveLength(0);
  });
});

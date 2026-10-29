import { mockClient } from "aws-sdk-client-mock";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  BatchGetItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-27T15:00:00Z");

async function load(env: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({
    OUTCOME_TABLE_NAME: "outcomes",
    DRAFT_TABLE_NAME: "drafts",
    NOFO_METADATA_TABLE_NAME: "nofos",
    ANALYTICS_TABLE_NAME: "analytics",
    USER_POOL_ID: "pool",
    SUPPORTED_STATES: JSON.stringify([{ code: "CO", name: "Colorado" }, { code: "MA", name: "Massachusetts" }]),
    ...env,
  }))
    vi.stubEnv(k, v);
  vi.resetModules();
  return import("../../lib/chatbot-api/functions/application-outcomes/index.mjs");
}

const event = (routeKey: string, opts: { body?: unknown; claims?: Record<string, string>; sessionId?: string; query?: Record<string, string> } = {}) => ({
  routeKey,
  requestContext: {
    http: { method: routeKey.split(" ")[0] },
    authorizer: { jwt: { claims: { sub: "sub-1", "custom:state": "CO", "custom:role": '["User"]', ...opts.claims } } },
  },
  ...(opts.sessionId && { pathParameters: { sessionId: opts.sessionId } }),
  ...(opts.query && { queryStringParameters: opts.query }),
  ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
});

const call = async (handler: any, e: any) => {
  const res = await handler(e);
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

type Row = Record<string, any>;
// Rows by table; Query matches user_id, GetItem the full key, BatchGetItem nofo_name.
function serve(tables: Record<string, Row[]>) {
  const matches = (key: Row) => (row: Row) => Object.entries(key).every(([k, v]) => row[k] === v);
  ddb.on(QueryCommand).callsFake((input) => {
    const user = unmarshall(input.ExpressionAttributeValues)[":u"];
    return { Items: (tables[input.TableName] || []).filter((r) => r.user_id === user).map((r) => marshall(r)) };
  });
  ddb.on(GetItemCommand).callsFake((input) => {
    const row = (tables[input.TableName] || []).find(matches(unmarshall(input.Key)));
    return row ? { Item: marshall(row) } : {};
  });
  ddb.on(BatchGetItemCommand).callsFake((input) => {
    const [[table, { Keys }]] = Object.entries(input.RequestItems as Record<string, { Keys: any[] }>);
    const names = Keys.map((k) => unmarshall(k).nofo_name);
    return { Responses: { [table]: (tables[table] || []).filter((r) => names.includes(r.nofo_name)).map((r) => marshall(r)) } };
  });
  ddb.on(ScanCommand).callsFake((input) => ({ Items: (tables[input.TableName] || []).map((r) => marshall(r)) }));
  ddb.on(PutItemCommand).callsFake((input) => {
    const item = unmarshall(input.Item);
    const rows = (tables[input.TableName] ||= []);
    const i = rows.findIndex(matches({ user_id: item.user_id, session_id: item.session_id }));
    if (i >= 0 && input.ConditionExpression === "attribute_not_exists(user_id)") {
      throw Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });
    }
    if (i >= 0) rows.splice(i, 1);
    rows.push(item);
    return {};
  });
  ddb.on(UpdateItemCommand).resolves({});
}

beforeEach(() => {
  cognito.reset();
  ddb.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("validateOutcome", () => {
  it("requires the fields each status needs", async () => {
    const { validateOutcome } = await load();
    expect(validateOutcome({ status: "awarded", decisionDate: "2026-10-01", amountAwarded: 25000 }, NOW)).toEqual({
      status: "awarded",
      decisionDate: "2026-10-01",
      amountAwarded: 25000,
    });
    expect(validateOutcome({ status: "withdrawn", decisionDate: "2026-10-01" }, NOW)).toEqual({ status: "withdrawn" });
    expect(validateOutcome({ status: "not_submitted" }, NOW)).toEqual({ status: "not_submitted" });
    expect(() => validateOutcome({ status: "awarded", decisionDate: "2026-10-01" }, NOW)).toThrow(/Amount awarded/);
    expect(() => validateOutcome({ status: "awarded", decisionDate: "2026-10-01", amountAwarded: 10.5 }, NOW)).toThrow(/whole number/);
    expect(() => validateOutcome({ status: "submitted" }, NOW)).toThrow(/Date submitted/);
    expect(() => validateOutcome({ status: "not_awarded", decisionDate: "2026-12-01" }, NOW)).toThrow(/no later than today/);
    expect(() => validateOutcome({ status: "won" }, NOW)).toThrow(/status must be one of/);
  });
});

describe("dueAtMs", () => {
  const draft = { last_modified: "2026-06-01T00:00:00Z" };

  it("waits for the end of the deadline day, then every snooze or 'submitted' answer", async () => {
    const { dueAtMs } = await load();
    const nofo = { expiration_date: "2026-09-30", is_rolling: "false" };
    expect(dueAtMs(draft, nofo, undefined)).toBe(Date.parse("2026-09-30T23:59:59Z"));
    expect(dueAtMs(draft, nofo, { status: "submitted", next_reminder_at: "2026-12-01T00:00:00Z" })).toBe(Date.parse("2026-12-01T00:00:00Z"));
    expect(dueAtMs(draft, nofo, { next_reminder_at: "2026-08-01T00:00:00Z" })).toBe(Date.parse("2026-09-30T23:59:59Z"));
  });

  it("uses 90 days after the last edit for rolling grants and grants no longer listed", async () => {
    const { dueAtMs } = await load();
    const expected = Date.parse(draft.last_modified) + 90 * DAY;
    expect(dueAtMs(draft, { expiration_date: "2026-09-30", is_rolling: "true" }, undefined)).toBe(expected);
    expect(dueAtMs(draft, undefined, undefined)).toBe(expected);
  });

  it("never reminds again after a final outcome", async () => {
    const { dueAtMs } = await load();
    for (const status of ["awarded", "not_awarded", "withdrawn", "not_submitted"]) {
      expect(dueAtMs(draft, undefined, { status })).toBeNull();
    }
  });
});

describe("user routes", () => {
  const basics = { projectName: "Fiber", requestedAmount: "$40,000" };

  it("stamps the start on first use and never prompts for applications last edited before it", async () => {
    const { handler } = await load();
    const tables: Record<string, Row[]> = {
      drafts: [{ user_id: "sub-1", session_id: "old", title: "Old", document_identifier: "Early grant", project_basics: basics, last_modified: "2026-09-01T00:00:00Z" }],
      nofos: [{ nofo_name: "Early grant", expiration_date: "2026-08-01" }],
      outcomes: [],
    };
    serve(tables);
    expect((await call(handler, event("GET /application-outcomes/due"))).body.due).toEqual([]);
    expect(tables.outcomes).toEqual([{ user_id: "#meta", session_id: "reminders_from", started_at: new Date(NOW).toISOString() }]);

    const again = await load();
    serve(tables);
    await call(again.handler, event("GET /application-outcomes/due"));
    expect(tables.outcomes).toHaveLength(1);
    expect(tables.outcomes[0].started_at).toBe(new Date(NOW).toISOString());
  });

  it("lists due applications with project basics only, most overdue first", async () => {
    const { handler } = await load();
    serve({
      drafts: [
        { user_id: "sub-1", session_id: "a", title: "A", document_identifier: "Late grant", project_basics: basics, last_modified: "2026-10-20T00:00:00Z" },
        { user_id: "sub-1", session_id: "b", title: "B", document_identifier: "Early grant", project_basics: basics, last_modified: "2026-10-20T00:00:00Z" },
        { user_id: "sub-1", session_id: "c", title: "Empty", document_identifier: "Early grant", project_basics: { projectName: "" }, last_modified: "2026-10-20T00:00:00Z" },
        { user_id: "sub-1", session_id: "g", title: "Before rollout", document_identifier: "Early grant", project_basics: basics, last_modified: "2026-09-15T00:00:00Z" },
        { user_id: "sub-1", session_id: "d", title: "Future", document_identifier: "Future grant", project_basics: basics, last_modified: "2026-10-20T00:00:00Z" },
        { user_id: "sub-1", session_id: "e", title: "Snoozed", document_identifier: "Early grant", project_basics: basics, last_modified: "2026-10-20T00:00:00Z" },
        { user_id: "sub-1", session_id: "f", title: "Done", document_identifier: "Early grant", project_basics: basics, last_modified: "2026-10-20T00:00:00Z" },
      ],
      nofos: [
        { nofo_name: "Late grant", expiration_date: "2026-10-15" },
        { nofo_name: "Early grant", expiration_date: "2026-08-01" },
        { nofo_name: "Future grant", expiration_date: "2026-12-31" },
      ],
      outcomes: [
        { user_id: "#meta", session_id: "reminders_from", started_at: "2026-10-01T00:00:00Z" },
        { user_id: "sub-1", session_id: "e", next_reminder_at: "2026-11-15T00:00:00Z" },
        { user_id: "sub-1", session_id: "f", status: "awarded" },
      ],
    });
    const { body } = await call(handler, event("GET /application-outcomes/due"));
    expect(body.due.map((d: any) => d.sessionId)).toEqual(["b", "a"]);
    expect(body.due[0]).toEqual({ sessionId: "b", title: "B", grant: "Early grant", deadline: "2026-08-01", status: null, submittedDate: null });
  });

  it("records an outcome with snapshots of the application and profile", async () => {
    const { handler } = await load();
    const tables = {
      drafts: [{ user_id: "sub-1", session_id: "a", title: "Fiber plan", document_identifier: "Broadband/", project_basics: basics }],
      analytics: [{ pk: "USER#sub-1", sk: "PROFILE", organization: "Town of Lee", region: "Region 2" }],
      outcomes: [] as Row[],
    };
    serve(tables);
    const res = await call(handler, event("PUT /application-outcomes/{sessionId}", { sessionId: "a", body: { status: "submitted", submittedDate: "2026-10-20" } }));
    expect(res.status).toBe(200);
    expect(tables.outcomes[0]).toMatchObject({
      user_id: "sub-1",
      session_id: "a",
      status: "submitted",
      submitted_date: "2026-10-20",
      title: "Fiber plan",
      grant: "Broadband",
      requested_amount: "$40,000",
      organization: "Town of Lee",
      region: "Region 2",
      state: "CO",
      next_reminder_at: new Date(NOW + 60 * DAY).toISOString(),
    });

    await call(handler, event("PUT /application-outcomes/{sessionId}", { sessionId: "a", body: { status: "awarded", decisionDate: "2026-10-26", amountAwarded: 40000 } }));
    expect(tables.outcomes).toHaveLength(1);
    expect(tables.outcomes[0]).toMatchObject({ status: "awarded", amount_awarded: 40000, decision_date: "2026-10-26" });
    expect(tables.outcomes[0]).not.toHaveProperty("submitted_date");
    expect(tables.outcomes[0]).not.toHaveProperty("next_reminder_at");
  });

  it("refuses an application the caller doesn't own and a bad body", async () => {
    const { handler } = await load();
    serve({ drafts: [{ user_id: "sub-2", session_id: "a" }], outcomes: [] });
    expect((await call(handler, event("PUT /application-outcomes/{sessionId}", { sessionId: "a", body: { status: "withdrawn" } }))).status).toBe(404);
    expect((await call(handler, event("PUT /application-outcomes/{sessionId}", { sessionId: "a", body: { status: "awarded" } }))).status).toBe(400);
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("snoozes each listed application for 60 days", async () => {
    const { handler } = await load();
    serve({});
    const res = await call(handler, event("POST /application-outcomes/snooze", { body: { sessionIds: ["a", "b", "a"] } }));
    expect(res.body.snoozedUntil).toBe(new Date(NOW + 60 * DAY).toISOString());
    expect(ddb.commandCalls(UpdateItemCommand).map((c) => unmarshall(c.args[0].input.Key!))).toEqual([
      { user_id: "sub-1", session_id: "a" },
      { user_id: "sub-1", session_id: "b" },
    ]);
    expect((await call(handler, event("POST /application-outcomes/snooze", { body: { sessionIds: [] } }))).status).toBe(400);
  });
});

describe("GET /admin/application-outcomes", () => {
  const outcomes = [
    { user_id: "sub-1", session_id: "a", status: "awarded", state: "CO", grant: "G1", title: "T1", updated_at: "2026-10-02" },
    { user_id: "sub-2", session_id: "b", status: "submitted", state: "MA", grant: "G2", title: "T2", updated_at: "2026-10-03" },
    { user_id: "deleted#x", session_id: "c", status: "not_awarded", state: "CO", grant: "G3", organization: "Town", updated_at: "2026-10-01" },
    { user_id: "sub-1", session_id: "d", next_reminder_at: "2026-12-01" },
  ];
  const admin = (role: string, state = "") => ({ claims: { "custom:role": JSON.stringify([role]), "custom:state": state } });

  beforeEach(() => {
    cognito.on(ListUsersCommand).resolves({
      Users: [
        { Attributes: [{ Name: "sub", Value: "sub-1" }, { Name: "email", Value: "Jane@Town.gov" }] },
        { Attributes: [{ Name: "sub", Value: "sub-2" }, { Name: "email", Value: "bo@ma.gov" }] },
      ],
    });
  });

  it("is for admins only", async () => {
    const { handler } = await load();
    serve({ outcomes });
    expect((await call(handler, event("GET /admin/application-outcomes"))).status).toBe(403);
  });

  it("lists recorded outcomes with live emails, blank for de-identified rows, newest first", async () => {
    const { handler } = await load();
    serve({ outcomes });
    const { body } = await call(handler, event("GET /admin/application-outcomes", admin("Developer")));
    expect(body.outcomes.map((o: any) => [o.grant, o.email, o.deleted])).toEqual([
      ["G2", "bo@ma.gov", false],
      ["G1", "jane@town.gov", false],
      ["G3", "", true],
    ]);
  });

  it("keeps a state admin to their state, and lets others narrow by ?state", async () => {
    const { handler } = await load();
    serve({ outcomes });
    const stateAdmin = await call(handler, event("GET /admin/application-outcomes", { ...admin("Admin", "CO"), query: { state: "MA" } }));
    expect(stateAdmin.body.outcomes.map((o: any) => o.grant)).toEqual(["G1", "G3"]);
    const platform = await call(handler, event("GET /admin/application-outcomes", { ...admin("PlatformAdmin"), query: { state: "MA" } }));
    expect(platform.body.outcomes.map((o: any) => o.grant)).toEqual(["G2"]);
  });
});

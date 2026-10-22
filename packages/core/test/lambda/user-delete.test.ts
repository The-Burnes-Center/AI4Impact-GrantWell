import { mockClient } from "aws-sdk-client-mock";
import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DeleteObjectsCommand, ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);
const lambda = mockClient(LambdaClient);

const ENV = {
  USER_POOL_ID: "pool",
  SUPPORTED_STATES: JSON.stringify([{ code: "MA", name: "Massachusetts" }]),
  CHAT_HISTORY_TABLE_NAME: "chats",
  DRAFT_TABLE_NAME: "drafts",
  DRAFT_VERSION_TABLE_NAME: "versions",
  ANALYTICS_TABLE_NAME: "analytics",
  USER_NOTIFICATION_PREFS_TABLE_NAME: "prefs",
  USER_DOCUMENTS_BUCKET: "user-docs",
  SYNC_KB_FUNCTION_NAME: "sync-kb",
};

async function load(env: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ...ENV, ...env })) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import("../../lib/chatbot-api/functions/user-management/users/index.mjs")).handler;
}

const deleteEvent = (username = "jane@example.org") => ({
  routeKey: "DELETE /user-management/users/{username}",
  requestContext: {
    http: { method: "DELETE" },
    authorizer: { jwt: { claims: { "cognito:username": "admin-uuid", "custom:role": '["Developer"]' } } },
  },
  pathParameters: { username: encodeURIComponent(username) },
});

const target = (attrs: Record<string, string> = { sub: "sub-1" }) => ({
  Username: "user-uuid",
  UserStatus: "CONFIRMED",
  Enabled: true,
  UserAttributes: [
    { Name: "email", Value: "jane@example.org" },
    { Name: "custom:role", Value: '["User"]' },
    ...Object.entries(attrs).map(([Name, Value]) => ({ Name, Value })),
  ],
});

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

// A fake DynamoDB: Query reads rows by partition key (paged by `pageSize` with a key cursor, as
// DynamoDB does, so deleting rows mid-scan doesn't shift pages), BatchWriteItem and
// DeleteItem remove them and UpdateItem drops query_text, so a second handler run sees what the first left.
// Like DynamoDB, Query refuses a FilterExpression that names a key attribute.
function serveTables(store: Store, pageSize = 100) {
  const keySchema: Record<string, [string, string]> = {
    chats: ["user_id", "session_id"],
    drafts: ["user_id", "session_id"],
    versions: ["draft_key", "rev"],
    analytics: ["pk", "sk"],
  };
  ddb.on(QueryCommand).callsFake((input) => {
    const values = unmarshall(input.ExpressionAttributeValues);
    const [pk, sk] = keySchema[input.TableName];
    let rows = (store[input.TableName] || []).filter((r) => r[pk] === values[Object.keys(values)[0]]);
    if (input.FilterExpression) {
      const named = [pk, sk].find((k) => new RegExp(`\\b${k}\\b`).test(input.FilterExpression));
      if (named) {
        throw Object.assign(
          new Error(`Filter Expression can only contain non-primary key attributes: Primary key attribute: ${named}`),
          { name: "ValidationException" }
        );
      }
      expect(input.FilterExpression).toBe("attribute_exists(query_text)");
      rows = rows.filter((r) => r.query_text !== undefined);
    }
    const after = input.ExclusiveStartKey ? String(unmarshall(input.ExclusiveStartKey).cursor) : "";
    const ordered = rows.map((r) => [JSON.stringify(r), r] as const).sort(([a], [b]) => (a < b ? -1 : 1));
    const rest = ordered.filter(([k]) => k > after);
    const page = rest.slice(0, pageSize);
    return {
      Items: page.map(([, r]) => marshall(r)),
      ...(rest.length > pageSize ? { LastEvaluatedKey: marshall({ cursor: page[page.length - 1][0] }) } : {}),
    };
  });
  ddb.on(BatchWriteItemCommand).callsFake((input) => {
    for (const [table, requests] of Object.entries(input.RequestItems as Record<string, any[]>)) {
      const keys = requests.map((r) => JSON.stringify(unmarshall(r.DeleteRequest.Key)));
      store[table] = (store[table] || []).filter((row) => {
        const rowKey = Object.fromEntries(
          Object.keys(unmarshall(requests[0].DeleteRequest.Key)).map((k) => [k, row[k]])
        );
        return !keys.includes(JSON.stringify(rowKey));
      });
    }
    return { UnprocessedItems: {} };
  });
  const matches = (key: Row) => (row: Row) => Object.entries(key).every(([k, v]) => row[k] === v);
  ddb.on(DeleteItemCommand).callsFake((input) => {
    const key = unmarshall(input.Key);
    const rows = store[input.TableName] || [];
    const found = rows.find(matches(key));
    store[input.TableName] = rows.filter((r) => !matches(key)(r));
    return found ? { Attributes: marshall(found) } : {};
  });
  ddb.on(UpdateItemCommand).callsFake((input) => {
    const row = (store[input.TableName] || []).find(matches(unmarshall(input.Key)));
    if (!row) throw Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });
    delete row.query_text;
    return {};
  });
}

type Version = { Key: string; VersionId: string; marker?: boolean };

function serveBucket(objects: Version[]) {
  s3.on(ListObjectVersionsCommand).callsFake((input) => {
    const mine = objects.filter((o) => o.Key.startsWith(input.Prefix));
    return {
      Versions: mine.filter((o) => !o.marker).map(({ Key, VersionId }) => ({ Key, VersionId })),
      DeleteMarkers: mine.filter((o) => o.marker).map(({ Key, VersionId }) => ({ Key, VersionId })),
    };
  });
  s3.on(DeleteObjectsCommand).callsFake((input) => {
    for (const { Key, VersionId } of input.Delete.Objects) {
      const i = objects.findIndex((o) => o.Key === Key && o.VersionId === VersionId);
      if (i >= 0) objects.splice(i, 1);
    }
    return {};
  });
}

const batchKeys = (table: string) =>
  ddb
    .commandCalls(BatchWriteItemCommand)
    .flatMap((c) => (c.args[0].input.RequestItems as Record<string, any[]>)[table] || [])
    .map((r) => unmarshall(r.DeleteRequest.Key));

let store: Store;
let bucket: Version[];

beforeEach(() => {
  cognito.reset();
  ddb.reset();
  s3.reset();
  lambda.reset();
  cognito.on(AdminGetUserCommand).resolves(target());
  cognito.on(AdminDeleteUserCommand).resolves({});
  lambda.on(InvokeCommand).resolves({});
  store = {
    chats: [
      { user_id: "sub-1", session_id: "c1" },
      { user_id: "sub-1", session_id: "c2" },
      { user_id: "sub-2", session_id: "other" },
    ],
    drafts: [
      { user_id: "sub-1", session_id: "d1" },
      { user_id: "sub-2", session_id: "d9" },
    ],
    versions: [
      { draft_key: "sub-1#d1", rev: 1 },
      { draft_key: "sub-1#d1", rev: 2 },
      { draft_key: "sub-2#d9", rev: 1 },
    ],
    analytics: [
      { pk: "USER#sub-1", sk: "PROFILE" },
      { pk: "USER#sub-1", sk: "EVT#2026-10-01#a", event_type: "search", query_text: "housing grants" },
      { pk: "USER#sub-1", sk: "EVT#2026-10-02#b", event_type: "nofo_view" },
      { pk: "USER#sub-2", sk: "PROFILE" },
    ],
    prefs: [{ user_id: "sub-1" }, { user_id: "sub-2" }],
  };
  bucket = [
    { Key: "user-uuid/grant/plan.pdf", VersionId: "v1" },
    { Key: "user-uuid/grant/plan.pdf", VersionId: "v2" },
    { Key: "user-uuid/grant/plan.pdf.metadata.json", VersionId: "m1" },
    { Key: "user-uuid/grant/old.docx", VersionId: "d1", marker: true },
    { Key: "user-uuid-2/grant/theirs.pdf", VersionId: "x1" },
  ];
});

describe("DELETE /user-management/users/{username}", () => {
  it("removes a chat's turn rows with it and counts the chat once", async () => {
    store.chats = [
      { user_id: "sub-1", session_id: "c1" },
      { user_id: "sub-1", session_id: "c1#turn#000001" },
      { user_id: "sub-1", session_id: "c1#turn#000002" },
      { user_id: "sub-1", session_id: "c2", chat_history: [] },
      { user_id: "sub-2", session_id: "other" },
      { user_id: "sub-2", session_id: "other#turn#000001" },
    ];
    serveTables(store);
    serveBucket(bucket);
    const handler = await load();

    const res = await handler(deleteEvent());

    expect(JSON.parse(res.body).removed.chats).toBe(2);
    expect(store.chats.map((r) => r.session_id)).toEqual(["other", "other#turn#000001"]);
  });

  it("removes every store's rows for the user, then the account", async () => {
    serveTables(store);
    serveBucket(bucket);
    const handler = await load();

    const res = await handler(deleteEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      username: "jane@example.org",
      deleted: true,
      removed: {
        chats: 2,
        applications: 1,
        applicationVersions: 2,
        supportingDocuments: 2,
        profile: true,
        searchTextsErased: 1,
        notificationPreferences: true,
      },
    });

    expect(batchKeys("chats")).toEqual([
      { user_id: "sub-1", session_id: "c1" },
      { user_id: "sub-1", session_id: "c2" },
    ]);
    expect(batchKeys("drafts")).toEqual([{ user_id: "sub-1", session_id: "d1" }]);
    expect(batchKeys("versions")).toEqual([
      { draft_key: "sub-1#d1", rev: 1 },
      { draft_key: "sub-1#d1", rev: 2 },
    ]);
    expect(batchKeys("analytics")).toEqual([]);
    expect(ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input)).toEqual([
      {
        TableName: "analytics",
        Key: marshall({ pk: "USER#sub-1", sk: "EVT#2026-10-01#a" }),
        UpdateExpression: "REMOVE query_text",
        ConditionExpression: "attribute_exists(pk)",
      },
    ]);
    expect(ddb.commandCalls(DeleteItemCommand).map((c) => c.args[0].input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ TableName: "prefs", Key: marshall({ user_id: "sub-1" }) }),
        expect.objectContaining({ TableName: "analytics", Key: marshall({ pk: "USER#sub-1", sk: "PROFILE" }) }),
      ])
    );

    expect(s3.commandCalls(ListObjectVersionsCommand)[0].args[0].input).toEqual({
      Bucket: "user-docs",
      Prefix: "user-uuid/",
    });
    expect(s3.commandCalls(DeleteObjectsCommand)[0].args[0].input.Delete!.Objects).toEqual([
      { Key: "user-uuid/grant/plan.pdf", VersionId: "v1" },
      { Key: "user-uuid/grant/plan.pdf", VersionId: "v2" },
      { Key: "user-uuid/grant/plan.pdf.metadata.json", VersionId: "m1" },
      { Key: "user-uuid/grant/old.docx", VersionId: "d1" },
    ]);
    expect(bucket).toEqual([{ Key: "user-uuid-2/grant/theirs.pdf", VersionId: "x1" }]);

    expect(lambda.commandCalls(InvokeCommand)[0].args[0].input).toMatchObject({
      FunctionName: "sync-kb",
      InvocationType: "Event",
      Payload: JSON.stringify({ syncSource: "user-documents" }),
    });

    const deletes = cognito.commandCalls(AdminDeleteUserCommand);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0].input).toEqual({ UserPoolId: "pool", Username: "user-uuid" });
    const lastDataWrite = Math.max(
      ...[
        ...ddb.commandCalls(BatchWriteItemCommand),
        ...ddb.commandCalls(UpdateItemCommand),
        ...ddb.commandCalls(DeleteItemCommand),
        ...s3.commandCalls(DeleteObjectsCommand),
      ].map(
        (c) => c.callId
      )
    );
    expect(deletes[0].callId).toBeGreaterThan(lastDataWrite);

    expect(store.chats).toEqual([{ user_id: "sub-2", session_id: "other" }]);
    expect(store.versions).toEqual([{ draft_key: "sub-2#d9", rev: 1 }]);
    expect(store.analytics).toEqual([
      { pk: "USER#sub-1", sk: "EVT#2026-10-01#a", event_type: "search" },
      { pk: "USER#sub-1", sk: "EVT#2026-10-02#b", event_type: "nofo_view" },
      { pk: "USER#sub-2", sk: "PROFILE" },
    ]);
  });

  it("pages through queries and bucket listings, and batches deletes 25 at a time", async () => {
    store.chats = Array.from({ length: 60 }, (_, i) => ({ user_id: "sub-1", session_id: `c${i}` }));
    serveTables(store, 40);
    const many = Array.from({ length: 1500 }, (_, i) => ({ Key: `user-uuid/f${i}.pdf`, VersionId: "v" }));
    s3.on(ListObjectVersionsCommand).callsFake(() => ({
      Versions: many.slice(0, 1000).map(({ Key, VersionId }) => ({ Key, VersionId })),
      IsTruncated: many.length > 1000,
    }));
    s3.on(DeleteObjectsCommand).callsFake((input) => {
      many.splice(0, input.Delete.Objects.length);
      return {};
    });
    const handler = await load();

    const res = await handler(deleteEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).removed).toMatchObject({ chats: 60, supportingDocuments: 1500 });

    const chatQueries = ddb.commandCalls(QueryCommand).filter((c) => c.args[0].input.TableName === "chats");
    expect(chatQueries.length).toBeGreaterThan(1);
    expect(chatQueries[1].args[0].input.ExclusiveStartKey).toBeDefined();
    const chatBatches = ddb
      .commandCalls(BatchWriteItemCommand)
      .map((c) => (c.args[0].input.RequestItems as Record<string, any[]>).chats?.length)
      .filter(Boolean);
    expect(Math.max(...chatBatches)).toBeLessThanOrEqual(25);
    expect(chatBatches.reduce((a, b) => a + b, 0)).toBe(60);
    expect(s3.commandCalls(DeleteObjectsCommand).map((c) => c.args[0].input.Delete!.Objects!.length)).toEqual([
      1000, 500,
    ]);
    expect(store.chats).toEqual([]);
  });

  it("resends rows DynamoDB left unprocessed", async () => {
    serveTables(store);
    serveBucket(bucket);
    let throttled = false;
    ddb.on(BatchWriteItemCommand).callsFake((input) => {
      const requests = (input.RequestItems as Record<string, any[]>).chats;
      if (requests && !throttled) {
        throttled = true;
        return { UnprocessedItems: { chats: requests.slice(1) } };
      }
      return { UnprocessedItems: {} };
    });
    const handler = await load();

    const res = await handler(deleteEvent());
    expect(res.statusCode).toBe(200);
    const chatBatches = ddb
      .commandCalls(BatchWriteItemCommand)
      .map((c) => (c.args[0].input.RequestItems as Record<string, any[]>).chats)
      .filter(Boolean);
    expect(chatBatches.map((b) => b.length)).toEqual([2, 1]);
  });

  it("keeps the account when a store fails, and a retry finishes the job", async () => {
    serveTables(store);
    serveBucket(bucket);
    s3.on(DeleteObjectsCommand).resolvesOnce({
      Errors: [{ Key: "user-uuid/grant/plan.pdf", Code: "AccessDenied" }],
    });
    const handler = await load();

    const first = await handler(deleteEvent());
    expect(first.statusCode).toBe(502);
    expect(JSON.parse(first.body).message).toMatch(/account was kept/);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
    expect(store.chats).toEqual([{ user_id: "sub-2", session_id: "other" }]);

    serveBucket(bucket);
    const second = await handler(deleteEvent());
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).removed).toEqual({
      chats: 0,
      applications: 0,
      applicationVersions: 0,
      supportingDocuments: 2,
      profile: false,
      searchTextsErased: 0,
      notificationPreferences: false,
    });
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(1);
    expect(bucket).toEqual([{ Key: "user-uuid-2/grant/theirs.pdf", VersionId: "x1" }]);
  });

  it("skips a search event that expired before its text was erased", async () => {
    serveTables(store);
    serveBucket(bucket);
    ddb.on(UpdateItemCommand).rejects(
      Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" })
    );
    const handler = await load();

    const res = await handler(deleteEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).removed.searchTextsErased).toBe(0);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(1);
  });

  it("does not start a knowledge-base sync when the user had no documents", async () => {
    serveTables(store);
    serveBucket([]);
    const handler = await load();

    const res = await handler(deleteEvent());
    expect(res.statusCode).toBe(200);
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);
  });

  it("deletes nothing when the account has no sub", async () => {
    cognito.on(AdminGetUserCommand).resolves(target({}));
    serveTables(store);
    serveBucket(bucket);
    const handler = await load();

    const res = await handler(deleteEvent());
    expect(res.statusCode).toBe(500);
    expect(ddb.commandCalls(BatchWriteItemCommand)).toHaveLength(0);
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
  });

  it("deletes nothing when the cleanup is not configured", async () => {
    serveTables(store);
    serveBucket(bucket);
    const handler = await load({ USER_DOCUMENTS_BUCKET: "" });

    const res = await handler(deleteEvent());
    expect(res.statusCode).toBe(500);
    expect(ddb.commandCalls(BatchWriteItemCommand)).toHaveLength(0);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
  });
});

import { beforeAll, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  items: [] as any[],
  fail: false,
  pageSize: Infinity,
  queries: [] as any[],
}));

// Pages each status the way DynamoDB does: `pageSize` rows, then a LastEvaluatedKey to resume from.
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    async send(cmd: any) {
      if (db.fail) throw new Error("throttled");
      db.queries.push(cmd.input);
      const status = cmd.input.ExpressionAttributeValues?.[":status"];
      const rows = db.items.filter((i) => i.status === status);
      const start = cmd.input.ExclusiveStartKey?.offset ?? 0;
      const page = rows.slice(start, start + db.pageSize);
      const next = start + page.length;
      return { Items: page, ...(next < rows.length ? { LastEvaluatedKey: { offset: next } } : {}) };
    }
  },
  QueryCommand: class {
    constructor(public input: any) {}
  },
  ScanCommand: class {
    constructor(public input: any) {}
  },
}));
vi.mock("@aws-sdk/util-dynamodb", () => ({ marshall: (x: any) => x, unmarshall: (x: any) => x }));
vi.mock("grantwell-shared", () => ({ artifactsBucket: () => "grant-artifacts" }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send() {
      return {};
    }
  },
  ListObjectsV2Command: class {},
  GetObjectCommand: class {},
}));

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  process.env.NOFO_METADATA_TABLE_NAME = "nofos";
  process.env.ENABLE_DYNAMODB_CACHE = "true";
  process.env.SUPPORTED_STATES = JSON.stringify([{ code: "MA", name: "Massachusetts" }]);
  ({ handler } = await import("../lib/chatbot-api/functions/landing-page/retrieve-nofos/index.mjs"));
});

const request = { requestContext: { authorizer: { jwt: { claims: { "custom:role": '["User"]', "custom:state": "MA" } } } } };

describe("grant list", () => {
  it("is an empty list, not an error, for a deployment with no grants yet", async () => {
    db.items = [];
    db.fail = false;
    const res = await handler(request);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).folders).toEqual([]);
  });

  it("still fails when the table can't be read", async () => {
    db.fail = true;
    const res = await handler(request);
    expect(res.statusCode).toBe(500);
  });

  it("reads every page of each status, not just the first 1 MB", async () => {
    db.fail = false;
    db.pageSize = 2;
    db.queries = [];
    db.items = [
      ...Array.from({ length: 5 }, (_, i) => ({ nofo_name: `Grant ${i}`, status: "active", scope: "federal" })),
      ...Array.from({ length: 3 }, (_, i) => ({ nofo_name: `Old ${i}`, status: "archived", scope: "federal" })),
    ];

    const res = await handler(request);

    const body = JSON.parse(res.body);
    expect(body.folders).toEqual(["Grant 0", "Grant 1", "Grant 2", "Grant 3", "Grant 4"]);
    expect(body.nofoData.filter((n: any) => n.status === "archived")).toHaveLength(3);
    expect(db.queries.filter((q) => q.ExclusiveStartKey)).toHaveLength(3);
    db.pageSize = Infinity;
  });
});

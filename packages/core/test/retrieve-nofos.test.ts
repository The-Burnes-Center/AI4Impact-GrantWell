import { beforeAll, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ items: [] as any[], fail: false }));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    async send() {
      if (db.fail) throw new Error("throttled");
      return { Items: db.items };
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
});

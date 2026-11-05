import { Readable } from "node:stream";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { CopyObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ddb = mockClient(DynamoDBClient);
const s3 = mockClient(S3Client);

const ENV = {
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "example",
  BUCKET: "nofos-bucket",
  ARTIFACTS_BUCKET: "grant-artifacts",
  NOFO_METADATA_TABLE_NAME: "nofos",
  SUPPORTED_STATES: JSON.stringify([{ code: "MA", name: "Massachusetts" }, { code: "NY", name: "New York" }]),
};

async function load(path: string) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import(`../../lib/chatbot-api/functions/landing-page/${path}/index.mjs`)).handler;
}

let rows: Record<string, Record<string, unknown>>;
beforeEach(() => {
  rows = {};
  ddb.reset();
  s3.reset();
  ddb.on(GetItemCommand).callsFake(({ Key }) => {
    const row = rows[unmarshall(Key).nofo_name];
    return row ? { Item: marshall(row, { removeUndefinedValues: true }) } : {};
  });
  ddb.on(PutItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  s3.on(GetObjectCommand).callsFake(() => ({ Body: Readable.from([Buffer.from("{}")]) }));
  s3.on(PutObjectCommand).resolves({});
  s3.on(ListObjectsV2Command).callsFake(({ Prefix }) => ({ Contents: [{ Key: `${Prefix}summary.json` }] }));
  s3.on(CopyObjectCommand).resolves({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const as = (roles: string[], state = "") => ({
  "custom:role": JSON.stringify(roles),
  ...(state ? { "custom:state": state } : {}),
});
const post = (claims: Record<string, string>, body: Record<string, unknown>) => ({
  requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims } } },
  body: JSON.stringify(body),
});

describe("changing a grant's status", () => {
  const setStatus = async (claims: Record<string, string>, nofoName: string) =>
    (await load("nofo-status"))(post(claims, { nofoName, status: "archived" }));

  it("refuses a state admin a grant that records no scope", async () => {
    rows["Old Grant"] = { nofo_name: "Old Grant", status: "active" };
    const res = await setStatus(as(["Admin"], "MA"), "Old Grant");
    expect(res.statusCode).toBe(403);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("still lets a state admin create the row for a new grant, and change their own state's", async () => {
    expect((await setStatus(as(["Admin"], "MA"), "New Grant")).statusCode).toBe(200);
    rows["MA Grant"] = { nofo_name: "MA Grant", status: "active", scope: "state", state: "MA" };
    expect((await setStatus(as(["Admin"], "MA"), "MA Grant")).statusCode).toBe(200);
  });

  it("still lets a Developer or platform admin change a grant that records no scope", async () => {
    rows["Old Grant"] = { nofo_name: "Old Grant", status: "active" };
    expect((await setStatus(as(["Developer"]), "Old Grant")).statusCode).toBe(200);
    expect((await setStatus(as(["PlatformAdmin"]), "Old Grant")).statusCode).toBe(200);
  });
});

describe("promoting a federal grant to a state copy", () => {
  const promote = async (nofoName: string) => (await load("nofo-promote-copy"))(post(as(["Admin"], "MA"), { nofoName }));

  it("refuses a grant that isn't published, copying nothing", async () => {
    for (const status of ["quarantined", "processing", undefined]) {
      rows["Held Grant"] = { nofo_name: "Held Grant", scope: "federal", status };
      const res = await promote("Held Grant");
      expect(res.statusCode).toBe(409);
    }
    expect(s3.commandCalls(CopyObjectCommand)).toHaveLength(0);
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("copies an active or archived grant", async () => {
    for (const status of ["active", "archived"]) {
      rows[`${status} Grant`] = { nofo_name: `${status} Grant`, scope: "federal", status };
      const res = await promote(`${status} Grant`);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ newName: `${status} Grant (Massachusetts)`, state: "MA" });
    }
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(2);
  });
});

import { mockClient } from "aws-sdk-client-mock";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const ddb = mockClient(DynamoDBClient);
const cognito = mockClient(CognitoIdentityProviderClient);
const ses = mockClient(SESv2Client);
const secrets = mockClient(SecretsManagerClient);

const SECRET = "unsubscribe-signing-secret";
const ENV = {
  USER_NOTIFICATION_PREFS_TABLE_NAME: "prefs",
  NOFO_METADATA_TABLE_NAME: "nofos",
  USER_POOL_ID: "pool",
  UNSUBSCRIBE_SECRET_ARN: "arn:secret",
  UNSUBSCRIBE_URL_BASE: "https://api.example/unsubscribe",
  DIGEST_SEND_LOG_TABLE_NAME: "send-log",
  DIGEST_SUPPRESSION_TABLE_NAME: "suppressed",
  SUPPORTED_STATES: JSON.stringify([{ code: "MA", name: "Massachusetts" }]),
};

/** A fresh container: the handler caches the signing secret and reads its env at import. */
async function load(env: Record<string, string> = ENV) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import("../../lib/chatbot-api/functions/notifications/digest/index.mjs")).handler;
}

const prefs = { user_id: "user-1", frequency: "daily", state: "MA", categories: ["Transportation"] };
const nofo = { nofo_name: "Bridge Grant", status: "active", category: "Transportation", created_at: new Date().toISOString() };

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const m of [ddb, cognito, ses, secrets]) m.reset();
  ddb.on(QueryCommand, { TableName: "prefs" }).resolves({ Items: [marshall(prefs)] });
  ddb.on(QueryCommand, { TableName: "nofos" }).resolves({ Items: [marshall(nofo)] });
  ddb.on(GetItemCommand, { TableName: "suppressed" }).resolves({});
  ddb.on(PutItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  ddb.on(DeleteItemCommand).resolves({});
  cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [{ Name: "email", Value: "ana@example.org" }] });
  secrets.on(GetSecretValueCommand).resolves({ SecretString: SECRET });
  ses.on(SendEmailCommand).resolves({ MessageId: "msg-1" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

const watermarkAdvanced = () =>
  ddb.commandCalls(UpdateItemCommand).some((c) => c.args[0].input.TableName === "prefs" && c.args[0].input.UpdateExpression === "SET last_sent = :ls");

describe("notification digest", () => {
  it("emails a matching grant with a working one-click unsubscribe link, then advances the watermark", async () => {
    const handler = await load();
    const res = await handler({ frequency: "daily" });

    expect(res.stats).toMatchObject({ candidates: 1, sent: 1, errors: 0 });
    const email = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(email.Destination).toEqual({ ToAddresses: ["ana@example.org"] });
    expect(email.Content!.Simple!.Body!.Html!.Data).toContain("Bridge Grant");
    const header = email.Content!.Simple!.Headers!.find((h) => h.Name === "List-Unsubscribe")!.Value!;
    const token = new URL(header.slice(1, -1)).searchParams.get("token");
    const shared = await import("grantwell-shared");
    expect(shared.verifyUnsubscribeToken(token, SECRET)).toBe("user-1");
    expect(watermarkAdvanced()).toBe(true);
  });

  it("logs both digest markers, releases the claim and keeps the watermark when SES rejects the send", async () => {
    ses.on(SendEmailCommand).rejects(Object.assign(new Error("Daily quota exceeded"), { name: "LimitExceededException" }));
    const handler = await load();
    const res = await handler({ frequency: "daily" });

    expect(res.stats).toMatchObject({ sent: 0, errors: 1 });
    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines.some((l) => l.startsWith(`${LOG_MARKERS.digestSendFailed[0]} user-1 at daily#`))).toBe(true);
    expect(lines).toContain(`${LOG_MARKERS.digestSendFailed[1]} user-1:`);
    const released = ddb.commandCalls(DeleteItemCommand).map((c) => unmarshall(c.args[0].input.Key!));
    expect(released).toEqual([{ user_id: "user-1", sent_at: expect.stringMatching(/^daily#\d{4}-\d{2}-\d{2}$/) }]);
    expect(watermarkAdvanced()).toBe(false);
  });

  it("never mails a suppressed address, but moves its watermark on", async () => {
    ddb.on(GetItemCommand, { TableName: "suppressed" }).resolves({ Item: marshall({ email: "ana@example.org" }) });
    const handler = await load();
    const res = await handler({ frequency: "daily" });

    expect(res.stats).toMatchObject({ suppressed: 1, sent: 0 });
    expect(ses.calls()).toHaveLength(0);
    expect(watermarkAdvanced()).toBe(true);
  });

  it("refuses to send without an unsubscribe link (no signing secret)", async () => {
    const handler = await load({ ...ENV, UNSUBSCRIBE_SECRET_ARN: "" });
    const res = await handler({ frequency: "daily" });

    expect(res.stats).toMatchObject({ sent: 0, errors: 1 });
    expect(ses.calls()).toHaveLength(0);
  });

  it("skips a user this window already claimed, so a double-fire mails once", async () => {
    ddb.on(PutItemCommand, { TableName: "send-log" }).rejects(new ConditionalCheckFailedException({ message: "claimed", $metadata: {} }));
    const handler = await load();
    const res = await handler({ frequency: "daily" });

    expect(res.stats).toMatchObject({ skipped: 1, sent: 0 });
    expect(ses.calls()).toHaveLength(0);
  });
});

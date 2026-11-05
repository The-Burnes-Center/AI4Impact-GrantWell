import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ddb = mockClient(DynamoDBClient);
const cognito = mockClient(CognitoIdentityProviderClient);

let handler: (event: any) => Promise<void>;
beforeAll(async () => {
  vi.stubEnv("DIGEST_SUPPRESSION_TABLE_NAME", "suppression");
  vi.stubEnv("USER_NOTIFICATION_PREFS_TABLE_NAME", "prefs");
  vi.stubEnv("USER_POOL_ID", "us-east-1_pool");
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  ({ handler } = await import("../../lib/chatbot-api/functions/notifications/ses-feedback/index.mjs"));
});

let logged: string[];
beforeEach(() => {
  ddb.reset();
  cognito.reset();
  ddb.on(PutItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  cognito.on(ListUsersCommand).resolves({ Users: [{ Attributes: [{ Name: "sub", Value: "sub-1" }] }] });
  logged = [];
  const capture = (...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  for (const level of ["log", "info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(capture);
});

const sns = (message: Record<string, unknown>) => ({ Records: [{ Sns: { Message: JSON.stringify(message) } }] });
const mail = { messageId: "0100018f-msg-1" };
const ADDRESS = /[\w.+-]+@[\w-]+\.[\w.]+/;

describe("SES feedback logging", () => {
  it("logs a delivery as a count and message ID, never the recipients", async () => {
    await handler(sns({ eventType: "Delivery", mail, delivery: { recipients: ["pat@example.org", "lee@example.org"] } }));
    expect(logged).toEqual(["Delivered 0100018f-msg-1 to 2 recipient(s)"]);
  });

  it("suppresses a hard bounce by address without logging the address", async () => {
    await handler(
      sns({
        notificationType: "Bounce",
        mail,
        bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: "Pat@Example.org" }] },
      })
    );
    expect(unmarshall(ddb.commandCalls(PutItemCommand)[0].args[0].input.Item!)).toMatchObject({ email: "pat@example.org", reason: "bounce" });
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(1);
    expect(logged.join("\n")).toContain("0100018f-msg-1");
    expect(logged.join("\n")).not.toMatch(ADDRESS);
  });

  it("does not log addresses for complaints, transient bounces, unresolved users or failed lookups", async () => {
    await handler(sns({ eventType: "Complaint", mail, complaint: { complaintFeedbackType: "abuse", complainedRecipients: [{ emailAddress: "pat@example.org" }] } }));
    await handler(sns({ eventType: "Bounce", mail, bounce: { bounceType: "Transient", bounceSubType: "MailboxFull", bouncedRecipients: [{ emailAddress: "lee@example.org" }] } }));
    cognito.on(ListUsersCommand).resolves({ Users: [] });
    await handler(sns({ eventType: "Complaint", mail, complaint: { complainedRecipients: ["sam@example.org"] } }));
    cognito.on(ListUsersCommand).rejects(Object.assign(new Error('Filter email = "kim@example.org" failed'), { name: "InvalidParameterException" }));
    await handler(sns({ eventType: "Complaint", mail, complaint: { complainedRecipients: ["kim@example.org"] } }));

    expect(logged.join("\n")).toContain("Transient bounce (Transient/MailboxFull) of 0100018f-msg-1 for 1 recipient(s)");
    expect(logged.join("\n")).toContain("Cognito lookup failed for a recipient of 0100018f-msg-1: InvalidParameterException");
    expect(logged.join("\n")).not.toMatch(ADDRESS);
    expect(ddb.commandCalls(PutItemCommand)).toHaveLength(3);
  });
});

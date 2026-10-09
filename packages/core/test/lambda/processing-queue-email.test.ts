import { mockClient } from "aws-sdk-client-mock";
import { BatchGetItemCommand, DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { GetParameterCommand, ParameterNotFound, SSMClient } from "@aws-sdk/client-ssm";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const ddb = mockClient(DynamoDBClient);
const ses = mockClient(SESv2Client);
const ssm = mockClient(SSMClient);

const PARAM = "/grantwell-generic-prod/queue-email/recipients";
const ENV = {
  REVIEW_TABLE_NAME: "reviews",
  NOFO_METADATA_TABLE_NAME: "nofos",
  NOTIFICATION_SENDER: "no-reply@example.org",
  SES_CONFIGURATION_SET: "env-digest",
  RECIPIENTS_PARAMETER: PARAM,
  DEPLOYMENT_URL: "https://grants.example.org",
  DEPLOYMENT_ID: "example-prod",
  DIGEST_APP_NAME: "GrantWell",
  DIGEST_BRAND_COLOR: "#195C53",
};

async function load() {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.resetModules();
  return import("../../lib/chatbot-api/functions/notifications/processing-queue/index.mjs");
}

type Review = { nofo_name: string; review_id: string; status: string; created_at: string };
const review = (nofo_name: string, status: string, created_at = "2026-10-01T12:00:00Z"): Review => ({
  nofo_name,
  review_id: `${nofo_name}-${status}`,
  status,
  created_at,
});

// Today is 2026-10-09 in Eastern time.
const REVIEWS = [
  review("No Deadline Grant", "pending_review"),
  review("Expired Grant", "failed"),
  review("Today Grant", "needs_reupload"),
  review("Soon Grant", "pending_review"),
  review("Month Grant", "pending_review"),
  review("Soon Grant", "failed", "2026-09-01T12:00:00Z"),
];
const META = [
  { nofo_name: "Expired Grant", expiration_date: "2026-09-30" },
  { nofo_name: "Today Grant", expiration_date: "2026-10-09T23:59:00Z" },
  { nofo_name: "Soon Grant", expiration_date: "2026-10-12" },
  { nofo_name: "Month Grant", expiration_date: "2026-10-30" },
];

function serve(reviews: Review[] = REVIEWS) {
  ddb.on(QueryCommand).callsFake((input) => {
    const status = unmarshall(input.ExpressionAttributeValues)[":status"];
    return { Items: reviews.filter((r) => r.status === status).map((r) => marshall(r)) };
  });
  ddb.on(BatchGetItemCommand).callsFake((input) => {
    const names = new Set(input.RequestItems.nofos.Keys.map((k: any) => unmarshall(k).nofo_name));
    return { Responses: { nofos: META.filter((m) => names.has(m.nofo_name)).map((m) => marshall(m)) } };
  });
}

let logs: ReturnType<typeof vi.spyOn>;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const m of [ddb, ses, ssm]) m.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T13:00:00Z"));
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: " ana@example.org, ben@example.org ,ana@example.org," } });
  ses.on(SendEmailCommand).resolves({ MessageId: "msg-1" });
  logs = vi.spyOn(console, "log").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

const logged = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

describe("processing-queue email", () => {
  it("sends nothing and doesn't read the list when the queue is empty", async () => {
    serve([]);
    const { handler } = await load();
    expect(await handler()).toEqual({ sent: false, waiting: 0 });
    expect(ssm.calls()).toHaveLength(0);
    expect(ses.calls()).toHaveLength(0);
    expect(logged(logs)).toContain("Processing queue is empty");
  });

  it("sends one email to every address in the SSM parameter, from the deployment's sender", async () => {
    serve();
    const { handler } = await load();
    expect(await handler()).toMatchObject({ sent: true, waiting: 5, recipients: 2 });

    expect(ssm.commandCalls(GetParameterCommand)[0].args[0].input).toEqual({ Name: PARAM });
    const sends = ses.commandCalls(SendEmailCommand);
    expect(sends).toHaveLength(1);
    const input = sends[0].args[0].input;
    expect(input.Destination).toEqual({ ToAddresses: ["ana@example.org", "ben@example.org"] });
    expect(input.FromEmailAddress).toBe("no-reply@example.org");
    expect(input.ConfigurationSetName).toBe("env-digest");
    expect(input.Content!.Simple!.Subject!.Data).toBe("GrantWell: 5 grants waiting in the processing queue");
    expect(input.Content!.Simple!.Headers).toBeUndefined();
  });

  it("sends nothing, and doesn't fail, when the parameter is missing", async () => {
    serve();
    ssm.on(GetParameterCommand).rejects(new ParameterNotFound({ message: "not found", $metadata: {} }));
    const { handler } = await load();
    expect(await handler()).toEqual({ sent: false, waiting: 5 });
    expect(ses.calls()).toHaveLength(0);
    expect(logged(logs)).toContain(`No processing-queue email recipients in SSM parameter ${PARAM}`);
    expect(errors).not.toHaveBeenCalled();
  });

  it("sends nothing when the parameter holds no address", async () => {
    serve();
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: " , " } });
    const { handler } = await load();
    expect(await handler()).toEqual({ sent: false, waiting: 5 });
    expect(ses.calls()).toHaveLength(0);
  });

  it("lists grants soonest deadline first with the queue's labels, counts expired ones and links to the queue", async () => {
    serve();
    const { handler } = await load();
    await handler();
    const { Html, Text } = ses.commandCalls(SendEmailCommand)[0].args[0].input.Content!.Simple!.Body!;
    const html = Html!.Data!;
    const text = Text!.Data!;

    const order = ["Today Grant", "Soon Grant", "Month Grant", "No Deadline Grant", "Expired Grant"];
    const positions = order.map((name) => text.indexOf(`- ${name}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text.match(/- Soon Grant/g)).toHaveLength(1);

    expect(text).toContain("- Today Grant [Due today]");
    expect(text).toContain("- Soon Grant [Due in 3 days]");
    expect(text).toContain("- Month Grant [Due in 21 days]");
    expect(text).toContain("- Expired Grant [Expired]");
    expect(text).toMatch(/- No Deadline Grant\n {2}No deadline on file/);
    expect(text).toContain("Status: Failed · In queue since Sep 1, 2026");
    expect(html).toContain("background:#b91c1c;color:#fff;font-size:11px;font-weight:600;padding:1px 6px;border-radius:10px;vertical-align:middle;\">Due in 3 days");
    expect(html).toContain("background:#b45309");
    expect(html).toContain("background:#4b5563");

    expect(text).toContain('1 is for a grant whose deadline has passed. "Close all expired" in the queue');
    expect(html).toContain('href="https://grants.example.org/admin?view=needs-attention"');
    expect(text).toContain("Open the processing queue: https://grants.example.org/admin?view=needs-attention");
    const footer = "You're on the processing-queue list for grants.example.org (example-prod); ask a developer to change it.";
    expect(text).toContain(footer);
    expect(html).toContain(footer);
    expect(html.toLowerCase()).not.toContain("unsubscribe");
  });

  it("logs the pinned marker and fails the run when SES rejects the send", async () => {
    serve();
    ses.on(SendEmailCommand).rejects(new Error("MessageRejected"));
    const { handler } = await load();
    await expect(handler()).rejects.toThrow("MessageRejected");
    expect(logged(errors)).toContain(LOG_MARKERS.queueEmailSendFailed[0]);
  });

  it("escapes grant names in the HTML", async () => {
    const { buildQueueEmail } = await load();
    const { html } = buildQueueEmail([
      { nofo_name: "<b>Grant</b>", status: "pending_review", created_at: "2026-10-01", deadline: null, daysLeft: null, urgency: null },
    ]);
    expect(html).toContain("&lt;b&gt;Grant&lt;/b&gt;");
    expect(html).not.toContain("<b>Grant</b>");
  });
});

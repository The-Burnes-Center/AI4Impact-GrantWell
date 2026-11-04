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

describe("notification digest: other states' grants", () => {
  const ENV_MULTI = {
    ...ENV,
    SUPPORTED_STATES: JSON.stringify([
      { code: "CO", name: "Colorado" },
      { code: "MA", name: "Massachusetts" },
    ]),
  };
  const created_at = new Date().toISOString();
  const federal = { nofo_name: "Federal Bridge Grant", status: "active", category: "Transportation", created_at };
  const colorado = { nofo_name: "CDOT Bridge Grant", status: "active", category: "Transportation", scope: "state", state: "CO", created_at };
  const massachusetts = { nofo_name: "MassDOT Bridge Grant", status: "active", category: "Transportation", scope: "state", state: "MA", created_at };

  function given(userPrefs: Record<string, unknown>, nofos: object[], attributes: Record<string, string>) {
    ddb.on(QueryCommand, { TableName: "prefs" }).resolves({ Items: [marshall({ user_id: "user-1", frequency: "daily", ...userPrefs })] });
    ddb.on(QueryCommand, { TableName: "nofos" }).resolves({ Items: nofos.map((n) => marshall(n)) });
    cognito.on(AdminGetUserCommand).resolves({
      UserAttributes: Object.entries({ email: "ana@example.org", ...attributes }).map(([Name, Value]) => ({ Name, Value })),
    });
  }
  const sentHtml = () => ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Content!.Simple!.Body!.Html!.Data!).join("\n");

  it("sends a user with no state federal grants only", async () => {
    given({ state: "", categories: ["Transportation"] }, [federal, colorado], {});
    const res = await (await load(ENV_MULTI))({ frequency: "daily" });

    expect(res.stats).toMatchObject({ sent: 1 });
    expect(sentHtml()).toContain("Federal Bridge Grant");
    expect(sentHtml()).not.toContain("CDOT Bridge Grant");
  });

  it("does not widen to another state's grants when a user's filters match nothing", async () => {
    given({ state: "MA", categories: ["Health"] }, [colorado], { "custom:state": "MA" });
    const res = await (await load(ENV_MULTI))({ frequency: "daily" });

    expect(res.stats).toMatchObject({ sent: 0, empty: 1 });
    expect(ses.calls()).toHaveLength(0);
  });

  it("sends a Developer with no state every state's grants", async () => {
    given({ state: "", categories: ["Transportation"] }, [colorado], { "custom:role": '["Developer"]' });
    const res = await (await load(ENV_MULTI))({ frequency: "daily" });

    expect(res.stats).toMatchObject({ sent: 1 });
    expect(sentHtml()).toContain("CDOT Bridge Grant");
  });

  it("uses the user's current Cognito state, not the one saved with their prefs", async () => {
    given({ state: "MA", categories: ["Transportation"] }, [colorado, massachusetts], { "custom:state": "CO" });
    const res = await (await load(ENV_MULTI))({ frequency: "daily" });

    expect(res.stats).toMatchObject({ sent: 1 });
    expect(sentHtml()).toContain("CDOT Bridge Grant");
    expect(sentHtml()).not.toContain("MassDOT Bridge Grant");
  });
});

describe("digest branding", () => {
  const build = async (branding: Record<string, string>) => {
    const { buildDigest } = await import("grantwell-shared");
    return buildDigest("daily", { sections: { new: [{ nofo }] }, appUrl: "https://colorado.grantwell.us", branding });
  };

  it("keeps the wordmark's proportions and names the sender before its postal address", async () => {
    const { html, text } = await build({
      appName: "GrantWell",
      logoUrl: "https://colorado.grantwell.us/images/co/lockup.svg",
      logoWidth: "234",
      orgName: "State of Colorado",
      postalAddress: "200 E Colfax Ave, Denver, CO 80203",
    });
    expect(html).toContain('width="234" height="28" style="width:234px;height:28px;');
    expect(html).toContain("State of Colorado, 200 E Colfax Ave, Denver, CO 80203");
    expect(text).toContain("State of Colorado, 200 E Colfax Ave, Denver, CO 80203");
  });

  it("falls back to 141 px for a missing or out-of-range width", async () => {
    for (const logoWidth of ["", "0", "12.5", "9000"]) {
      const { html } = await build({ appName: "GrantWell", logoUrl: "https://grantwell.us/w.svg", logoWidth });
      expect(html).toContain('width="141" height="28"');
    }
  });
});

describe("digest accessibility and client fixes", () => {
  const grant = (name: string) => ({
    nofo: { nofo_name: name, agency: "Department of Transportation", category: "Transportation", expiration_date: "2099-01-01" },
    reasons: ["Category: Transportation"],
    daysUntil: 3,
  });
  const render = async (sections: Record<string, unknown>, branding: Record<string, string> = {}) => {
    const { buildDigest } = await import("grantwell-shared");
    return buildDigest("weekly", {
      sections,
      appUrl: "https://grantwell.us",
      unsubscribeUrl: "https://api.example/unsubscribe?u=1&sig=x",
      branding: { appName: "GrantWell", logoUrl: "https://grantwell.us/w.svg", ...branding },
    });
  };
  const headingLevels = (html: string) => [...html.matchAll(/<h(\d)\b/g)].map((m) => Number(m[1]));

  it("is a full document with lang on both <html> and the wrapper Gmail keeps", async () => {
    const { html, subject } = await render({ new: [grant("Bridge Grant")] });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain(`<title>${subject}</title>`);
    expect(html).toMatch(/<div role="article"[^>]* lang="en"/);
    expect(html).toContain('<!--[if mso]><table role="presentation" align="center" width="600"');
  });

  it("nests headings h1 > h2 section > h3 grant when sections are labelled", async () => {
    const { html } = await render({ new: [grant("Bridge Grant")], closingSoon: [grant("Roads Grant")] });
    expect(headingLevels(html)).toEqual([1, 2, 3, 2, 3]);
  });

  it("uses h2 for grants when a single section shows no heading", async () => {
    const { html } = await render({ new: [grant("Bridge Grant"), grant("Roads Grant")] });
    expect(headingLevels(html)).toEqual([1, 2, 2]);
  });

  it("keeps all text at 14 px or larger", async () => {
    const { html } = await render(
      { new: [grant("Bridge Grant")], closingSoon: [grant("Roads Grant")], overflow: 3 },
      { supportEmail: "help@grantwell.us", orgName: "Org", postalAddress: "1 Main St" }
    );
    const sizes = [...html.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  });

  it("names the grant in each repeated call to action and hides arrows from screen readers", async () => {
    const { html } = await render({ new: [grant("Bridge Grant"), grant("Roads & Rails")], overflow: 2 });
    expect(html).toContain('aria-label="View grant opportunity: Bridge Grant"');
    expect(html).toContain('aria-label="View grant opportunity: Roads &amp; Rails"');
    expect(html.split("&rarr;").length - 1).toBe(html.split('<span aria-hidden="true">&rarr;</span>').length - 1);
  });

  it("darkens a pale brand colour to 4.5:1 on white and leaves passing colours alone", async () => {
    const { contrastRatio, readableBrandColor } = await import("grantwell-shared");
    expect(readableBrandColor("#23776C")).toBe("#23776C");
    expect(readableBrandColor("#002868")).toBe("#002868");
    const gold = readableBrandColor("#F2B705");
    expect(contrastRatio(gold, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    const { html } = await render({ new: [grant("Bridge Grant")] }, { brandColor: "#F2B705" });
    expect(html).not.toContain("#F2B705");
    expect(html).toContain(`bgcolor="${gold}"`);
  });
});

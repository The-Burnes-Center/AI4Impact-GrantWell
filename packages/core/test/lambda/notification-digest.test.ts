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

  it("links each grant once, through its title", async () => {
    const { html } = await render({ new: [grant("Bridge Grant"), grant("Roads & Rails")] });
    const grantLinks = [...html.matchAll(/<a href="https:\/\/grantwell\.us\/requirements\/[^"]*"[^>]*>([^<]*)<\/a>/g)];
    expect(grantLinks.map((m) => m[1])).toEqual(["Bridge Grant", "Roads &amp; Rails"]);
    expect(html).toMatch(/<h2 [^>]*><a href="https:\/\/grantwell\.us\/requirements\/Bridge%20Grant"/);
    expect(html).not.toContain("View grant opportunity");
  });

  it("shows one filled overflow button that says grants", async () => {
    const { html, text } = await render({ new: [grant("Bridge Grant")], overflow: 4 });
    expect(html).toMatch(/<td bgcolor="#[0-9a-fA-F]{6}"[^>]*><a href="https:\/\/grantwell\.us"[^>]*>See 4 more matching grants<\/a>/);
    expect(text).toContain("+4 more matching grants — view all: https://grantwell.us");
  });

  it("says grants, never grant opportunities, and names the period", async () => {
    const one = await render({ new: [grant("Bridge Grant")] });
    expect(one.html).toMatch(/<h1 [^>]*>1 new grant for you<\/h1>/);
    expect(one.subject).toBe("GrantWell Weekly Digest: 1 new grant");
    expect(one.html).toContain("We found 1 new grant matching your preferences.");
    expect(one.html).toContain("subscribed to GrantWell grant notifications.");
    for (const out of [one.html, one.text]) expect(out).not.toMatch(/opportunit/i);
    expect(one.text.startsWith("GrantWell Weekly Digest\n1 new grant for you\n\nWe found 1 new grant")).toBe(true);
    expect(one.text).toContain("  View grant: https://grantwell.us/requirements/");

    const closing = await render({ new: [], closingSoon: [grant("Bridge Grant"), grant("Roads Grant")], newTotal: 0 });
    expect(closing.html).toMatch(/<h1 [^>]*>2 grants closing soon<\/h1>/);
    expect(closing.subject).toBe("GrantWell Weekly Digest: grants closing soon");
  });

  it("names the new section by period", async () => {
    const { buildDigest } = await import("grantwell-shared");
    const sections = { new: [grant("Bridge Grant")], closingSoon: [grant("Roads Grant")] };
    expect(buildDigest("weekly", { sections, appUrl: "https://grantwell.us" }).html).toMatch(/<h2 [^>]*>New this week<\/h2>/);
    expect(buildDigest("daily", { sections, appUrl: "https://grantwell.us" }).html).toMatch(/<h2 [^>]*>New today<\/h2>/);
  });

  it("counts every listed grant in the headline when nothing is new", async () => {
    const { html, text } = await render({
      new: [],
      newTotal: 0,
      closingSoon: [grant("Bridge Grant")],
      stillOpen: [grant("Roads Grant"), grant("Parks Grant")],
      closingSoonTotal: 1,
      stillOpenTotal: 2,
    });
    expect(html).toMatch(/<h1 [^>]*>3 open grants for you<\/h1>/);
    expect(text).toContain("\n3 open grants for you\n");
  });

  it("drops the Department and Category labels and says when there is no deadline", async () => {
    const dated = grant("Bridge Grant");
    const undated = { ...grant("Rolling Grant"), daysUntil: null, nofo: { ...grant("Rolling Grant").nofo, expiration_date: undefined } };
    const { html, text } = await render({ new: [dated, undated] });
    for (const out of [html, text]) {
      expect(out).not.toContain("Department:");
      expect(out).not.toMatch(/Category: Transportation( ·| &middot;)/);
      expect(out).toContain("No deadline listed");
    }
    expect(html).toContain("Department of Transportation &middot; Transportation");
    expect(html).toMatch(/Deadline Jan 1, 2099<span aria-hidden="true"[^>]*>[^<]*<\/span><strong [^>]*>Closes in 3 days<\/strong>/);
    expect(text).toContain("  Department of Transportation · Transportation · Deadline Jan 1, 2099\n");
    expect(text).toContain("  Department of Transportation · Transportation · No deadline listed\n");
  });

  it("puts the intro in a hidden preheader before the content", async () => {
    const { html } = await render({ new: [grant("Bridge Grant")] });
    const intro = "We found 1 new grant matching your preferences.";
    const pre = html.match(/<div aria-hidden="true" style="display:none;[^"]*">([^<]*)<\/div>/);
    expect(pre?.[1].startsWith(intro)).toBe(true);
    expect(html.indexOf(pre![0])).toBeLessThan(html.indexOf('<div role="article"'));
  });

  it("is light by default and switches to its own dark palette where the mail app allows", async () => {
    const { contrastRatio, readableBrandColorOnDark, DIGEST_DARK_BG } = await import("grantwell-shared");
    const { html } = await render({ new: [grant("Bridge Grant")] }, { brandColor: "#002868" });
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain(":root{color-scheme:light dark;supported-color-schemes:light dark}");
    expect(html).toContain('<body bgcolor="#ffffff" class="gw-body" style="margin:0;padding:0;background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);">');
    const dark = html.match(/@media \(prefers-color-scheme:dark\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dark).toContain(`.gw-body{background:${DIGEST_DARK_BG}!important}`);
    const link = readableBrandColorOnDark("#002868");
    expect(dark).toContain(`.gw-link{color:${link}!important}`);
    expect(contrastRatio(link, DIGEST_DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#b9c4c0", DIGEST_DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(html).toMatch(/<a href="[^"]+" class="gw-link"[^>]*>Bridge Grant<\/a>/);
    expect(html).toMatch(/<td bgcolor="#002868" class="gw-pad"/);
  });

  it("falls back to the app name in the brand bar when there is no wordmark", async () => {
    const { html } = await render({ new: [grant("Bridge Grant")] }, { logoUrl: "", appName: "GrantWell Colorado" });
    expect(html).not.toContain("<img");
    expect(html).toMatch(/<td bgcolor="#[0-9a-fA-F]{6}" class="gw-pad"[^>]*><span [^>]*>GrantWell Colorado<\/span><\/td>/);
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

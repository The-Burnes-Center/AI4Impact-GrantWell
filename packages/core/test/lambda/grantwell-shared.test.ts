import { createHmac } from "node:crypto";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let shared: any;
beforeAll(async () => {
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }, { code: "RI", name: "Rhode Island" }]));
  vi.resetModules();
  shared = await import("grantwell-shared");
});

const http = (claims: Record<string, unknown>) => ({ requestContext: { authorizer: { jwt: { claims } } } });
const roles = (...r: string[]) => JSON.stringify(r);

describe("requireAdmin", () => {
  it("lets Admin, Developer and PlatformAdmin through", () => {
    for (const role of ["Admin", "Developer", "PlatformAdmin"]) {
      expect(shared.requireAdmin(http({ "custom:role": roles("User", role) })), role).toBeNull();
    }
  });

  it("answers 403 for a user, a missing claim or an unparseable claim", () => {
    for (const claim of [roles("User"), undefined, "Admin", "not json"]) {
      const res = shared.requireAdmin(http({ "custom:role": claim }));
      expect(res?.statusCode, String(claim)).toBe(403);
      expect(JSON.parse(res.body)).toEqual({ error: "Forbidden: Admin role required" });
    }
  });

  it("passes scheduled invocations, which carry no requestContext", () => {
    expect(shared.requireAdmin({ source: "aws.events" })).toBeNull();
  });
});

describe("resolveCallerScope", () => {
  it("makes an Admin with a supported state a state admin", () => {
    expect(shared.resolveCallerScope(http({ "custom:role": roles("Admin"), "custom:state": " ma " }))).toEqual({
      role: "stateAdmin",
      state: "MA",
    });
  });

  it("never treats an unsupported state as a scope", () => {
    expect(shared.resolveCallerScope(http({ "custom:role": roles("User"), "custom:state": "TX" }))).toEqual({
      role: "user",
      state: "",
    });
  });

  it("gives platform authority to PlatformAdmin even with a state", () => {
    expect(shared.resolveCallerScope(http({ "custom:role": roles("PlatformAdmin"), "custom:state": "MA" }))).toEqual({
      role: "regularAdmin",
      state: "",
    });
  });

  it("keeps a stateless Admin platform-wide only while the legacy flag is on", async () => {
    const statelessAdmin = http({ "custom:role": roles("Admin") });
    expect(shared.resolveCallerScope(statelessAdmin).role).toBe("regularAdmin");

    vi.stubEnv("LEGACY_STATELESS_ADMIN_IS_PLATFORM", "false");
    vi.resetModules();
    const migrated = await import("grantwell-shared");
    expect(migrated.resolveCallerScope(statelessAdmin)).toEqual({ role: "unscopedAdmin", state: "" });
    vi.unstubAllEnvs();
  });
});

describe("assertCanEditNofo", () => {
  const stateAdmin = { role: "stateAdmin", state: "MA" };

  it("lets a state admin edit only their own state's NOFOs", () => {
    expect(() => shared.assertCanEditNofo(stateAdmin, "state", "MA")).not.toThrow();
    expect(() => shared.assertCanEditNofo(stateAdmin, "state", "RI")).toThrow(/own state/);
    expect(() => shared.assertCanEditNofo(stateAdmin, "federal", null)).toThrow(/federal/);
  });

  it("denies users and unscoped admins with a 403", () => {
    for (const role of ["user", "unscopedAdmin"]) {
      try {
        shared.assertCanEditNofo({ role, state: "" }, "federal", null);
        expect.unreachable(role);
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
      }
    }
  });
});

describe("assertCanEditNofoOr403", () => {
  const ddb = mockClient(DynamoDBClient);
  const deps = () => ({ client: new DynamoDBClient({}), GetItemCommand, marshall, unmarshall });
  const stateAdmin = http({ "custom:role": roles("Admin"), "custom:state": "MA" });

  beforeEach(() => ddb.reset());

  it("allows a state admin on their state's NOFO, read from the metadata table", async () => {
    ddb.on(GetItemCommand, { TableName: "nofos", Key: marshall({ nofo_name: "Ma Grant" }) }).resolves({
      Item: marshall({ nofo_name: "Ma Grant", scope: "state", state: "MA" }),
    });
    await expect(shared.assertCanEditNofoOr403(stateAdmin, deps(), "nofos", "Ma Grant")).resolves.toBeNull();
  });

  it("fails closed for a state admin when the NOFO's scope can't be read", async () => {
    ddb.on(GetItemCommand).rejects(Object.assign(new Error("throttled"), { name: "ThrottlingException" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await shared.assertCanEditNofoOr403(stateAdmin, deps(), "nofos", "Ma Grant");
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toMatch(/Cannot verify NOFO scope/);
  });

  it("lets the create path through on a missing row only when asked", async () => {
    ddb.on(GetItemCommand).resolves({});
    expect((await shared.assertCanEditNofoOr403(stateAdmin, deps(), "nofos", "New"))?.statusCode).toBe(403);
    await expect(
      shared.assertCanEditNofoOr403(stateAdmin, deps(), "nofos", "New", { allowMissingRow: true })
    ).resolves.toBeNull();
  });

  it("still denies a state admin an existing row with no scope, or an unreadable one, on the create path", async () => {
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Old" }) });
    const opts = { allowMissingRow: true };
    expect((await shared.assertCanEditNofoOr403(stateAdmin, deps(), "nofos", "Old", opts))?.statusCode).toBe(403);
    ddb.on(GetItemCommand).rejects(new Error("throttled"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await shared.assertCanEditNofoOr403(stateAdmin, deps(), "nofos", "Old", opts))?.statusCode).toBe(403);
  });
});

describe("single-state deployment", () => {
  const ddb = mockClient(DynamoDBClient);
  const deps = () => ({ client: new DynamoDBClient({}), GetItemCommand, marshall, unmarshall });
  let single: any;
  beforeAll(async () => {
    vi.stubEnv("SINGLE_STATE", "MA");
    vi.resetModules();
    single = await import("grantwell-shared");
    vi.unstubAllEnvs();
  });
  beforeEach(() => ddb.reset());

  it("lets the state's admin edit every NOFO, federal and unscoped ones included", async () => {
    const maAdmin = { role: "stateAdmin", state: "MA" };
    expect(single.canEditAnyNofo(maAdmin)).toBe(true);
    expect(() => single.assertCanEditNofo(maAdmin, "federal", null)).not.toThrow();
    ddb.on(GetItemCommand).resolves({ Item: marshall({ nofo_name: "Old Grant" }) });
    const event = http({ "custom:role": roles("Admin"), "custom:state": "MA" });
    await expect(single.assertCanEditNofoOr403(event, deps(), "nofos", "Old Grant")).resolves.toBeNull();
  });

  it("still denies users, and changes nothing on a multi-state deployment", () => {
    expect(single.canEditAnyNofo({ role: "user", state: "MA" })).toBe(false);
    expect(single.canEditAnyNofo({ role: "unscopedAdmin", state: "" })).toBe(false);
    expect(shared.canEditAnyNofo({ role: "stateAdmin", state: "MA" })).toBe(false);
  });
});

describe("getAuthenticatedUserId", () => {
  it("reads the sub from either authorizer shape, else null", () => {
    expect(shared.getAuthenticatedUserId(http({ sub: "u1" }))).toBe("u1");
    expect(shared.getAuthenticatedUserId({ requestContext: { authorizer: { claims: { sub: "u2" } } } })).toBe("u2");
    expect(shared.getAuthenticatedUserId({ body: JSON.stringify({ sub: "spoofed" }) })).toBeNull();
  });
});

describe("unsubscribe tokens", () => {
  const SECRET = "s3cret";
  const now = () => Math.floor(Date.now() / 1000);

  it("round-trips a fresh token", () => {
    expect(shared.verifyUnsubscribeToken(shared.makeUnsubscribeToken("user-1", SECRET), SECRET)).toBe("user-1");
  });

  it("rejects a token signed with another secret or for another user", () => {
    const token = shared.makeUnsubscribeToken("user-1", SECRET);
    expect(shared.verifyUnsubscribeToken(token, "other")).toBeNull();
    const [, ts, sig] = token.split(".");
    const forged = `${Buffer.from("user-2").toString("base64url")}.${ts}.${sig}`;
    expect(shared.verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it("expires after 90 days and refuses one dated more than a day ahead", () => {
    const day = 86400;
    expect(shared.verifyUnsubscribeToken(shared.makeUnsubscribeToken("u", SECRET, now() - 89 * day), SECRET)).toBe("u");
    expect(shared.verifyUnsubscribeToken(shared.makeUnsubscribeToken("u", SECRET, now() - 91 * day), SECRET)).toBeNull();
    expect(shared.verifyUnsubscribeToken(shared.makeUnsubscribeToken("u", SECRET, now() + 2 * day), SECRET)).toBeNull();
  });

  it("still honours the two-part links already sitting in delivered mail", () => {
    const legacySig = createHmac("sha256", SECRET).update("user-1").digest("base64url");
    expect(shared.verifyUnsubscribeToken(`${Buffer.from("user-1").toString("base64url")}.${legacySig}`, SECRET)).toBe(
      "user-1"
    );
  });

  it("makes no token at all without a secret", () => {
    expect(shared.makeUnsubscribeToken("u", "")).toBe("");
    expect(shared.verifyUnsubscribeToken("a.b.c", "")).toBeNull();
  });
});

describe("sanitizeContentHtml", () => {
  it("drops scripts, iframes, event handlers and unknown tags but keeps formatting", () => {
    const dirty =
      '<p onclick="steal()">Hi <strong>there</strong></p><script>alert(1)</script>' +
      '<iframe src="https://evil"></iframe><img src=x onerror=alert(1)><a href="javascript:x">link</a><!-- c -->';
    expect(shared.sanitizeContentHtml(dirty)).toBe("<p>Hi <strong>there</strong></p>link");
  });

  it("returns an empty string for null input", () => {
    expect(shared.sanitizeContentHtml(null)).toBe("");
  });
});

describe("markdownToContentHtml", () => {
  it("nests the editor's ### and #### headings under the section's h2, and keeps older levels at h3", () => {
    expect(shared.markdownToContentHtml("### Goal\n\nText.\n\n#### Measures")).toBe(
      "<h3>Goal</h3><p>Text.</p><h4>Measures</h4>"
    );
    expect(shared.markdownToContentHtml("# Top\n\n## Second")).toBe("<h3>Top</h3><h3>Second</h3>");
  });

  it("converts the editor's lists, links and tables", () => {
    const html = shared.markdownToContentHtml(
      [
        "- one",
        "- two with [plan](https://example.org/plan)",
        "",
        "1. first",
        "2. second",
        "",
        "| Item  | Cost      |",
        "| ----- | --------- |",
        "| Boats | **$4,000** |",
      ].join("\n")
    );
    expect(html).toBe(
      '<ul><li>one</li><li>two with <a href="https://example.org/plan">plan</a></li></ul>' +
        "<ol><li>first</li><li>second</li></ol>" +
        "<table><thead><tr><th>Item</th><th>Cost</th></tr></thead>" +
        "<tbody><tr><td>Boats</td><td><strong>$4,000</strong></td></tr></tbody></table>"
    );
  });
});

describe("markdownToContentHtml exports", () => {
  it("makes http(s) and mailto links real links and leaves other targets as their text", () => {
    expect(
      shared.markdownToContentHtml(
        "See [the plan](https://example.org/a_b_c?x=1&y=2), [mail](mailto:a@b.org), [bad](javascript:x) and [rel](/local)."
      )
    ).toBe(
      '<p>See <a href="https://example.org/a_b_c?x=1&amp;y=2">the plan</a>, <a href="mailto:a@b.org">mail</a>, bad and rel.</p>'
    );
    expect(shared.markdownToContentHtml("[**Bold** link](https://example.org)")).toBe(
      '<p><a href="https://example.org"><strong>Bold</strong> link</a></p>'
    );
  });

  it("keeps nested lists nested, whatever their kind and indent", () => {
    expect(
      shared.markdownToContentHtml(
        ["- one", "  - inner a", "  - inner b", "    1. deep", "- two", "", "1. first", "   - sub", "2. second"].join("\n")
      )
    ).toBe(
      "<ul><li>one<ul><li>inner a</li><li>inner b<ol><li>deep</li></ol></li></ul></li><li>two</li></ul>" +
        "<ol><li>first<ul><li>sub</li></ul></li><li>second</li></ol>"
    );
  });

  it("keeps a continuation line in its item and still ends the list at a blank line", () => {
    expect(shared.markdownToContentHtml("- item\n  more text\n\nAfter")).toBe("<ul><li>item more text</li></ul><p>After</p>");
  });

  it("does not split a table cell at an escaped pipe", () => {
    expect(shared.markdownToContentHtml("| A | B |\n| --- | --- |\n| x \\| y | z \\| |")).toBe(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x | y</td><td>z |</td></tr></tbody></table>"
    );
  });
});

describe("sanitizeContentHtml links", () => {
  it("keeps <a> only for the exporters, with only an http(s) or mailto href", () => {
    const html =
      '<a href="https://example.org/?a=1&amp;b=2" target="_blank" onclick="x()">ok</a>' +
      "<a href='mailto:a@b.org'>mail</a><a href=\"javascript:alert(1)\">js</a><a href=\" jav&#x61;script:x\">enc</a><a>bare</a>";
    expect(shared.sanitizeContentHtml(html, { links: true })).toBe(
      '<a href="https://example.org/?a=1&amp;b=2">ok</a><a href="mailto:a@b.org">mail</a><a>js</a><a>enc</a><a>bare</a>'
    );
    expect(shared.sanitizeContentHtml(html)).toBe("okmailjsencbare");
  });
});

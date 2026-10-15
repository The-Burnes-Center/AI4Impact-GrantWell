import { mockClient } from "aws-sdk-client-mock";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { createHash } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const s3 = mockClient(S3Client);
const ddb = mockClient(DynamoDBClient);
const bedrock = mockClient(BedrockRuntimeClient);

let handler: (event: any) => Promise<{ batchItemFailures: { itemIdentifier: string }[] }>;
beforeAll(async () => {
  vi.stubEnv("GRANTS_GOV_API_KEY", "key");
  vi.stubEnv("BUCKET", "nofo-bucket");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("HAIKU_MODEL_ID", "haiku");
  ({ handler } = await import("../../lib/chatbot-api/functions/nofo-scraper/opportunity-processor/index.mjs"));
});

const DETAILS = "https://api.simpler.grants.gov/v1/opportunities/";
const PDF = "%PDF-1.7 fake solicitation";

const NOFO_PARAGRAPH =
  "<p>Eligible applicants include states and nonprofit organizations. This grant program provides funding " +
  "with each award up to $500,000. Application deadline: January 5, 2027. Applicants must submit a project " +
  "narrative and budget justification describing eligibility and outcomes.</p>\n";
const FULL_NOFO_HTML = `<!doctype html><html><body><h1>PAR-25-267</h1>${NOFO_PARAGRAPH.repeat(100)}</body></html>`;

function opportunity(overrides: Record<string, any> = {}) {
  const { summary, ...rest } = overrides;
  return {
    opportunity_id: 101,
    opportunity_title: "Test Grant",
    opportunity_number: "TEST-26-001",
    agency_name: "Test Agency",
    posted_date: "2026-09-01",
    updated_at: "2026-10-01T00:00:00Z",
    attachments: [],
    ...rest,
    summary: {
      close_date: "2026-12-31",
      post_date: "2026-09-01",
      funding_categories: ["health"],
      additional_info_url: null,
      ...summary,
    },
  };
}

const unreachable = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });

type Route = { status?: number; body?: string; contentType?: string } | "reject";

function doc(url: string, route: Exclude<Route, "reject">) {
  const status = route.status ?? 200;
  const bytes = Buffer.from(route.body ?? "");
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    url,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? route.contentType ?? null : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

/** Serves the details API for `opp` and each document URL from `routes`; anything else is unreachable. */
function serve(opp: Record<string, any>, routes: Record<string, Route> = {}) {
  const fetchMock = vi.fn(async (url: string, _init?: any) => {
    if (url === `${DETAILS}${opp.opportunity_id}`) return { ok: true, json: async () => ({ data: opp }) };
    const route = routes[url];
    if (!route || route === "reject") throw unreachable();
    return doc(url, route);
  });
  vi.stubGlobal("fetch", fetchMock);
  return () => fetchMock.mock.calls.map(([u]) => u).filter((u) => !u.startsWith(DETAILS));
}

const message = (body: Record<string, unknown>, messageId = "m-1") => ({
  Records: [{ messageId, body: JSON.stringify({ opportunityId: 101, opportunityTitle: "Test Grant", isUpdate: false, ...body }) }],
});

const uploads = () =>
  s3
    .commandCalls(PutObjectCommand)
    .map((c) => c.args[0].input)
    .filter((i) => !i.Key!.endsWith(".metadata.json"));
const sidecars = () =>
  s3
    .commandCalls(PutObjectCommand)
    .map((c) => c.args[0].input.Key)
    .filter((k) => k!.endsWith(".metadata.json"));
/** Splits a SET-only UpdateExpression into plain assignments and create-only (if_not_exists) ones. */
function parseUpdate(input: any) {
  const names: Record<string, string> = input.ExpressionAttributeNames ?? {};
  const values = unmarshall(input.ExpressionAttributeValues);
  const expr: string = input.UpdateExpression;
  expect(expr.startsWith("SET ")).toBe(true);
  const set: Record<string, unknown> = {};
  const onCreate: Record<string, unknown> = {};
  for (const clause of expr.slice(4).split(/,\s*(?![^()]*\))/)) {
    const [lhs, rhs] = clause.split(" = ");
    const field = names[lhs] ?? lhs;
    const ifNotExists = /^if_not_exists\(([^,]+),\s*(:\w+)\)$/.exec(rhs);
    if (ifNotExists) onCreate[field] = values[ifNotExists[2]];
    else set[field] = values[rhs];
  }
  return { name: unmarshall(input.Key).nofo_name as string, set, onCreate };
}

const updates = () => ddb.commandCalls(UpdateItemCommand).map((c) => parseUpdate(c.args[0].input));

/** The rows the recorded UpdateItem calls leave behind, applied on top of `existing`. */
function metadata(existing: Record<string, unknown>[] = []) {
  const rows = new Map(existing.map((r) => [r.nofo_name as string, { ...r }]));
  const touched = new Set<string>();
  for (const { name, set, onCreate } of updates()) {
    const row = rows.get(name) ?? { nofo_name: name };
    for (const [k, v] of Object.entries(onCreate)) if (!(k in row)) row[k] = v;
    rows.set(name, Object.assign(row, set));
    touched.add(name);
  }
  return [...touched].map((name) => rows.get(name)!);
}

beforeEach(() => {
  s3.reset();
  ddb.reset();
  bedrock.reset();
  s3.on(PutObjectCommand).resolves({});
  ddb.on(GetItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  bedrock.rejects(new Error("Bedrock should not be called"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T13:00:00.000Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe("opportunity processor", () => {
  it("uploads a single attachment PDF with sidecar and metadata", async () => {
    const url = "https://grants.gov/attachments/nofo.pdf";
    const fetched = serve(opportunity({ attachments: [{ download_path: url, file_description: "NOFO" }] }), {
      [url]: { body: PDF, contentType: "application/pdf" },
    });

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(fetched()).toEqual([url]);
    expect(uploads()).toHaveLength(1);
    expect(uploads()[0]).toMatchObject({ Bucket: "nofo-bucket", Key: "Test Grant/NOFO-File-PDF", ContentType: "application/pdf" });
    expect(Buffer.from(uploads()[0].Body as Buffer).toString()).toBe(PDF);
    expect(sidecars()).toEqual(["Test Grant/NOFO-File-PDF.metadata.json"]);
    expect(metadata()).toHaveLength(1);
    expect(metadata()[0]).toMatchObject({
      nofo_name: "Test Grant",
      opportunity_id: 101,
      agency: "Test Agency",
      category: "Health",
      expiration_date: "2026-12-31",
      source_updated_at: "2026-10-01T00:00:00Z",
      scope: "federal",
    });
  });

  it("keeps an NIH guide page as the NOFO text and never fetches its strategic-plan PDF", async () => {
    const page = "http://grants.nih.gov/grants/guide/pa-files/PAR-25-267.html";
    const plan = "https://abs2.od.nih.gov/Docs/NIH_StrategicPlan_FY2021-2025.pdf";
    const html = FULL_NOFO_HTML.replace("</h1>", `</h1><a href="${plan}">NIH-Wide Strategic Plan</a>`);
    const fetched = serve(opportunity({ summary: { additional_info_url: page } }), {
      [page]: { body: html, contentType: "text/html; charset=utf-8" },
      [plan]: { body: PDF, contentType: "application/pdf" },
    });

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(fetched()).toEqual([page]);
    expect(uploads()).toHaveLength(1);
    expect(uploads()[0]).toMatchObject({ Key: "Test Grant/NOFO-File-TXT", ContentType: "text/plain; charset=utf-8" });
    const text = Buffer.from(uploads()[0].Body as Buffer).toString();
    expect(text).toContain("Eligible applicants include states");
    expect(text).not.toContain("<");
    expect(text.length).toBeGreaterThan(20000);
    expect(sidecars()).toEqual(["Test Grant/NOFO-File-TXT.metadata.json"]);
    expect(metadata()).toHaveLength(1);
  });

  it("follows a short landing page's Notice of Funding Opportunity link to the PDF", async () => {
    const page = "https://www.example.gov/programs/widget";
    const pdf = "https://www.example.gov/files/widget-2026.pdf";
    const html = `<html><body><h1>Widget Program</h1>${NOFO_PARAGRAPH.repeat(3)}<a href="/files/widget-2026.pdf">Notice of Funding Opportunity</a></body></html>`;
    const fetched = serve(opportunity({ summary: { additional_info_url: page } }), {
      [page]: { body: html, contentType: "text/html" },
      [pdf]: { body: PDF, contentType: "application/pdf" },
    });

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(fetched()).toEqual([page, pdf]);
    expect(uploads().map((u) => u.Key)).toEqual(["Test Grant/NOFO-File-PDF"]);
    expect(Buffer.from(uploads()[0].Body as Buffer).toString()).toBe(PDF);
  });

  it("does not follow report or strategic-plan PDFs from a landing page", async () => {
    const page = "https://www.nsf.gov/epscor";
    const report = "https://www.nsf.gov/files/Envisioning-The-Future-of-EPSCoR-Report.pdf";
    const plan = "https://www.nsf.gov/files/NSF-Strategic-Plan-2022.pdf";
    const html = `<html><body><h1>EPSCoR</h1>${NOFO_PARAGRAPH.repeat(3)}
      <a href="${report}">Envisioning the Future of EPSCoR</a>
      <a href="${plan}">Strategic Plan</a></body></html>`;
    const fetched = serve(opportunity({ summary: { additional_info_url: page } }), {
      [page]: { body: html, contentType: "text/html" },
      [report]: { body: PDF, contentType: "application/pdf" },
      [plan]: { body: PDF, contentType: "application/pdf" },
    });

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(fetched()).toEqual([page]);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(metadata()).toHaveLength(0);
  });

  it("skips without failing when the followed link times out", async () => {
    const page = "https://www.example.gov/programs/widget";
    const pdf = "https://www.example.gov/files/widget-2026.pdf";
    const html = `<html><body>${NOFO_PARAGRAPH.repeat(3)}<a href="${pdf}">Notice of Funding Opportunity</a></body></html>`;
    const fetched = serve(opportunity({ summary: { additional_info_url: page } }), {
      [page]: { body: html, contentType: "text/html" },
      [pdf]: "reject",
    });

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(fetched()).toEqual([page, pdf]);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(metadata()).toHaveLength(0);
  });

  describe("BJA solicitations listed with only the office homepage", () => {
    const bja = () =>
      opportunity({ opportunity_number: "O-BJA-2026-172760", summary: { additional_info_url: "www.bja.ojp.gov" } });
    const solicitation = "https://www.ojp.gov/funding/docs/bja-2026-172760.pdf";
    const homepage = "https://www.bja.ojp.gov/";
    const homepageHtml = `<html><body><h1>Bureau of Justice Assistance</h1><p>Funding, programs, and grant applications.</p></body></html>`;

    it("fetches the solicitation PDF built from the opportunity number", async () => {
      const fetched = serve(bja(), {
        [solicitation]: { body: PDF, contentType: "application/pdf" },
        [homepage]: { body: homepageHtml, contentType: "text/html" },
      });

      const res = await handler(message({}));

      expect(res.batchItemFailures).toEqual([]);
      expect(fetched()).toEqual([solicitation]);
      expect(uploads().map((u) => u.Key)).toEqual(["Test Grant/NOFO-File-PDF"]);
      expect(metadata()).toHaveLength(1);
    });

    it("falls back to the normalized homepage when the solicitation 404s, and skips it", async () => {
      const fetched = serve(bja(), {
        [solicitation]: { status: 404 },
        [homepage]: { body: homepageHtml, contentType: "text/html" },
      });

      const res = await handler(message({}));

      expect(res.batchItemFailures).toEqual([]);
      expect(fetched()).toEqual([solicitation, homepage]);
      expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
      expect(metadata()).toHaveLength(0);
    });

    it("fails the message when every path is unreachable", async () => {
      const fetched = serve(bja(), { [solicitation]: "reject", [homepage]: "reject" });

      const res = await handler(message({}, "outage"));

      expect(res.batchItemFailures).toEqual([{ itemIdentifier: "outage" }]);
      expect(fetched()).toEqual([solicitation, homepage]);
      expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
      expect(metadata()).toHaveLength(0);
    });
  });

  it("skips a years-old opportunity with no close date before fetching any document", async () => {
    const url = "https://nspires.nasaprs.com/nra.pdf";
    const fetched = serve(
      opportunity({
        agency_name: "NASA",
        posted_date: "2018-02-22",
        attachments: [{ download_path: url }],
        summary: { close_date: null, post_date: "2018-02-22" },
      }),
      { [url]: { body: PDF, contentType: "application/pdf" } }
    );

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(fetched()).toEqual([]);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(metadata()).toHaveLength(0);
  });

  it("stores a placeholder 2076 close date as no expiration", async () => {
    const url = "https://grants.gov/attachments/nofo.pdf";
    serve(opportunity({ attachments: [{ download_path: url }], summary: { close_date: "2076-09-01" } }), {
      [url]: { body: PDF, contentType: "application/pdf" },
    });

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(metadata()).toHaveLength(1);
    expect(metadata()[0].expiration_date).toBeNull();
  });

  it("retries an unreachable http:// URL once over https", async () => {
    const http = "http://nspires.nasaprs.com/external/viewrepositorydocument/nofo.pdf";
    const https = "https://nspires.nasaprs.com/external/viewrepositorydocument/nofo.pdf";
    const fetched = serve(opportunity({ attachments: [{ download_path: http }] }), {
      [http]: "reject",
      [https]: { body: PDF, contentType: "application/pdf" },
    });

    const res = await handler(message({}));

    expect(res.batchItemFailures).toEqual([]);
    expect(fetched()).toEqual([http, https]);
    expect(uploads().map((u) => u.Key)).toEqual(["Test Grant/NOFO-File-PDF"]);
  });

  it("keeps the stored name when grants.gov has retitled the opportunity", async () => {
    const url = "https://grants.gov/attachments/nofo.pdf";
    serve(opportunity({ opportunity_title: "New Title", attachments: [{ download_path: url }] }), {
      [url]: { body: PDF, contentType: "application/pdf" },
    });

    const res = await handler(message({ opportunityTitle: "New Title", isUpdate: true, nofoName: "Old Title" }));

    expect(res.batchItemFailures).toEqual([]);
    expect(uploads().map((u) => u.Key)).toEqual(["Old Title/NOFO-File-PDF"]);
    expect(sidecars()).toEqual(["Old Title/NOFO-File-PDF.metadata.json"]);
    expect(metadata().map((m) => m.nofo_name)).toEqual(["Old Title"]);
    const lookups = ddb.commandCalls(GetItemCommand).map((c) => unmarshall(c.args[0].input.Key!).nofo_name);
    expect(lookups.length).toBeGreaterThan(0);
    expect(lookups.every((n) => n === "Old Title")).toBe(true);
  });

  describe("metadata writes", () => {
    const url = "https://grants.gov/attachments/nofo.pdf";
    const stored = {
      nofo_name: "Test Grant",
      opportunity_id: 101,
      agency: "Old Agency",
      category: "Education",
      expiration_date: "2026-11-30",
      source_updated_at: "2026-09-01T00:00:00Z",
      content_hash: "old-hash",
      grant_type: "state",
      scope: "state",
      state: "MA",
      status: "archived",
      isPinned: "true",
      is_rolling: "true",
      created_at: "2026-01-01T00:00:00.000Z",
      review_flag: { reason: "Missing eligibility", missingCategories: ["eligibility"] },
      processing_status: "synthesizing",
      processing_outcome: "published",
      processing_completed_at: "2026-09-02T00:00:00.000Z",
      pipeline_claim_at: "2026-10-14T12:55:00.000Z",
      pipeline_claim_execution: "exec-1",
      pipeline_execution_arn: "arn:exec-1",
      promoted_from: "Federal Grant",
    };

    beforeEach(() => {
      ddb.on(GetItemCommand).resolves({ Item: marshall(stored) });
      serve(opportunity({ attachments: [{ download_path: url }] }), {
        [url]: { body: PDF, contentType: "application/pdf" },
      });
    });

    it("updates in place and only sets grants.gov fields", async () => {
      const res = await handler(message({ isUpdate: true }));

      expect(res.batchItemFailures).toEqual([]);
      expect(ddb.commandCalls(PutItemCommand)).toHaveLength(0);
      const all = updates();
      expect(all.length).toBeGreaterThan(0);
      const setFields = new Set(all.flatMap((u) => Object.keys(u.set)));
      expect([...setFields].sort()).toEqual(
        ["agency", "category", "content_hash", "expiration_date", "opportunity_id", "source_updated_at", "updated_at"]
      );
      for (const u of all) {
        expect(u.onCreate).not.toHaveProperty("is_rolling");
        expect(Object.keys(u.onCreate).every((f) => ["created_at", "grant_type", "scope", "state", "status", "isPinned"].includes(f))).toBe(true);
      }
      for (const input of ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input)) {
        expect(input.UpdateExpression).not.toMatch(/REMOVE|review_flag|processing_|pipeline_|is_rolling|promoted_from/);
      }
    });

    it("keeps admin, review, processing and scope fields and refreshes the grants.gov ones", async () => {
      await handler(message({ isUpdate: true }));

      const [row] = metadata([stored]);
      expect(row).toEqual({
        ...stored,
        agency: "Test Agency",
        category: "Health",
        expiration_date: "2026-12-31",
        source_updated_at: "2026-10-01T00:00:00Z",
        content_hash: expect.not.stringMatching(/^old-hash$/),
        updated_at: "2026-10-14T13:00:00.000Z",
      });
    });

    it("sets scope, state, status and created_at only when the row is new", async () => {
      ddb.on(GetItemCommand).resolves({});

      await handler(message({}));

      const [first] = updates();
      expect(first.onCreate).toEqual({
        created_at: "2026-10-14T13:00:00.000Z",
        grant_type: "federal",
        scope: "federal",
        state: null,
        status: "active",
        isPinned: "false",
      });
      expect(first.set).not.toHaveProperty("scope");
      expect(first.set).not.toHaveProperty("state");
      expect(first.set).not.toHaveProperty("status");
      expect(metadata()[0]).toMatchObject({ scope: "federal", status: "active", content_hash: expect.any(String) });
    });

    it("writes the row before the document upload that starts processing", async () => {
      const order: string[] = [];
      ddb.on(UpdateItemCommand).callsFake((input) => {
        order.push(`ddb:${/content_hash/.test(input.UpdateExpression) ? "hash" : "row"}`);
        return {};
      });
      s3.on(PutObjectCommand).callsFake((input) => {
        order.push(`s3:${input.Key}`);
        return {};
      });

      await handler(message({ isUpdate: true }));

      expect(order).toEqual([
        "ddb:row",
        "s3:Test Grant/NOFO-File-PDF",
        "s3:Test Grant/NOFO-File-PDF.metadata.json",
        "ddb:hash",
      ]);
    });

    it("leaves the stored hash and source date alone when the upload fails, so the retry uploads again", async () => {
      s3.on(PutObjectCommand).rejects(new Error("S3 down"));

      const res = await handler(message({ isUpdate: true }, "s3-down"));

      expect(res.batchItemFailures).toEqual([{ itemIdentifier: "s3-down" }]);
      const [row] = metadata([stored]);
      expect(row.content_hash).toBe("old-hash");
      expect(row.source_updated_at).toBe("2026-09-01T00:00:00Z");
    });

    it("records the source date without uploading when the document is unchanged", async () => {
      const hash = createHash("sha256").update(Buffer.from(PDF)).digest("hex");
      ddb.on(GetItemCommand).resolves({ Item: marshall({ ...stored, content_hash: hash }) });

      await handler(message({ isUpdate: true }));

      expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
      expect(updates()).toHaveLength(1);
      expect(metadata([stored])[0]).toMatchObject({ content_hash: hash, source_updated_at: "2026-10-01T00:00:00Z", scope: "state", state: "MA" });
    });
  });
});

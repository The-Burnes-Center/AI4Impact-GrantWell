/**
 * Journey 6: every read-only API route answers with its exact status, as the admin test user and
 * without a token. API only. The NOFO summary read logs a view event and the profile read stamps
 * last-active, as every page load does; nothing else is written.
 *
 * Never call from here (they write, send mail, or start work): user create, delete, roles and
 * mfa-reset; /test-url; NOFO rename, delete, status, summary-update, overlay PUT/DELETE and
 * promote-copy; review approve, reject and needs-reupload; reupload-nofo and reprocess-nofo;
 * /automated-nofo-scraper; digest broadcast and POST preview; /submit-feedback;
 * /draft-generation; /ai-grant-search; PUT /notification-prefs; feature-rollout PATCH/PUT/DELETE;
 * user-documents upload-url and delete.
 */
import { randomUUID } from "node:crypto";
import { rawCall } from "../helpers/api";
import { runInfo } from "../helpers/config";
import { expect, test } from "../helpers/fixtures";
import { tokens } from "../helpers/session";

interface Probe {
  name: string;
  method: "GET" | "POST";
  path: () => string;
  body?: () => Promise<object>;
  status: number;
}

const documentKey = () => encodeURIComponent(`${runInfo().nofoName}/`);
const operation = (route: "/user-session" | "/user-draft", op: string, extra: object = {}): Probe => ({
  name: `POST ${route} ${op}`,
  method: "POST",
  path: () => route,
  body: async () => ({ operation: op, user_id: (await tokens()).sub, ...extra }),
  status: 200,
});
const get = (path: string | (() => string), status: number, name?: string): Probe => {
  const resolve = typeof path === "string" ? () => path : path;
  return { name: `GET ${name ?? path}`, method: "GET", path: resolve, status };
};

const READS: Probe[] = [
  get("/s3-nofo-bucket-data", 200),
  get(() => `/s3-nofo-summary?documentKey=${documentKey()}`, 200, "/s3-nofo-summary (run's NOFO)"),
  get(() => `/s3-nofo-questions?documentKey=${documentKey()}`, 200, "/s3-nofo-questions (run's NOFO)"),
  get("/user-profile", 200),
  get("/user-profile/recently-viewed", 200),
  get("/feature-rollouts/me", 200),
  get("/notification-prefs", 200),
  get("/kb-sync/still-syncing", 200),
  get("/kb-sync/get-last-sync", 200),
  get("/admin/analytics", 200),
  get("/admin/processing-metrics", 200),
  get("/admin/processing-reviews", 200),
  get("/user-management/users?limit=1", 200),
  {
    name: "POST /user-documents/list (own folder)",
    method: "POST",
    path: () => "/user-documents/list",
    body: async () => ({ folderPrefix: `${(await tokens()).username}/${runInfo().nofoName}/` }),
    status: 200,
  },
  operation("/user-session", "list_sessions_by_user_id"),
  operation("/user-session", "list_all_sessions_by_user_id"),
  operation("/user-draft", "list_drafts_by_user_id"),
  operation("/user-draft", "list_all_drafts_by_user_id"),
  operation("/user-draft", "list_draft_versions", { session_id: randomUUID() }),
];

const NOT_FOUND: Probe[] = [
  get(`/draft-generation-jobs/${randomUUID()}`, 404, "/draft-generation-jobs/<random id>"),
  get(`/admin/processing-reviews/e2e-smoke-${randomUUID()}`, 404, "/admin/processing-reviews/<no such NOFO>"),
];

// Each handler checks for the Developer role before it reads or writes anything.
const DEVELOPER_ONLY: Probe[] = [
  get("/feature-rollouts/ai-grant-search", 403),
  get("/feature-rollouts/ai-grant-search/users", 403),
  get("/notification-digest/preview", 403),
];

async function expectStatus(probe: Probe, token: "none" | "user", status: number) {
  const body = token === "user" ? await probe.body?.() : undefined;
  const { status: actual, text } = await rawCall(probe.method, probe.path(), { body, token });
  expect(actual, `${probe.name} → ${actual}: ${text.slice(0, 300)}`).toBe(status);
}

test.describe("as the admin test user", () => {
  for (const probe of [...READS, ...NOT_FOUND, ...DEVELOPER_ONLY]) {
    test(`${probe.name} → ${probe.status}`, async () => {
      await expectStatus(probe, "user", probe.status);
    });
  }
});

test.describe("without a token", () => {
  for (const probe of [...READS, ...NOT_FOUND, ...DEVELOPER_ONLY]) {
    test(`${probe.name} → 401`, async () => {
      await expectStatus(probe, "none", 401);
    });
  }

  test("GET /unsubscribe without a token parameter → 400", async () => {
    const { status, text } = await rawCall("GET", "/unsubscribe", { token: "none" });
    expect(status, text.slice(0, 300)).toBe(400);
  });
});

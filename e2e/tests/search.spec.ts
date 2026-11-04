/** Journey 8: a plain-language AI search on the home page. Results are checked by structure only. */
import { expect, test } from "../helpers/fixtures";
import { rawCall } from "../helpers/api";
import { appUrl } from "../helpers/config";

const QUERY = "job training and health care for people in a rural community";

const isSearchCall = (url: string) => new URL(url).pathname.endsWith("/ai-grant-search");

test("a plain-language search returns grants and keeps the Status filter as set", async ({ page }, testInfo) => {
  const me = await rawCall("GET", "/feature-rollouts/me");
  expect(me.status, me.text.slice(0, 300)).toBe(200);
  test.skip(!JSON.parse(me.text)?.features?.aiGrantSearch?.canUse, "AI search isn't enabled for the test account");

  const statuses: number[] = [];
  page.on("response", (r) => {
    if (isSearchCall(r.url())) statuses.push(r.status());
  });

  await page.goto(appUrl("/home"));
  const input = page.locator("#grant-search-input");
  await expect(input, "AI search placeholder").toHaveAttribute("placeholder", /describe what you need/);
  const table = page.getByRole("table", { name: "Grants" });
  const rows = table.getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows.first()).toBeVisible();

  const status = page.locator("#status-filter");
  await status.selectOption("active");

  const committed = page.waitForResponse(
    (r) => r.request().method() === "POST" && isSearchCall(r.url()) && r.request().postDataJSON()?.committed === true,
    { timeout: 60_000 }
  );
  await input.fill(QUERY);
  await input.press("Enter");
  const response = await committed;
  expect(response.status(), "committed search").toBe(200);
  const body: { results: unknown[]; indexStatus?: string } = await response.json();
  await expect(table).toHaveAttribute("aria-busy", "false");

  if (body.indexStatus === "building") {
    const note = `Search index still building: ${body.results.length} name/category matches; ranked results not checked.`;
    console.log(`[e2e] ${note}`);
    testInfo.annotations.push({ type: "note", description: note });
  } else {
    expect(body.results.length, "ranked results").toBeGreaterThanOrEqual(1);
  }
  if (body.results.length > 0) {
    await expect(page.locator(".search-status-banner").filter({ hasText: /Found \d+ grants? matching your search/ })).toBeVisible();
    expect(await rows.count(), "result rows").toBeGreaterThanOrEqual(1);
  }

  await expect(status).toHaveValue("active");
  await expect(table.locator(".landing-table-row.archived"), "expired grants under Active").toHaveCount(0);
  expect(statuses.filter((s) => s >= 500), "AI search responses ≥ 500").toEqual([]);
});

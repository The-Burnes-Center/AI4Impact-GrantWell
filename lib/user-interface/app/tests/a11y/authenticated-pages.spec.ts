import { expect, test } from "@playwright/test";
import { describeViolations, scanPage } from "./axe-helpers";

const BASE_URL = process.env.A11Y_AUTH_BASE_URL;
const USERNAME = process.env.A11Y_USERNAME;
const PASSWORD = process.env.A11Y_PASSWORD;

test.skip(
  !BASE_URL || !USERNAME || !PASSWORD,
  "authenticated a11y scan needs A11Y_AUTH_BASE_URL, A11Y_USERNAME and A11Y_PASSWORD against a deployed environment"
);

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email-input").fill(USERNAME ?? "");
  await page.locator("#password-input").fill(PASSWORD ?? "");
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await expect(page.locator("main#main-content")).toBeVisible({ timeout: 30_000 });
});

const ROUTES: { path: string; name: string; ready: string }[] = [
  { path: "/home", name: "home / grants list", ready: "main#main-content" },
  { path: "/profile", name: "profile", ready: "main#main-content" },
  { path: "/chat/sessions", name: "chat sessions", ready: "main#main-content" },
  { path: "/document-editor/drafts", name: "document editor drafts", ready: "main#main-content" },
  { path: "/admin", name: "admin dashboard", ready: "main#main-content" },
];

for (const route of ROUTES) {
  test(`${route.name} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator(route.ready)).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const { violations } = await scanPage(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
}

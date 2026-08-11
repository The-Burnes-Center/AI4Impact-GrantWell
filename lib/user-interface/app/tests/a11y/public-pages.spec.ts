import { expect, test } from "@playwright/test";
import { describeViolations, scanPage } from "./axe-helpers";

const DEPLOYMENT_CONFIG = {
  Auth: {
    region: "us-east-1",
    userPoolId: "us-east-1_aaaaaaaaa",
    userPoolWebClientId: "0000000000000000000000000a",
    oauth: {
      domain: "a11y-scan.auth.us-east-1.amazoncognito.com",
      scope: ["email", "openid", "profile"],
      redirectSignIn: "http://127.0.0.1:4173/",
      redirectSignOut: "http://127.0.0.1:4173/",
      responseType: "code",
    },
  },
  httpEndpoint: "http://127.0.0.1:4173/unused-api",
  wsEndpoint: "ws://127.0.0.1:4173/unused-socket",
  federatedSignInProvider: "",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/aws-exports.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DEPLOYMENT_CONFIG),
    })
  );
});

async function expectNoViolations(page: import("@playwright/test").Page) {
  const { violations } = await scanPage(page);
  expect(violations, describeViolations(violations)).toEqual([]);
}

test.describe("landing page", () => {
  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#hero-title")).toBeVisible();
    await expectNoViolations(page);
  });

  test("has a single h1 and a main landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  });
});

test.describe("sign-in page", () => {
  test("sign-in step has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email-input")).toBeVisible();
    await expectNoViolations(page);
  });

  test("sign-up step has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();
    await expect(page.locator("#signup-email-input")).toBeVisible();
    await expect(page.locator("#signup-state-select")).toBeVisible();
    await expectNoViolations(page);
  });

  test("forgot-password step has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.locator("#forgot-email-input")).toBeVisible();
    await expectNoViolations(page);
  });

  test("the sign-in form is reachable and submittable by keyboard alone", async ({ page }) => {
    await page.goto("/login");
    const email = page.locator("#email-input");
    await expect(email).toBeVisible();

    for (let i = 0; i < 30; i += 1) {
      if (await email.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(email).toBeFocused();
  });
});

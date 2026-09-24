import { expect, type Page } from "@playwright/test";
import { generate } from "otplib";
import { USER_EMAIL, appUrl, requireEnv } from "./config";

/**
 * Stands in for Cloudflare's widget script, handing the form the dev bypass token. The real widget
 * refuses automated browsers, and the sign-in form won't submit without a token. Only the login
 * journey installs this, and that journey isn't traced, so the token never lands in an artifact.
 */
export async function stubTurnstile(page: Page): Promise<void> {
  const token = requireEnv("E2E_RESOLVED_BYPASS_TOKEN", "The Turnstile bypass token (read from SSM by global setup)");
  const script = `
    (() => {
      const token = ${JSON.stringify(token)};
      const widgets = new Map();
      const hand = (id) => setTimeout(() => widgets.get(id)?.callback?.(token), 0);
      window.turnstile = {
        render(_el, options) { const id = "e2e-" + widgets.size; widgets.set(id, options); hand(id); return id; },
        reset(id) { hand(id); },
        remove(id) { widgets.delete(id); },
        getResponse() { return token; },
      };
    })();`;
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: script })
  );
}

const TOTP_PERIOD_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A TOTP code with at least 5 s of its window left. Cognito refuses a code it has already
 * accepted, so a retried login first waits for the next window.
 */
export async function totpCode(isRetry: boolean): Promise<string> {
  const secret = requireEnv("E2E_TOTP_SECRET", "The test account's TOTP setup key");
  const intoWindow = Date.now() % TOTP_PERIOD_MS;
  if (isRetry || TOTP_PERIOD_MS - intoWindow < 5_000) await sleep(TOTP_PERIOD_MS - intoWindow + 500);
  return generate({ secret });
}

const PROFILE = { Agency: "GrantWell E2E", Organization: "GrantWell E2E Test Organization", "Role / Title": "Automated test" };

/** Signs in through the real form: email + password, the bypass, then the TOTP challenge. */
export async function signIn(page: Page, isRetry: boolean): Promise<void> {
  const password = requireEnv("E2E_USER_PASSWORD", "The test account's password");
  await stubTurnstile(page);
  await page.goto(appUrl("/login"));

  const form = page.getByRole("form", { name: "Sign in form" });
  await form.locator("#email-input").fill(USER_EMAIL);
  await form.locator("#password-input").fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();

  const mfa = page.getByRole("form", { name: "Two-step verification form" });
  await expect(mfa, "the test account must have TOTP enrolled").toBeVisible();
  await mfa.locator("#mfa-code-input").fill(await totpCode(isRetry));
  await mfa.getByRole("button", { name: "Verify code" }).click();

  // The profile gate only appears if the account's profile was never completed.
  const gate = page.getByRole("dialog", { name: "Complete your profile" });
  const home = page.getByRole("searchbox");
  await expect(gate.or(home)).toBeVisible({ timeout: 45_000 });
  if (await gate.isVisible()) {
    for (const [label, value] of Object.entries(PROFILE)) await gate.getByLabel(label).fill(value);
    await gate.getByRole("button", { name: "Save and continue" }).click();
    await expect(gate).toBeHidden();
  }
  await expect(page).toHaveURL(/\/home/);
}

/** From /home: finds the NOFO in the grants table, selects it and returns its action bar. */
export async function selectNofo(page: Page, nofoName: string) {
  await page.goto(appUrl("/home"));
  await page.locator("#grant-search-input").fill(nofoName);
  const table = page.getByRole("table", { name: "Grants" });
  await table.getByRole("button", { name: `Select ${nofoName}`, exact: true }).click();
  const actions = page.getByRole("navigation", { name: `Actions for ${nofoName}` });
  await expect(actions).toBeVisible();
  return actions;
}

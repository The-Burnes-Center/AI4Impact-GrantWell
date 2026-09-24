/**
 * Journey 1, and the session every other spec reuses: one login per run, because Cognito refuses
 * a TOTP code it has already accepted. This project runs untraced (see playwright.config.ts).
 */
import { expect, test as setup } from "@playwright/test";
import {
  clearRecentlyViewed,
  deleteDraft,
  deleteSession,
  listDraftIds,
  listNofos,
  listSessionIds,
  nofoSummary,
} from "../helpers/api";
import { signIn } from "../helpers/app";
import { AUTH_FILE, writeRunInfo } from "../helpers/config";

setup.describe.configure({ mode: "serial" });

setup("signs in with email, password and TOTP past the dev Turnstile bypass", async ({ page }, testInfo) => {
  await signIn(page, testInfo.retry > 0);
  await page.evaluate(() => localStorage.setItem("playgroundHelpSeen", "true"));
  await page.context().storageState({ path: AUTH_FILE });
});

setup("clears the test account's leftovers and picks a NOFO", async () => {
  // Earlier runs that crashed can leave sessions and drafts behind; the account is the suite's alone.
  for (const id of await listSessionIds()) await deleteSession(id);
  for (const id of await listDraftIds()) await deleteDraft(id);
  await clearRecentlyViewed();
  expect(await listSessionIds()).toEqual([]);
  expect(await listDraftIds()).toEqual([]);

  const cutoff = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const eligible = (await listNofos()).filter(
    (n) =>
      n.status === "active" &&
      !n.processing_status &&
      n.scope === "federal" &&
      (!n.expiration_date || n.expiration_date >= cutoff)
  );
  const forced = process.env.E2E_NOFO_NAME;
  if (forced && !eligible.some((n) => n.name === forced)) {
    throw new Error(`E2E_NOFO_NAME "${forced}" isn't an active federal NOFO open past ${cutoff}.`);
  }
  const order = forced ? [forced] : eligible.map((n) => n.name).sort(() => Math.random() - 0.5);

  for (const nofoName of order) {
    const sections = (await nofoSummary(nofoName)).ProjectNarrativeSections ?? [];
    if (sections.length === 0) continue;
    writeRunInfo({ nofoName, narrativeSections: sections.map((s) => s.item) });
    console.log(`[e2e] NOFO: "${nofoName}" (${sections.length} narrative sections; ${eligible.length} eligible)`);
    return;
  }
  throw new Error(`None of the ${eligible.length} eligible NOFOs has narrative sections.`);
});

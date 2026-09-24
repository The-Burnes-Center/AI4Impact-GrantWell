/** Journey 2: find the run's NOFO and read its key requirements (stored pipeline output). */
import { expect, test } from "@playwright/test";
import { clearRecentlyViewed, nofoSummary, type NofoSummary } from "../helpers/api";
import { selectNofo } from "../helpers/app";
import { runInfo } from "../helpers/config";

const TABS: [string, keyof NofoSummary][] = [
  ["Eligibility", "EligibilityCriteria"],
  ["Required Documents", "RequiredDocuments"],
  ["Narrative Sections", "ProjectNarrativeSections"],
  ["Key Deadlines", "KeyDeadlines"],
];

test.afterEach(async () => {
  await clearRecentlyViewed();
});

test("shows the NOFO's requirements in four tabs, one entry per summary item", async ({ page }) => {
  const { nofoName } = runInfo();
  const summary = await nofoSummary(nofoName);

  const actions = await selectNofo(page, nofoName);
  await actions.getByRole("button", { name: "View Key Requirements" }).click();
  await expect(page).toHaveURL(/\/requirements\//);

  const tablist = page.getByRole("tablist", { name: "Grant requirements" });
  await expect(tablist.getByRole("tab")).toHaveText(TABS.map(([label]) => new RegExp(`${label}$`)));

  for (const [label, field] of TABS) {
    await tablist.getByRole("tab", { name: label }).click();
    const items = page.getByRole("tabpanel", { name: label }).locator(".checklist-tabs__markdown > .custom-markdown > ul > li");
    await expect(items, `${label} entries`).toHaveCount((summary[field] ?? []).length);
    for (const text of await items.allInnerTexts()) expect(text.trim(), `${label} entry`).not.toBe("");
  }
});

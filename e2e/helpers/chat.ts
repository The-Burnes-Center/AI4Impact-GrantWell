import { expect, type Locator, type Page } from "@playwright/test";
import { selectNofo } from "./app";

/** Every assistant turn in the transcript, the fixed greeting ("Answer 1") included. */
export const answers = (page: Page) =>
  page.getByRole("group", { name: "Chat transcript" }).getByRole("article", { name: /^Answer \d+$/ });

/** The Grant panel beside the chat; it shows at the suite's desktop viewport. */
export const grantPanel = (page: Page) => page.getByRole("complementary", { name: "Grant panel" });

export const panelTab = (panel: Locator, name: string | RegExp) =>
  panel.getByRole("tablist", { name: "Grant panel" }).getByRole("tab", { name });

/** The source cards in the panel's Sources tab, one per citation (or per source when there are none). */
export const sourceCards = (panel: Locator) => panel.getByRole("tabpanel", { name: /^Sources/ }).getByRole("region");

/** From /home: opens a new chat for the NOFO and returns its session id once the greeting shows. */
export async function openChat(page: Page, nofoName: string): Promise<string> {
  const actions = await selectNofo(page, nofoName);
  await actions.getByRole("button", { name: "Chat with AI", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Chat: (?!Loading…)/);
  // The UI's fixed greeting, not model output: it only shows the page is ready.
  await expect(answers(page)).toHaveCount(1);
  await expect(grantPanel(page)).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop()!;
}

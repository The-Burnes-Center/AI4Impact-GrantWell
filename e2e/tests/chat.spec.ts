/** Journey 3: ask the assistant about the run's NOFO. The answer is checked by structure only. */
import { expect, test } from "../helpers/fixtures";
import { clearRecentlyViewed, deleteSession } from "../helpers/api";
import { answers, grantPanel, openChat, panelTab, sourceCards } from "../helpers/chat";
import { runInfo } from "../helpers/config";

const QUESTION = "Who is eligible to apply for this grant, and what are the main application requirements?";
const REPLY_TIMEOUT_MS = 180_000;

let sessionId: string | undefined;

test.afterEach(async ({ page }) => {
  // The handler saves the session after the stream and before it closes the socket; deleting
  // earlier would let that save re-create it.
  await page
    .getByRole("button", { name: "Stop generating response" })
    .waitFor({ state: "hidden", timeout: REPLY_TIMEOUT_MS })
    .catch(() => {});
  if (sessionId) await deleteSession(sessionId);
  await clearRecentlyViewed();
});

test("answers a question about the NOFO, with sources, and keeps it after a reload", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const { nofoName } = runInfo();

  sessionId = await openChat(page, nofoName);

  const input = page.locator("#chat-input");
  await input.fill(QUESTION);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(answers(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Stop generating response" })).toBeHidden({ timeout: REPLY_TIMEOUT_MS });
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Assistant replied$/ })).toHaveCount(1);
  await expect(page.getByText("<!ERROR!>")).toHaveCount(0);
  await expect(page.getByText(/Response timed out/)).toHaveCount(0);

  const answer = page.getByRole("article", { name: "Answer 2" });
  expect((await answer.innerText()).trim().length, "answer length").toBeGreaterThanOrEqual(40);

  const panel = grantPanel(page);
  const sources = panelTab(panel, /^Sources, \d+$/);
  await expect(sources).not.toHaveAccessibleName("Sources, 0");
  await sources.click();
  await expect(sourceCards(panel).first()).toBeVisible();
  const count = await sourceCards(panel).count();
  await expect(sources).toHaveAccessibleName(`Sources, ${count}`);
  expect(count, "number of sources").toBeGreaterThanOrEqual(1);

  // Saved: after a reload the exchange comes back from the session store.
  await page.reload();
  const transcript = page.getByRole("group", { name: "Chat transcript" });
  await expect(transcript).toContainText(`You said: ${QUESTION}`);
  const reloaded = transcript.getByRole("article", { name: "Answer 2" });
  await expect(reloaded).toBeVisible();
  expect((await reloaded.innerText()).trim().length).toBeGreaterThanOrEqual(40);
  await expect(panelTab(grantPanel(page), /^Sources, \d+$/)).toHaveAccessibleName(`Sources, ${count}`);
});

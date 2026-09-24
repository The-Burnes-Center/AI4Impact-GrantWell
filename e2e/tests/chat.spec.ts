/** Journey 3: ask the assistant about the run's NOFO. The answer is checked by structure only. */
import { expect, test, type Page } from "@playwright/test";
import { clearRecentlyViewed, deleteSession } from "../helpers/api";
import { selectNofo } from "../helpers/app";
import { runInfo } from "../helpers/config";

const QUESTION = "Who is eligible to apply for this grant, and what are the main application requirements?";
const REPLY_TIMEOUT_MS = 180_000;

let sessionId: string | undefined;

const assistantMessages = (page: Page) =>
  page.getByRole("group", { name: "Chat transcript" }).getByRole("article", { name: "Assistant message" });

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

  const actions = await selectNofo(page, nofoName);
  await actions.getByRole("button", { name: "Get Grant Help" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/);
  sessionId = new URL(page.url()).pathname.split("/").pop();

  // The UI's fixed greeting, not model output: it only shows the page is ready.
  await expect(assistantMessages(page)).toHaveCount(1);
  const input = page.locator("#chat-input");
  await input.fill(QUESTION);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(assistantMessages(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Stop generating response" })).toBeHidden({ timeout: REPLY_TIMEOUT_MS });
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Assistant replied$/ })).toHaveCount(1);
  await expect(page.getByText("<!ERROR!>")).toHaveCount(0);
  await expect(page.getByText(/Response timed out/)).toHaveCount(0);

  const answer = assistantMessages(page).last();
  const answerText = (await answer.locator("span.sr-only + div").innerText()).trim();
  expect(answerText.length, "answer length").toBeGreaterThanOrEqual(40);

  const sources = answer.getByRole("button", { name: /^Sources \(\d+\)$/ });
  await expect(sources).toBeVisible();
  const count = Number((await sources.innerText()).match(/\((\d+)\)/)![1]);
  expect(count, "number of sources").toBeGreaterThanOrEqual(1);

  // Saved: after a reload the exchange comes back from the session store.
  await page.reload();
  const transcript = page.getByRole("group", { name: "Chat transcript" });
  await expect(transcript.getByRole("article", { name: "Your message" })).toContainText(QUESTION);
  const reloaded = transcript.getByRole("article", { name: "Assistant message" }).last();
  expect((await reloaded.locator("span.sr-only + div").innerText()).trim().length).toBeGreaterThanOrEqual(40);
});

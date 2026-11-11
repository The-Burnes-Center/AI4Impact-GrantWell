/**
 * Journey 7: upload a file to My documents, tick it in a chat and ask about it, check that a new
 * application starts with it unticked, then delete it. The answer is checked for one number and
 * otherwise by structure only.
 */
import * as fs from "node:fs";
import { expect, test, type Page } from "../helpers/fixtures";
import {
  chatDocumentKeys,
  clearRecentlyViewed,
  deleteDocument,
  deleteDraftSafely,
  deleteSession,
  downloadDocument,
  listDocuments,
  setChatDocumentKeys,
} from "../helpers/api";
import { applicationPicker, fillToAdditionalInformation, selectNofo, startApplication } from "../helpers/app";
import { E2E_DOCUMENT_PREFIX, appUrl, runInfo } from "../helpers/config";
import { tokens } from "../helpers/session";

const QUESTION = "What local match did our board approve, according to my documents?";
const REPLY_TIMEOUT_MS = 180_000;

let sessionId: string | undefined;
let draftId: string | undefined;
let documentKey: string | undefined;

const assistantMessages = (page: Page) =>
  page.getByRole("group", { name: "Chat transcript" }).getByRole("article", { name: "Assistant message" });

const library = (page: Page) => page.getByRole("list", { name: /^Your documents/ });

/** The selection the chat saved after a tick or untick, as the server kept it. */
const documentKeysSaved = (page: Page) =>
  page
    .waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname.endsWith("/user-session") &&
        r.request().postDataJSON()?.operation === "set_document_keys"
    )
    .then(async (r) => {
      expect(r.status(), "set_document_keys").toBe(200);
      return (await r.json()).document_keys as string[];
    });

test.afterEach(async ({ page }) => {
  await page
    .getByRole("button", { name: "Stop generating response" })
    .waitFor({ state: "hidden", timeout: REPLY_TIMEOUT_MS })
    .catch(() => {});
  if (sessionId) await deleteSession(sessionId);
  if (draftId) await deleteDraftSafely(draftId);
  if (documentKey && (await listDocuments()).some((d) => d.key === documentKey)) await deleteDocument(documentKey);
  await clearRecentlyViewed();
});

test("uses a document from My documents in a chat, leaves it unticked in a new application, and deletes it", async ({
  page,
}, testInfo) => {
  test.setTimeout(10 * 60_000);
  sessionId = draftId = documentKey = undefined;
  const { nofoName } = runInfo();
  const { username } = await tokens();

  const amount = 40_000 + Math.floor(Math.random() * 50_000);
  const fileName = `${E2E_DOCUMENT_PREFIX}board-minutes-${Date.now()}.txt`;
  const contents =
    "GrantWell E2E Test Organization, Board of Directors meeting minutes.\n" +
    `The board approved a local cash match of $${amount.toLocaleString("en-US")} for this grant application.\n`;
  const file = testInfo.outputPath(fileName);
  fs.writeFileSync(file, contents);
  const key = `${username}/documents/${fileName}`;

  await test.step("upload it in My documents", async () => {
    await page.goto(appUrl("/home"));
    await page.getByRole("button", { name: "Open main menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "My documents" }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole("heading", { level: 1, name: "My documents" })).toBeVisible();
    await expect(page.getByText("Loading your documents...")).toHaveCount(0);

    documentKey = key;
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Browse files" }).click(),
    ]);
    await chooser.setFiles(file);
    await expect(library(page).getByRole("listitem").filter({ hasText: fileName })).toBeVisible({ timeout: 60_000 });
    expect(await downloadDocument(key), "stored file").toBe(contents);
  });

  const opener = page.getByRole("button", { name: /^Supporting documents/ });
  const dialog = page.getByRole("dialog", { name: "Supporting documents" });
  const chatPicker = dialog.getByRole("group", { name: "Use in this chat" });

  await test.step("tick it in a new chat", async () => {
    const actions = await selectNofo(page, nofoName);
    await actions.getByRole("button", { name: "Chat with AI", exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/);
    sessionId = new URL(page.url()).pathname.split("/").pop();
    await expect(assistantMessages(page)).toHaveCount(1);

    await opener.click();
    const box = chatPicker.getByRole("checkbox", { name: fileName });
    await expect(box).toBeVisible();
    await expect(chatPicker.getByRole("checkbox", { checked: true }), "ticked in a new chat").toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Upload new" })).toBeVisible();

    const saved = documentKeysSaved(page);
    await box.check();
    expect(await saved).toEqual([key]);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toHaveAccessibleName(/\. 1 selected\.$/);
  });

  await test.step("answer from it and list it under Sources", async () => {
    await page.locator("#chat-input").fill(QUESTION);
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Stop generating response" })).toBeHidden({ timeout: REPLY_TIMEOUT_MS });
    await expect(page.getByRole("status").filter({ hasText: /^Assistant replied$/ })).toHaveCount(1);
    await expect(page.getByText("<!ERROR!>")).toHaveCount(0);

    const answer = assistantMessages(page).last();
    const answerText = (await answer.locator("span.sr-only + div").innerText()).trim();
    // The amount is made up per run, so only the uploaded file can supply it; digits only, wording unchecked.
    expect(answerText.replace(/[,\s]/g, ""), "the board-approved match from the file").toContain(String(amount));

    const sources = answer.getByRole("button", { name: /^Sources \(\d+\) for reply \d+$/ });
    await expect(sources).toBeVisible();
    expect(Number((await sources.innerText()).match(/\((\d+)\)/)![1]), "grant document plus the file").toBeGreaterThanOrEqual(2);
    await sources.click();
    await expect(answer.getByRole("group", { name: "Your supporting documents" }).getByRole("listitem")).toHaveText([fileName]);

    expect(await chatDocumentKeys(sessionId!), "selection kept by the chat's first save").toEqual({
      document_keys: [key],
      exists: true,
    });
  });

  await test.step("untick it", async () => {
    await opener.click();
    const box = chatPicker.getByRole("checkbox", { name: fileName });
    await expect(box).toBeChecked();
    const saved = documentKeysSaved(page);
    await box.uncheck();
    expect(await saved).toEqual([]);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(opener).not.toHaveAccessibleName(/selected\.$/);
    expect((await chatDocumentKeys(sessionId!)).document_keys).toEqual([]);
  });

  await test.step("the chat keeps only the user's own keys", async () => {
    const kept = await setChatDocumentKeys(sessionId!, [
      key,
      `${E2E_DOCUMENT_PREFIX}someone-else/documents/${fileName}`,
      `${username}/../${E2E_DOCUMENT_PREFIX}someone-else/documents/${fileName}`,
    ]);
    expect(kept).toEqual([key]);
    expect(await setChatDocumentKeys(sessionId!, [])).toEqual([]);
  });

  await test.step("a new application starts with it unticked", async () => {
    draftId = await startApplication(page, nofoName);
    await fillToAdditionalInformation(page);
    const picker = await applicationPicker(page);
    await expect(picker.getByRole("checkbox", { name: fileName })).not.toBeChecked();
    await expect(picker.getByRole("checkbox", { checked: true }), "ticked in a new application").toHaveCount(0);
  });

  await test.step("delete it from My documents", async () => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "My documents" }).click();
    await expect(page).toHaveURL(/\/documents$/);
    const item = library(page).getByRole("listitem").filter({ hasText: fileName });
    await item.getByRole("button", { name: `Delete ${fileName}` }).click();

    const confirm = page.getByRole("dialog", { name: "Delete document?" });
    await expect(confirm).toContainText(fileName);
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: `${fileName} deleted.` })).toHaveCount(1);
    await expect(library(page).getByText(fileName)).toHaveCount(0);
    expect((await listDocuments()).map((d) => d.key)).not.toContain(key);
    await page.reload();
    await expect(page.getByText("Loading your documents...")).toHaveCount(0);
    await expect(library(page).getByText(fileName)).toHaveCount(0);
  });
});

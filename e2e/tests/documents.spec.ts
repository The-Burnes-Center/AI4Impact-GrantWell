/**
 * Journey 7: upload a file to My documents, tick it in a chat's Grant panel, wait for the check
 * that it relates to the grant, and ask about it; check that a new application starts with it
 * unticked, then delete it. The answer is checked for one number and otherwise by structure only.
 */
import * as fs from "node:fs";
import { expect, test, type Page } from "../helpers/fixtures";
import {
  chatDocumentKeys,
  chatTurns,
  clearRecentlyViewed,
  deleteDocument,
  deleteDraftSafely,
  deleteSession,
  downloadDocument,
  listDocuments,
  setChatDocumentKeys,
} from "../helpers/api";
import { applicationPicker, fillToAdditionalInformation, startApplication } from "../helpers/app";
import { answers, grantPanel, openChat, panelTab, sourceCards } from "../helpers/chat";
import { E2E_DOCUMENT_PREFIX, appUrl, runInfo } from "../helpers/config";
import { tokens } from "../helpers/session";

const QUESTION = "What local match did our board approve, according to my documents?";
const REPLY_TIMEOUT_MS = 180_000;
const RELEVANCE_TIMEOUT_MS = 90_000;

let sessionId: string | undefined;
let draftId: string | undefined;
let documentKey: string | undefined;

const library = (page: Page) => page.getByRole("list", { name: /^Your documents/ });

const isPost = (r: import("@playwright/test").Response, path: string) =>
  r.request().method() === "POST" && new URL(r.url()).pathname.endsWith(path);

/** The selection the chat saved after a tick or untick, as the server kept it. */
const documentKeysSaved = (page: Page) =>
  page
    .waitForResponse((r) => isPost(r, "/user-session") && r.request().postDataJSON()?.operation === "set_document_keys")
    .then(async (r) => {
      expect(r.status(), "set_document_keys").toBe(200);
      return (await r.json()).document_keys as string[];
    });

/** The grant relevance check the picker runs when a document is ticked. */
const relevanceChecked = (page: Page, key: string) =>
  page
    .waitForResponse(
      (r) => isPost(r, "/user-documents/relevance") && (r.request().postDataJSON()?.documentKeys ?? []).includes(key),
      { timeout: RELEVANCE_TIMEOUT_MS }
    )
    .then(async (r) => {
      expect(r.status(), "relevance check").toBe(200);
      const { documents } = await r.json();
      return (documents as { key: string; status: string; usable: boolean; reason?: string }[]).find((d) => d.key === key);
    });

test.afterEach(async ({ page }) => {
  await page
    .getByRole("button", { name: "Stop generating response" })
    .waitFor({ state: "hidden", timeout: REPLY_TIMEOUT_MS })
    .catch(() => {});
  if (sessionId) await deleteSession(sessionId);
  if (draftId) await deleteDraftSafely(draftId);
  // Deleting the document also deletes its type and relevance rows.
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
  // Budget material for this grant, so the relevance check finds it related.
  const contents =
    `GrantWell E2E Test Organization: project budget and Board of Directors minutes for our application to the grant "${nofoName}".\n` +
    `The board approved a local cash match of $${amount.toLocaleString("en-US")} for this grant application.\n` +
    "Budget request: personnel $32,000; supplies and equipment $10,000; community outreach $8,000; total request $50,000.\n";
  const file = testInfo.outputPath(fileName);
  fs.writeFileSync(file, contents);
  const key = `${username}/documents/${fileName}`;

  await test.step("upload it in My documents as a Budget", async () => {
    await page.goto(appUrl("/home"));
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My documents" }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole("heading", { level: 1, name: "My documents" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading your documents" })).toHaveCount(0);

    documentKey = key;
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Browse files" }).click(),
    ]);
    await chooser.setFiles(file);
    const typeDialog = page.getByRole("dialog", { name: "What kind of document is this?" });
    await expect(typeDialog.getByRole("group", { name: fileName })).toBeVisible();
    await typeDialog.getByRole("combobox", { name: /Document type/ }).selectOption({ label: "Budget" });
    await typeDialog.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(typeDialog).toBeHidden();

    const item = library(page).getByRole("listitem").filter({ hasText: fileName });
    await expect(item).toBeVisible({ timeout: 60_000 });
    await expect(item).toContainText("Budget ·");
    await expect(item.getByRole("button", { name: `Change type of ${fileName}` })).toBeVisible();
    expect(await downloadDocument(key), "stored file").toBe(contents);
  });

  const panel = grantPanel(page);
  const documentsTab = panelTab(panel, /^Documents/);
  const chatPicker = panel.getByRole("tabpanel", { name: /^Documents/ }).getByRole("group", { name: "Use in this chat" });

  await test.step("tick it in a new chat's Grant panel and see it pass the relevance check", async () => {
    sessionId = await openChat(page, nofoName);

    await documentsTab.click();
    const box = chatPicker.getByRole("checkbox", { name: fileName });
    await expect(box).toBeVisible();
    await expect(chatPicker.getByRole("checkbox", { checked: true }), "ticked in a new chat").toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Upload", exact: true })).toBeVisible();

    const saved = documentKeysSaved(page);
    const checked = relevanceChecked(page, key);
    await box.check();
    expect(await saved).toEqual([key]);
    await expect(documentsTab).toHaveAccessibleName(/^Documents, 1 of \d+ ticked$/);
    const relevance = await checked;
    expect(relevance, `relevance of ${fileName}: ${relevance?.reason ?? ""}`).toMatchObject({ status: "related", usable: true });
    await expect(panel.getByText("Checking whether this relates to the grant...")).toHaveCount(0);
    await expect(panel.getByText(/^Not used/)).toHaveCount(0);
  });

  await test.step("answer from it, with the file among the reply's sources", async () => {
    await page.locator("#chat-input").fill(QUESTION);
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(answers(page)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Stop generating response" })).toBeHidden({ timeout: REPLY_TIMEOUT_MS });
    await expect(page.getByRole("status").filter({ hasText: /^Assistant replied$/ })).toHaveCount(1);
    await expect(page.getByText("<!ERROR!>")).toHaveCount(0);

    const answerText = (await page.getByRole("article", { name: "Answer 2" }).innerText()).trim();
    // The amount is made up per run, so only the uploaded file can supply it; digits only, wording unchecked.
    expect(answerText.replace(/[,\s]/g, ""), "the board-approved match from the file").toContain(String(amount));

    const turn = (await chatTurns(sessionId!)).find((t) => t.user === QUESTION);
    expect(turn, "the reply saved in the chat").toBeTruthy();
    const metadata: { Sources?: { title: string }[]; Citations?: { document: string }[] } = JSON.parse(turn!.metadata);
    expect(metadata.Sources?.map((s) => s.title), "the reply read the file").toContain(fileName);

    // The Sources tab shows the reply's citations, or its sources when it has none.
    const sources = panelTab(panel, /^Sources, \d+$/);
    await sources.click();
    const cards = sourceCards(panel);
    await expect(cards.first()).toBeVisible();
    const citations = metadata.Citations ?? [];
    if (citations.length === 0 || citations.some((c) => c.document === fileName)) {
      await expect(cards.filter({ hasText: fileName }).first()).toBeVisible();
    } else {
      testInfo.annotations.push({ type: "note", description: `The reply cited only the grant (${citations.length} citations).` });
    }

    expect(await chatDocumentKeys(sessionId!), "selection kept by the chat's first save").toEqual({
      document_keys: [key],
      exists: true,
    });
  });

  await test.step("untick it", async () => {
    await documentsTab.click();
    const box = chatPicker.getByRole("checkbox", { name: fileName });
    await expect(box).toBeChecked();
    const saved = documentKeysSaved(page);
    await box.uncheck();
    expect(await saved).toEqual([]);
    await expect(documentsTab).toHaveAccessibleName(/^Documents, 0 of \d+ ticked$/);
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
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My documents" }).click();
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
    await expect(page.getByRole("status", { name: "Loading your documents" })).toHaveCount(0);
    await expect(library(page).getByText(fileName)).toHaveCount(0);
  });
});

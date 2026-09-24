/**
 * Journey 4: write a project narrative for the run's NOFO, generate every section, then export it
 * as Word and PDF. Sections and exports are checked by structure only.
 */
import * as fs from "node:fs";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { clearRecentlyViewed, deleteDraftSafely, waitForJob } from "../helpers/api";
import { selectNofo } from "../helpers/app";
import { USER_EMAIL, runInfo } from "../helpers/config";

const PROJECT_NAME = "E2E Test Project";
const PROJECT_BASICS: Record<string, string> = {
  projectName: PROJECT_NAME,
  organizationName: "GrantWell E2E Test Organization",
  requestedAmount: "50000",
  location: "Boston, MA",
  zipCode: "02115",
  // Letters and name punctuation only; the form rejects digits here.
  contactName: "Test Contact",
  contactEmail: USER_EMAIL,
};
const GENERATION_TIMEOUT_MS = 15 * 60_000;
const MIN_SECTION_CHARS = 200;

let sessionId: string | undefined;
let jobId: string | undefined;

test.afterEach(async () => {
  if (sessionId) await deleteDraftSafely(sessionId, jobId);
  await clearRecentlyViewed();
});

const SIDEBAR_LABEL = /^Section (\d+) of (\d+): (.*?)(?:, (completed|failed|generating|pending))?(?: \(not yet available\))?$/;

async function sidebar(page: import("@playwright/test").Page) {
  const buttons = page.getByRole("button", { name: /^Section \d+ of \d+: / });
  const labels = await buttons.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels.map((label) => {
    const [, , , name, status] = label.match(SIDEBAR_LABEL) ?? [];
    return { name, status };
  });
}

/** Paragraph texts of a .docx, runs joined, entities decoded. */
async function docxParagraphs(file: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file("word/document.xml")!.async("string");
  const decode = (s: string) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return xml
    .split("</w:p>")
    .map((p) => decode([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")).trim())
    .filter(Boolean);
}

test("generates every narrative section and exports the application as Word and PDF", async ({ page }, testInfo) => {
  test.setTimeout(30 * 60_000);
  const { nofoName, narrativeSections } = runInfo();

  const actions = await selectNofo(page, nofoName);
  await actions.getByRole("button", { name: "Write Project Narrative" }).click();
  await page.getByRole("button", { name: "Get Started" }).click();
  await expect(page).toHaveURL(/\/document-editor\/[0-9a-f-]{36}\?.*step=projectBasics/);
  sessionId = new URL(page.url()).pathname.split("/").pop();

  for (const [id, value] of Object.entries(PROJECT_BASICS)) await page.locator(`#${id}`).fill(value);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/step=questionnaire/);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/step=uploadDocuments/);

  const started = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/draft-generation")
  );
  await page.getByRole("button", { name: "Create Draft" }).click();
  const response = await started;
  expect(response.ok(), "draft generation started").toBe(true);
  jobId = (await response.json()).jobId;
  expect(jobId).toBeTruthy();

  await expect(page).toHaveURL(/step=sectionEditor/, { timeout: 5 * 60_000 });
  const job = await waitForJob(jobId!, GENERATION_TIMEOUT_MS);
  expect(job.status, `job ${jobId} (failed sections: ${job.failedSections?.join("; ") ?? "none"})`).toBe("completed");

  await expect
    .poll(async () => (await sidebar(page)).map((s) => s.status), { timeout: 120_000, message: "every section completed" })
    .toEqual(narrativeSections.map(() => "completed"));
  expect((await sidebar(page)).map((s) => s.name)).toEqual(narrativeSections);
  await expect(page.getByText(/section\(s\) failed to generate/)).toHaveCount(0);

  const buttons = page.getByRole("button", { name: /^Section \d+ of \d+: / });
  for (let i = 0; i < narrativeSections.length; i++) {
    await buttons.nth(i).click();
    await expect(page.locator("#se-section-title")).toHaveText(narrativeSections[i]);
    const text = await page.locator("textarea.se-textarea").inputValue();
    expect(text.trim().length, `"${narrativeSections[i]}" length`).toBeGreaterThanOrEqual(MIN_SECTION_CHARS);
  }
  await page.getByRole("button", { name: "Save section & review application" }).click();
  await expect(page.getByText("All Sections Complete")).toBeVisible();

  const exportMenu = page.locator("#ra-export-trigger");

  await exportMenu.click();
  const [docx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Word Document (.docx)" }).click(),
  ]);
  expect(docx.suggestedFilename()).toBe("grant-application.docx");
  const docxFile = testInfo.outputPath("grant-application.docx");
  await docx.saveAs(docxFile);
  expect(fs.readFileSync(docxFile).subarray(0, 2).toString()).toBe("PK");
  const paragraphs = await docxParagraphs(docxFile);
  expect(paragraphs).toContain("Table of Contents");
  expect(paragraphs.some((p) => p.includes(PROJECT_NAME)), "project name in the export").toBe(true);
  for (const name of new Set(narrativeSections)) {
    expect(
      paragraphs.some((p) => /^\d+\. /.test(p) && p.replace(/^\d+\. /, "") === name),
      `heading "N. ${name}"`
    ).toBe(true);
  }

  await expect(exportMenu).toBeEnabled({ timeout: 60_000 });
  await exportMenu.click();
  const [pdf] = await Promise.all([
    page.waitForEvent("download", { timeout: 5 * 60_000 }),
    page.getByRole("menuitem", { name: "PDF (.pdf)" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe("grant-application.pdf");
  const pdfFile = testInfo.outputPath("grant-application.pdf");
  await pdf.saveAs(pdfFile);
  const bytes = fs.readFileSync(pdfFile);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.length, "PDF size").toBeGreaterThan(5 * 1024);
});

/**
 * Journey 4: write a project narrative for the run's NOFO, generate every section, then export it
 * as Word and PDF. Sections and exports are checked by structure only.
 */
import * as fs from "node:fs";
import { expect, test } from "../helpers/fixtures";
import JSZip from "jszip";
import { clearRecentlyViewed, deleteDraftSafely, waitForJob } from "../helpers/api";
import { PROJECT_NAME, applicationPicker, fillToAdditionalInformation, startApplication } from "../helpers/app";
import { runInfo } from "../helpers/config";

const GENERATION_TIMEOUT_MS = 15 * 60_000;
const MIN_SECTION_CHARS = 200;

let sessionId: string | undefined;
let jobId: string | undefined;

test.afterEach(async () => {
  if (sessionId) await deleteDraftSafely(sessionId, jobId);
  await clearRecentlyViewed();
});

const SIDEBAR_LABEL = /^(\d+) (.*?), section \1 of (\d+)(?:, (completed|failed|generating|pending))?(?:, not yet available)?$/;
const SIDEBAR_BUTTON = /^\d+ .*, section \d+ of \d+/;

async function sidebar(page: import("@playwright/test").Page) {
  const buttons = page.getByRole("button", { name: SIDEBAR_BUTTON });
  const labels = await buttons.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels.map((label) => {
    const [, , name, , status] = label.match(SIDEBAR_LABEL) ?? [];
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

  sessionId = await startApplication(page, nofoName);
  await fillToAdditionalInformation(page);

  const picker = await applicationPicker(page);
  await expect(picker.getByRole("checkbox", { checked: true }), "documents ticked in a new application").toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload new" })).toBeVisible();

  const started = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/draft-generation")
  );
  await page.getByRole("button", { name: "Create draft" }).click();
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

  const buttons = page.getByRole("button", { name: SIDEBAR_BUTTON });
  for (let i = 0; i < narrativeSections.length; i++) {
    await buttons.nth(i).click();
    await expect(page.locator("#se-section-title")).toHaveText(narrativeSections[i]);
    const text = await page.locator('[role="textbox"][contenteditable]').first().innerText();
    expect(text.trim().length, `"${narrativeSections[i]}" length`).toBeGreaterThanOrEqual(MIN_SECTION_CHARS);
  }
  await page.getByRole("button", { name: "Save section & review application" }).click();
  const reviewSections = page.getByRole("navigation", { name: "Sections" }).getByRole("button");
  await expect(reviewSections).toHaveCount(narrativeSections.length);
  await expect(reviewSections.filter({ hasText: "Not drafted" })).toHaveCount(0);

  const downloadWord = page.getByRole("button", { name: "Download Word" });
  const downloadPdf = page.getByRole("button", { name: "Download PDF" });
  const [docx] = await Promise.all([page.waitForEvent("download"), downloadWord.click()]);
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

  await expect(downloadPdf).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
  const [pdf] = await Promise.all([page.waitForEvent("download", { timeout: 5 * 60_000 }), downloadPdf.click()]);
  expect(pdf.suggestedFilename()).toBe("grant-application.pdf");
  const pdfFile = testInfo.outputPath("grant-application.pdf");
  await pdf.saveAs(pdfFile);
  const bytes = fs.readFileSync(pdfFile);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.length, "PDF size").toBeGreaterThan(5 * 1024);
});

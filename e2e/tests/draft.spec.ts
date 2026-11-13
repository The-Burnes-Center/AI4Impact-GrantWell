/**
 * Journey 4: write a project narrative for the run's NOFO from project basics, questionnaire
 * answers and additional context, then export it as Word and PDF. The writer skips sections it has
 * no material for, so a skipped section must say what to add, and must stay out of the export.
 * Sections and exports are checked by structure only.
 */
import * as fs from "node:fs";
import { expect, test, type Page } from "../helpers/fixtures";
import JSZip from "jszip";
import { clearRecentlyViewed, deleteDraftSafely, waitForJob } from "../helpers/api";
import {
  PROJECT_MATERIAL,
  PROJECT_NAME,
  applicationPicker,
  fillToAdditionalInformation,
  startApplication,
} from "../helpers/app";
import { runInfo } from "../helpers/config";

const GENERATION_TIMEOUT_MS = 15 * 60_000;
const MIN_SECTION_CHARS = 200;

let sessionId: string | undefined;
let jobId: string | undefined;

test.afterEach(async () => {
  if (sessionId) await deleteDraftSafely(sessionId, jobId);
  await clearRecentlyViewed();
});

const SIDEBAR_LABEL =
  /^(\d+) (.*?), section \1 of (\d+)(?:, (completed|failed|not drafted|generating|pending))?(?:, not yet available)?$/;
const SIDEBAR_BUTTON = /^\d+ .*, section \d+ of \d+/;

async function sidebar(page: Page) {
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

test("drafts the sections it has material for and exports the application as Word and PDF", async ({ page }, testInfo) => {
  test.setTimeout(30 * 60_000);
  const { nofoName, narrativeSections } = runInfo();

  sessionId = await startApplication(page, nofoName);
  await fillToAdditionalInformation(page, { material: true });

  const picker = await applicationPicker(page);
  await expect(picker.getByRole("checkbox", { checked: true }), "documents ticked in a new application").toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload new" })).toBeVisible();
  await page.getByRole("textbox", { name: "Additional context" }).fill(PROJECT_MATERIAL);

  const started = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/draft-generation")
  );
  await page.getByRole("button", { name: "Create draft" }).click();
  const response = await started;
  expect(response.ok(), `draft generation started: ${await response.text().catch(() => "")}`).toBe(true);
  jobId = (await response.json()).jobId;
  expect(jobId).toBeTruthy();

  await expect(page).toHaveURL(/step=sectionEditor/, { timeout: 5 * 60_000 });
  const job = await waitForJob(jobId!, GENERATION_TIMEOUT_MS);
  expect(job.status, `job ${jobId} (failed sections: ${job.failedSections?.join("; ") ?? "none"})`).toBe("completed");

  await expect
    .poll(async () => (await sidebar(page)).every((s) => s.status === "completed" || s.status === "not drafted"), {
      timeout: 120_000,
      message: "every section drafted or skipped",
    })
    .toBe(true);
  const sections = await sidebar(page);
  expect(sections.map((s) => s.name)).toEqual(narrativeSections);
  const drafted = sections.filter((s) => s.status === "completed").map((s) => s.name);
  const skipped = sections.filter((s) => s.status === "not drafted").map((s) => s.name);
  expect(drafted.length, `drafted sections (skipped: ${skipped.join("; ") || "none"})`).toBeGreaterThanOrEqual(1);
  if (skipped.length) {
    const note = `Not drafted (${skipped.length} of ${sections.length}): ${skipped.join("; ")}`;
    console.log(`[e2e] ${note}`);
    testInfo.annotations.push({ type: "note", description: note });
  }
  await expect(page.getByText(/section\(s\) failed to generate/)).toHaveCount(0);

  const buttons = page.getByRole("button", { name: SIDEBAR_BUTTON });
  const editor = page.locator('[role="textbox"][contenteditable]').first();
  for (let i = 0; i < sections.length; i++) {
    await buttons.nth(i).click();
    await expect(page.locator("#se-section-title")).toHaveText(narrativeSections[i]);
    if (sections[i].status === "completed") {
      await expect(page.locator("#se-section-note").filter({ hasText: "Not drafted" })).toHaveCount(0);
      const text = await editor.innerText();
      expect(text.trim().length, `"${narrativeSections[i]}" length`).toBeGreaterThanOrEqual(MIN_SECTION_CHARS);
    } else {
      await expect(page.locator("#se-section-note"), `"${narrativeSections[i]}" says what to add`).toHaveText(/^Not drafted: .+\.$/);
      expect((await editor.innerText()).trim(), `"${narrativeSections[i]}" is empty`).toBe("");
    }
  }
  await page.getByRole("button", { name: "Save section & review application" }).click();

  await expect(page).toHaveURL(/step=reviewApplication/);
  const reviewSections = page.getByRole("navigation", { name: "Sections" }).getByRole("button");
  await expect(reviewSections).toHaveCount(narrativeSections.length);
  await expect(reviewSections.filter({ hasText: "Not drafted" })).toHaveCount(skipped.length);
  const current = reviewSections.and(page.locator('[aria-current="true"]'));
  await expect(current).toHaveCount(1);
  const previewed = (await current.locator(".ra-sections__name").innerText()).trim();
  await expect(page.getByRole("region", { name: previewed, exact: true })).toBeVisible();

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
  const isHeading = (name: string) => (p: string) => /^\d+\. /.test(p) && p.replace(/^\d+\. /, "") === name;
  for (const name of new Set(drafted)) {
    expect(paragraphs.some(isHeading(name)), `heading "N. ${name}"`).toBe(true);
  }
  for (const name of new Set(skipped.filter((s) => !drafted.includes(s)))) {
    expect(paragraphs.some(isHeading(name)), `no heading for the empty "${name}"`).toBe(false);
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

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { joinLines } from "../../lib/chatbot-api/functions/nofo-pipeline/extract-text/page-map.mjs";
import { withTableRows } from "../../lib/chatbot-api/functions/nofo-pipeline/extract-text/table-rows.mjs";

const HEIGHT = 0.01;
const CHAR = 0.01;

// A Textract LINE block whose box is CHAR wide per character.
const line = (Text: string, left: number, top: number, Page = 1, width = Text.length * CHAR) => ({
  BlockType: "LINE",
  Text,
  Page,
  Geometry: { BoundingBox: { Left: left, Top: top, Width: width, Height: HEIGHT } },
});

const textOf = (lines: { Text: string }[]) => lines.map((l) => l.Text).join("\n");

describe("extract-text table rows", () => {
  it("joins a wrapped cell and writes each row on one line, header first", () => {
    const lines = [
      line("Date", 0.1, 0.1),
      line("Amount", 0.3, 0.1),
      line("Notes", 0.5, 0.1),
      line("February", 0.1, 0.13),
      line("$500", 0.3, 0.13),
      line("Due by", 0.5, 0.13),
      line("05, 2025", 0.1, 0.145),
      line("5 PM", 0.5, 0.145),
      line("March 05", 0.1, 0.18),
      line("$700", 0.3, 0.18),
      line("None", 0.5, 0.18),
    ];

    expect(joinLines(lines).text).toBe(
      ["Date | Amount | Notes", "February 05, 2025 | $500 | Due by 5 PM", "March 05 | $700 | None"].join("\n")
    );
  });

  it("keeps tightly spaced single-line rows apart", () => {
    const rows = [
      ["Slot", "Hours", "Allowance"],
      ["Full-time", "1,700", "$20,954"],
      ["Half-time", "900", "n/a"],
      ["Part-time", "450", "n/a"],
    ];
    const lines = rows.flatMap((cells, r) => cells.map((text, c) => line(text, 0.1 + 0.2 * c, 0.1 + 0.015 * r)));

    expect(joinLines(lines).text).toBe(rows.map((cells) => cells.join(" | ")).join("\n"));
  });

  it("leaves paragraphs as Textract ordered them", () => {
    const lines = [
      line("Eligibility", 0.1, 0.05),
      line("Applicants must be units of local government or nonprofit organizations that", 0.1, 0.08),
      line("serve the region and have audited financial statements for the last two years.", 0.1, 0.095),
      line("Short closing line.", 0.1, 0.11),
    ];

    expect(withTableRows(lines)).toBe(lines);
    expect(joinLines(lines).text).toBe(textOf(lines));
  });

  it("leaves a two-column page as Textract ordered it", () => {
    const left = ["Left column starts here and", "continues down the page in", "its own narrow column."];
    const right = ["Right column text sits", "beside the left column on", "the same baselines."];
    const lines = [
      ...left.map((text, i) => line(text, 0.08, 0.1 + 0.015 * i, 1, 0.38)),
      ...right.map((text, i) => line(text, 0.54, 0.1 + 0.015 * i, 1, 0.38)),
    ];

    expect(withTableRows(lines)).toBe(lines);
    expect(joinLines(lines).text).toBe(textOf(lines));
  });

  it("leaves a justified paragraph line that Textract split at wide spaces", () => {
    const lines = [
      line("Collaborators and Other Affiliations. AFOSR accepts the template", 0.35, 0.53, 1, 0.58),
      line("format", 0.35, 0.545),
      line("required", 0.45, 0.545),
      line("by", 0.55, 0.545),
      line("NSF", 0.61, 0.545),
      line("applicants,", 0.69, 0.545),
      line("resources.nsf.gov/files/coa_template.xlsx for identifying this information.", 0.35, 0.56, 1, 0.55),
    ];

    expect(joinLines(lines).text).toBe(textOf(lines));
  });

  it("keeps lines without geometry where they were", () => {
    const lines = [
      { BlockType: "LINE", Text: "No box", Page: 1 },
      line("A", 0.1, 0.1),
      line("B", 0.3, 0.1),
      line("C", 0.5, 0.1),
      { BlockType: "LINE", Text: "Also no box", Page: 1 },
    ];

    expect(joinLines(lines).text).toBe("No box\nA | B | C\nAlso no box");
  });

  it("points each page start at that page's first line of the new text", () => {
    const lines = [
      line("Page one text.", 0.1, 0.1, 1),
      line("Header A", 0.1, 0.1, 2),
      line("Header B", 0.3, 0.1, 2),
      line("Header C", 0.5, 0.1, 2),
      line("one", 0.1, 0.13, 2),
      line("two", 0.3, 0.13, 2),
      line("three", 0.5, 0.13, 2),
      line("After the table.", 0.1, 0.3, 2, 0.6),
      line("Page four text.", 0.1, 0.1, 4),
    ];

    const { text, pageStarts } = joinLines(lines);

    expect(text).toBe(
      ["Page one text.", "Header A | Header B | Header C", "one | two | three", "After the table.", "Page four text."].join("\n")
    );
    expect(pageStarts).toEqual([0, 15, 81, 81]);
    expect(text.slice(pageStarts[1])).toMatch(/^Header A \| /);
    expect(text.slice(pageStarts[3])).toBe("Page four text.");
  });

  it("rebuilds the NIH Key Dates table from real Textract lines", () => {
    const lines = JSON.parse(readFileSync(path.join(__dirname, "fixtures/nih-key-dates-lines.json"), "utf8"));

    const { text, pageStarts } = joinLines(lines);

    expect(pageStarts).toEqual([0, 0]);
    expect(text.split("\n").slice(0, 12)).toEqual(lines.slice(0, 12).map((l: { Text: string }) => l.Text));
    expect(text.split("\n").slice(12)).toEqual([
      "New | Renewal / Resubmission / Revision (as allowed) | AIDS New/Renewal/Resubmission/Revision, as allowed | Scientific Merit Review | Advisory Council Review | Earliest Start Date",
      "February 05, 2025 * | March 05, 2025 * | Not Applicable | July 2025 | October 2025 | December 2025",
      "June 05, 2025 * | July 05, 2025 * | Not Applicable | November 2025 | January 2026 | April 2026",
      "October 05, 2025 * | November 05, 2025 * | Not Applicable | March 2026 | May 2026 | July 2026",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  findPlaceholders,
  isOverLimit,
  measureSection,
  parseNarrativePageLimit,
  parseSectionLimit,
  sectionPlainText,
} from "./section-checks";

describe("section length", () => {
  it("counts the text a reader sees, placeholders included", () => {
    expect(sectionPlainText("### Need\n\n**[CITY]** has *many* needs.\n\n- One [item](https://a.b)\n- Two")).toBe(
      "Need [CITY] has many needs. One item Two"
    );
    expect(measureSection("[LEAD APPLICANT NAME] seeks support.")).toEqual({ characters: 36, words: 5, pages: 0 });
    expect(measureSection("word ".repeat(450)).pages).toBe(1.5);
    expect(measureSection("")).toEqual({ characters: 0, words: 0, pages: 0 });
  });

  it("is over the limit only past it", () => {
    const measure = measureSection("a".repeat(3000));
    expect(isOverLimit(measure, { unit: "characters", max: 3000 })).toBe(false);
    expect(isOverLimit(measure, { unit: "characters", max: 2999 })).toBe(true);
  });
});

describe("placeholders", () => {
  it("finds bracketed gaps but not links, footnotes or checkboxes", () => {
    expect(
      findPlaceholders("[LEAD APPLICANT NAME], a [museum / museum-serving organization] in \\[CITY, STATE\\] [1] [x] [site](https://a.b)")
    ).toEqual(["[LEAD APPLICANT NAME]", "[museum / museum-serving organization]", "[CITY, STATE]"]);
    expect(findPlaceholders("")).toEqual([]);
  });
});

describe("section limits", () => {
  it.each([
    ["Abstract", "Applicants must write an Abstract of no more than 3,000 characters (including spaces).", { unit: "characters", max: 3000 }],
    ["LOI Narrative: Project Description", "Describe the project. 500 word limit.", { unit: "words", max: 500 }],
    ["Data Management Plan", "Up to 2 pages. Should describe types of data.", { unit: "pages", max: 2 }],
    ["Element A: Overview (6 pages)", "Describe how the hub works.", { unit: "pages", max: 6 }],
    ["Statement of Work (SOW) (5-page limit)", "Submitted separately.", { unit: "pages", max: 5 }],
    ["Overall – Research Strategy", "Describe the strategy. Page limit: 12 pages.", { unit: "pages", max: 12 }],
    ["Summary (White Paper) — 1 Page Maximum", "A summary of the proposed work.", { unit: "pages", max: 1 }],
  ])("reads %s", (name, description, limit) => {
    expect(parseSectionLimit(name, description)).toEqual(limit);
  });

  it.each([
    ["Hypothesis or Objective", "Part of Attachment 1: Project Narrative, 13-page limit."],
    ["Management Approach", "This section (included in the 25-page limit) must describe how."],
    ["Team Integration Plan", "Must be within the 20-page Research Strategy limit."],
    ["Table of Contents", "This item does not count toward the 20-page limit."],
    ["Project Narrative", "Respond concisely (2,000 characters maximum per question) to each."],
    ["Team Information", "Education summary (max 500 characters per person)."],
    ["Research Specific Aims", "Page limit for each Research Project component is 12 pages."],
    ["Hypothesis", "A distinct required component of the Project Narrative (Attachment 1, 15-page limit)."],
    ["Project Description", "A brief description of approximately 120 words."],
    ["Need", "Describe the need."],
  ])("finds no limit of its own in %s", (name, description) => {
    expect(parseSectionLimit(name, description)).toBeNull();
  });

  it("gives up when the description states two different limits", () => {
    expect(parseSectionLimit("Plan", "Up to 2 pages. A statement of no more than 50 words.")).toBeNull();
  });

  it("prefers the limit in the section name", () => {
    expect(parseSectionLimit("Candidate Description (max 2 pages)", "A commitment of not more than 50 words.")).toEqual({ unit: "pages", max: 2 });
  });
});

describe("narrative page limit", () => {
  it("reads the narrative document's limit", () => {
    expect(
      parseNarrativePageLimit({
        RequiredDocuments: [
          { item: "Narrative", description: "Pages exceeding the 8-page limit will be removed." },
          { item: "Budget Narrative", description: "Maximum 3 pages." },
          { item: "Resumes", description: "Do not count against the 8-page narrative limit." },
        ],
        ProjectNarrativeSections: [{ item: "Abstract", description: "Up to 3,000 characters." }],
      })
    ).toBe(8);
  });

  it("reads a limit the sections share", () => {
    expect(
      parseNarrativePageLimit({ ProjectNarrativeSections: [{ item: "Approach", description: "Part of the 12-page Project Narrative." }] })
    ).toBe(12);
  });

  it("is null when the grant states none or several", () => {
    expect(parseNarrativePageLimit({ RequiredDocuments: [{ item: "Budget", description: "Costs." }] })).toBeNull();
    expect(
      parseNarrativePageLimit({
        RequiredDocuments: [
          { item: "Project Narrative", description: "Standard grants must not exceed 18 pages; workshop grants, the limit is 8 pages." },
          { item: "Letters", description: "Do not count toward the 8-page narrative limit." },
        ],
      })
    ).toBeNull();
    expect(parseNarrativePageLimit(null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  exportSections,
  grantSections,
  keyedById,
  newCustomSectionId,
  resolveApplicationSections,
  sectionSlug,
} from "./application-sections";

// Same cases as packages/core/test/fixtures/section-ids.json, which pins the server copies.
const SLUGS: [string, string][] = [
  ["Project Narrative", "project-narrative"],
  ["Goals & Objectives", "goals-objectives"],
  ["  Évaluation   Plan  ", "evaluation-plan"],
  ["Budget Justification (Max. 5 pages)", "budget-justification-max-5-pages"],
  ["***", "section"],
  ["", "section"],
  ["1.", "1"],
  [
    "A section name that runs on far past the sixty four character cap for ids",
    "a-section-name-that-runs-on-far-past-the-sixty-four-character-ca",
  ],
];

const grant = grantSections([
  { item: "Statement of Need", description: "Why." },
  { item: "Budget", description: "Costs.", id: "budget-narrative" },
]);

describe("application sections", () => {
  it("slug names the same way as the server", () => {
    for (const [name, slug] of SLUGS) expect(sectionSlug(name)).toBe(slug);
  });

  it("keep the grant's stored ids and derive the rest", () => {
    expect(grant.map((s) => s.id)).toEqual(["statement-of-need", "budget-narrative"]);
    expect(grantSections([{ item: "Need" }, { item: "Need" }]).map((s) => s.id)).toEqual(["need", "need-2"]);
  });

  it("read an application keyed by name onto the grant's ids", () => {
    const resolved = resolveApplicationSections(grant, { "Statement of Need": "Need text", Budget: "Money", "Dropped later": "Kept" }, undefined);
    expect(resolved.converted).toBe(true);
    expect(resolved.answers).toEqual({ "statement-of-need": "Need text", "budget-narrative": "Money", "dropped-later": "Kept" });
    expect(resolved.sections.map((s) => s.name)).toEqual(["Statement of Need", "Budget", "Dropped later"]);
  });

  it("show the grant's sections first, then the applicant's own, and drop empty ones the grant no longer lists", () => {
    const resolved = resolveApplicationSections(
      grant,
      { "statement-of-need": "A", "custom-annex": "", "old-one": "" },
      [
        { id: "custom-annex", name: "Annex" },
        { id: "old-one", name: "Old one" },
        { id: "statement-of-need", name: "Old name" },
      ]
    );
    expect(resolved.converted).toBe(false);
    expect(resolved.sections.map((s) => [s.id, s.name, !!s.custom])).toEqual([
      ["statement-of-need", "Statement of Need", false],
      ["budget-narrative", "Budget", false],
      ["custom-annex", "Annex", true],
    ]);
  });

  it("map job results and version keys that still use names", () => {
    expect(keyedById({ "Statement of Need": "x", "budget-narrative": "y", unknown: "z" }, grant)).toEqual({
      "statement-of-need": "x",
      "budget-narrative": "y",
    });
  });

  it("give an added section an id of its own", () => {
    expect(newCustomSectionId("Annex", grant)).toBe("custom-annex");
    expect(newCustomSectionId("Annex", [...grant, { id: "custom-annex", name: "Annex" }])).toBe("custom-annex-2");
  });

  it("export only written sections, in order", () => {
    expect(exportSections(grant, { "budget-narrative": "Money", "statement-of-need": "  " })).toEqual({
      sections: { "budget-narrative": "Money" },
      sectionOrder: [{ id: "budget-narrative", name: "Budget" }],
    });
  });
});

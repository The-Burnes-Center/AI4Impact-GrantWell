import { beforeAll, describe, expect, it, vi } from "vitest";

let withoutPlaceholders: (summary: any) => any;
let mergeChunkResults: (results: any[]) => any;

beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  ({ withoutPlaceholders, mergeChunkResults } = await import("../../lib/chatbot-api/functions/nofo-pipeline/extract-and-analyze/index.mjs"));
});

describe("extracted items", () => {
  it("drops placeholder items and items that only say the grant doesn't state something", () => {
    const real = { item: "Cities", description: "Cities and towns may apply." };
    const out = withoutPlaceholders({
      EligibilityCriteria: [{ item: "placeholder", description: "placeholder" }, real],
      RequiredDocuments: [{ item: "Letters", description: "The NOFO does not specify any letters." }],
      ProjectNarrativeSections: [],
      KeyDeadlines: [{ item: "Deadline", description: "" }],
      GrantName: "Grant A",
    });
    expect(out).toEqual({ EligibilityCriteria: [real], RequiredDocuments: [], ProjectNarrativeSections: [], KeyDeadlines: [], GrantName: "Grant A" });
  });

  it("drops sentences that only say the chunk's text leaves something out", () => {
    const out = withoutPlaceholders({
      KeyDeadlines: [
        { item: "Submission", description: "Key dates are in Part I (not included in the provided text). Late applications are not accepted." },
        { item: "Peer review", description: "See Part 1 for these dates, which are not given in the provided text." },
      ],
      RequiredDocuments: [{ item: "Fleet Description", description: "It is not included in the 14-page limit." }],
    });
    expect(out.KeyDeadlines).toEqual([{ item: "Submission", description: "Late applications are not accepted." }]);
    expect(out.RequiredDocuments).toHaveLength(1);
  });
});

describe("merging chunks", () => {
  const merge = (...chunks: any[]) =>
    mergeChunkResults(chunks.map((c) => ({ EligibilityCriteria: [], RequiredDocuments: [], ProjectNarrativeSections: [], KeyDeadlines: [], ...c })));

  it("treats reordered names and an acronym of the name as one item, but keeps scopes apart", () => {
    const out = merge(
      { RequiredDocuments: [{ item: "Attachment 5: Statement of Work", description: "Three pages." }, { item: "Letter (Senegal)", description: "a" }] },
      { RequiredDocuments: [{ item: "Statement of Work (Attachment 5)", description: "Three pages, as SOW.pdf." }, { item: "Letter (Ghana)", description: "b" }] }
    );
    expect(out.RequiredDocuments.map((d: any) => d.item)).toEqual(["Statement of Work (Attachment 5)", "Letter (Senegal)", "Letter (Ghana)"]);
  });

  it("drops a document that repeats a section and joins a section's parts from two chunks", () => {
    const out = merge(
      { ProjectNarrativeSections: [{ item: "Project Narrative", description: "Eight pages; describe the aims and approach." }] },
      {
        ProjectNarrativeSections: [{ item: "Project Narrative", description: "Reviewers score the application on: merit." }],
        RequiredDocuments: [{ item: "Data Management and Sharing (DMS) Plan", description: "Required." }],
      },
      { ProjectNarrativeSections: [{ item: "Data Management and Sharing Plan", description: "Two pages." }] }
    );
    expect(out.RequiredDocuments).toEqual([]);
    expect(out.ProjectNarrativeSections[0].description).toBe("Eight pages; describe the aims and approach. Reviewers score the application on: merit.");
  });
});

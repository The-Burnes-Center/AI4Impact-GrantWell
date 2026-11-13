import { describe, expect, it } from "vitest";
import { grantFacts } from "./grant-facts";

const value = (facts: ReturnType<typeof grantFacts>, label: string) => facts.find((f) => f.label === label)?.value;

describe("grantFacts", () => {
  it("finds a match stated inside another item and a page limit stated in a narrative section", () => {
    const facts = grantFacts({
      EligibilityCriteria: [{ item: "Eligible applicants", description: "Cities may apply. A 25% cost share is required. Tribes may apply." }],
      ProjectNarrativeSections: [{ item: "Project design", description: "Describe the design. Keep it to 10 pages." }],
      KeyDeadlines: [{ item: "Letter of intent", description: "Send a letter by May 1." }],
    });
    expect(value(facts, "Match")).toBe("A 25% cost share is required.");
    expect(value(facts, "Narrative limit")).toBe("Keep it to 10 pages.");
    expect(value(facts, "Deadline")).toBe("Send a letter by May 1.");
    expect(value(facts, "Funding")).toBeNull();
  });

  it("shortens a long sentence and copes with no summary", () => {
    const long = `Awards of up to $1,000,000 ${"for many kinds of work ".repeat(20)}are possible.`;
    expect(value(grantFacts({ EligibilityCriteria: [{ item: "Award ceiling", description: long }] }), "Funding")).toMatch(/…$/);
    expect(grantFacts(null).every((f) => f.value === null)).toBe(true);
  });
});

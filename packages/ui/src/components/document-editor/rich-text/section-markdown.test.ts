import { describe, expect, it } from "vitest";
import { normalizeSectionMarkdown } from "./section-markdown";

describe("normalizeSectionMarkdown", () => {
  it("turns a line that is only bold text into a heading", () => {
    expect(normalizeSectionMarkdown("**Project Goal**\nWe will train 120 residents.")).toBe(
      "### Project Goal\nWe will train 120 residents."
    );
    expect(normalizeSectionMarkdown("__Objectives__")).toBe("### Objectives");
  });

  it("drops a trailing colon inside or after the bold text", () => {
    expect(normalizeSectionMarkdown("**Project Goal:**")).toBe("### Project Goal");
    expect(normalizeSectionMarkdown("**Project Goal**:")).toBe("### Project Goal");
    expect(normalizeSectionMarkdown("  __Budget__ :  ")).toBe("### Budget");
  });

  it("leaves bold that shares its line with other text alone", () => {
    const text = [
      "**Program launch:** within 90 days.",
      "- **Item** in a list",
      "**One** and **two**",
      "| **Cell** |",
      "Ends in **bold**",
    ].join("\n");
    expect(normalizeSectionMarkdown(text)).toBe(text);
  });

  it("moves # and ## to ### and the deeper levels to ####", () => {
    expect(normalizeSectionMarkdown("# Top\n## Second\n### Third\n#### Fourth\n##### Fifth\n###### Sixth")).toBe(
      "### Top\n### Second\n### Third\n#### Fourth\n#### Fifth\n#### Sixth"
    );
  });

  it("does not treat #hashtags or text in code blocks as headings", () => {
    const text = "#1 priority\n```\n# not a heading\n**not a heading**\n```\n~~~\n## also code\n~~~";
    expect(normalizeSectionMarkdown(text)).toBe(text);
  });

  it("returns an empty value unchanged", () => {
    expect(normalizeSectionMarkdown("")).toBe("");
  });
});

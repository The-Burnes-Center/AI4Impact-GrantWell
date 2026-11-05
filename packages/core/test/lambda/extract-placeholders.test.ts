import { beforeAll, describe, expect, it, vi } from "vitest";

let withoutPlaceholders: (summary: any) => any;

beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  ({ withoutPlaceholders } = await import("../../lib/chatbot-api/functions/nofo-pipeline/extract-and-analyze/index.mjs"));
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
});

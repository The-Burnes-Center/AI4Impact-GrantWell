import { describe, expect, it } from "vitest";
import { FUNDING_CATEGORY_MAP, mapFundingCategory, primaryFundingCategory } from "../../lib/chatbot-api/functions/nofo-scraper/shared/utils.mjs";

const EICMM = "Energy Infrastructure and Critical Mineral and Materials (EICMM)";

describe("mapFundingCategory", () => {
  it("maps every API code and every display name to itself", () => {
    for (const [code, name] of Object.entries(FUNDING_CATEGORY_MAP)) {
      expect(mapFundingCategory(code)).toBe(name);
      expect(mapFundingCategory(name)).toBe(name);
    }
  });

  it("keeps Energy and EICMM apart", () => {
    expect(mapFundingCategory("energy")).toBe("Energy");
    expect(mapFundingCategory("Energy")).toBe("Energy");
    expect(mapFundingCategory("energy_infrastructure_and_critical_mineral_and_materials")).toBe(EICMM);
    expect(mapFundingCategory("energy_infrastructure_and_critical_mineral_and_materials_eicmm")).toBe(EICMM);
  });

  it("ignores case, spacing, hyphens and punctuation", () => {
    expect(mapFundingCategory("  HEALTH ")).toBe("Health");
    expect(mapFundingCategory("law-justice-and-legal-services")).toBe("Law, Justice, and Legal Services");
    expect(mapFundingCategory("Employment,  Labor and Training")).toBe("Employment, Labor, and Training");
  });

  it("files the API's other code under Other", () => {
    expect(mapFundingCategory("other")).toBe("Other");
    expect(mapFundingCategory("Other")).toBe("Other");
  });

  it("does not match fragments or longer strings", () => {
    for (const value of ["art", "energ", "health_and_safety", "transportation_safety", "act", "and", "", null, undefined]) {
      expect(mapFundingCategory(value as string)).toBeNull();
    }
  });
});

describe("primaryFundingCategory", () => {
  it("uses Other only when grants.gov lists nothing more specific", () => {
    expect(primaryFundingCategory(["other"])).toBe("other");
    expect(primaryFundingCategory(["other", "other"])).toBe("other");
    expect(primaryFundingCategory(["other", "health", "education"])).toBe("health");
    expect(primaryFundingCategory(["housing", "other"])).toBe("housing");
  });

  it("keeps the first listed category otherwise", () => {
    expect(primaryFundingCategory(["education", "health"])).toBe("education");
    expect(primaryFundingCategory(["other", "unknown_code", "health"])).toBe("unknown_code");
    expect(primaryFundingCategory([])).toBeNull();
    expect(primaryFundingCategory(undefined)).toBeNull();
  });
});

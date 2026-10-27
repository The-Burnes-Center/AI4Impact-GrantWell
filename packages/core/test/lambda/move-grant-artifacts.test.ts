import { describe, expect, it } from "vitest";
import { planMove } from "../../scripts/move-grant-artifacts.mjs";

describe("moving derived files out of the grant bucket", () => {
  const grantKeys = [
    "Grant A/NOFO-File-PDF",
    "Grant A/NOFO-File-PDF.metadata.json",
    "Grant A/raw-text.txt",
    "Grant A/summary.json",
    "Grant A/questions.json",
    "Grant B/summary.json",
    "pending-conversion/Grant C/NOFO-File-HTML.html",
    "pending-conversion/Grant C/summary.json",
  ];

  it("moves only a grant's own raw text, summary and questions, never its documents", () => {
    const plan = planMove(grantKeys, []);
    expect(plan.copy).toEqual(["Grant A/raw-text.txt", "Grant A/summary.json", "Grant A/questions.json", "Grant B/summary.json"]);
    expect(plan.keep).toEqual([]);
  });

  it("keeps a copy the new code already wrote and only drops the old one", () => {
    const plan = planMove(grantKeys, ["Grant A/summary.json"]);
    expect(plan.keep).toEqual(["Grant A/summary.json"]);
    expect(plan.copy).not.toContain("Grant A/summary.json");
  });

  it("has nothing to do once a deployment is moved", () => {
    expect(planMove(["Grant A/NOFO-File-PDF", "Grant A/NOFO-File-PDF.metadata.json"], ["Grant A/summary.json"])).toEqual({ copy: [], keep: [] });
  });
});

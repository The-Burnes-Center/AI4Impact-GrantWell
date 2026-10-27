import { describe, expect, it } from "vitest";
import { EMPTY_OUTCOME, parseDollars, toOutcomeInput } from "./application-outcomes";

describe("toOutcomeInput", () => {
  const today = "2026-10-27";

  it("sends only the fields the status needs", () => {
    expect(toOutcomeInput({ ...EMPTY_OUTCOME, status: "awarded", decisionDate: "2026-10-01", amountAwarded: "$25,000", submittedDate: "2026-09-01" }, today)).toEqual({
      status: "awarded",
      decisionDate: "2026-10-01",
      amountAwarded: 25000,
    });
    expect(toOutcomeInput({ ...EMPTY_OUTCOME, status: "not_submitted", decisionDate: "2026-10-01" }, today)).toEqual({ status: "not_submitted" });
  });

  it("names the first problem", () => {
    expect(toOutcomeInput(EMPTY_OUTCOME, today)).toEqual({ error: "Choose an outcome." });
    expect(toOutcomeInput({ ...EMPTY_OUTCOME, status: "submitted" }, today)).toEqual({ error: "Date submitted is required." });
    expect(toOutcomeInput({ ...EMPTY_OUTCOME, status: "not_awarded", decisionDate: "2026-10-28" }, today)).toEqual({ error: "Decision date can't be in the future." });
    expect(toOutcomeInput({ ...EMPTY_OUTCOME, status: "awarded", decisionDate: "2026-10-01", amountAwarded: "12.50" }, today)).toEqual({
      error: "Amount awarded must be a whole number of dollars.",
    });
  });
});

describe("parseDollars", () => {
  it("reads whole dollars with $ and commas", () => {
    expect(parseDollars("$1,250,000")).toBe(1250000);
    expect(parseDollars(" 40000 ")).toBe(40000);
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("-5")).toBeNull();
    expect(parseDollars("about 5k")).toBeNull();
  });
});

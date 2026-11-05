import { describe, expect, it } from "vitest";
import { withEasternTime } from "./eastern-time";

describe("withEasternTime", () => {
  it("adds Eastern Time after a time in another US zone", () => {
    expect(withEasternTime("Due March 15, 2027 at 5:00 p.m. Mountain Time.")).toBe("Due March 15, 2027 at 5:00 p.m. Mountain Time (7:00 PM ET).");
    expect(withEasternTime("Due 10/31/2026 by 11:59 PM PT")).toBe("Due 10/31/2026 by 11:59 PM PT (2:59 AM ET the next day)");
    expect(withEasternTime("Applications close June 1, 2027, 4 PM CDT")).toBe("Applications close June 1, 2027, 4 PM CDT (5:00 PM ET)");
  });

  it("uses the date for Hawaii, which has no daylight saving time", () => {
    expect(withEasternTime("Due July 1, 2027 at 4:30 PM HST")).toBe("Due July 1, 2027 at 4:30 PM HST (10:30 PM ET)");
    expect(withEasternTime("Due January 15, 2027 at 4:30 PM HST")).toBe("Due January 15, 2027 at 4:30 PM HST (9:30 PM ET)");
  });

  it("leaves Eastern, local and already-converted times alone", () => {
    for (const text of [
      "Due March 1, 2027 at 11:59 PM ET.",
      "Due by 5:00 PM local time of the applicant organization.",
      "Due at 5:00 PM MT (7:00 PM ET).",
      "Submit by 3 pm.",
    ]) {
      expect(withEasternTime(text)).toBe(text);
    }
  });
});

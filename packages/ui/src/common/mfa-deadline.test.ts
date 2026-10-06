import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  daysLeftText,
  deadlineDateText,
  deadlinePromptSeen,
  markDeadlinePromptSeen,
  mfaDeadlinePhase,
} from "./mfa-deadline";

const DEADLINE_ISO = "2026-11-02T00:00:00-05:00";
const DEADLINE = Date.parse(DEADLINE_ISO);
const HOUR = 60 * 60 * 1000;

describe("mfaDeadlinePhase", () => {
  it("is none without a deadline", () => {
    expect(mfaDeadlinePhase(DEADLINE, null)).toBe("none");
  });

  it("switches to after exactly at the deadline", () => {
    expect(mfaDeadlinePhase(DEADLINE - 1, DEADLINE)).toBe("before");
    expect(mfaDeadlinePhase(DEADLINE, DEADLINE)).toBe("after");
    expect(mfaDeadlinePhase(DEADLINE + 1, DEADLINE)).toBe("after");
  });

  it("is midnight Eastern, i.e. 05:00 UTC on Nov 2", () => {
    expect(mfaDeadlinePhase(Date.UTC(2026, 10, 2, 4, 59), DEADLINE)).toBe("before");
    expect(mfaDeadlinePhase(Date.UTC(2026, 10, 2, 5, 0), DEADLINE)).toBe("after");
  });
});

describe("daysLeftText", () => {
  it("rounds part days up and says 1 day in the singular", () => {
    expect(daysLeftText(DEADLINE - 26 * 24 * HOUR, DEADLINE)).toBe("26 days left.");
    expect(daysLeftText(DEADLINE - 25 * 24 * HOUR - HOUR, DEADLINE)).toBe("26 days left.");
    expect(daysLeftText(DEADLINE - 2 * HOUR, DEADLINE)).toBe("1 day left.");
  });
});

describe("deadlineDateText", () => {
  it("names the deadline's own calendar day, whatever the viewer's zone", () => {
    expect(deadlineDateText(DEADLINE_ISO, false)).toBe("November 2");
    expect(deadlineDateText(DEADLINE_ISO, true)).toBe("November 2, 2026");
    expect(deadlineDateText("2026-10-09T00:00:00-04:00", true)).toBe("October 9, 2026");
  });
});

describe("once per sign-in", () => {
  const store = new Map<string, string>();
  const g = globalThis as { window?: unknown };
  beforeEach(() => {
    store.clear();
    g.window = {
      localStorage: {
        getItem: (k: string): string | null => store.get(k) ?? null,
        setItem: (k: string, v: string): void => void store.set(k, v),
      },
    };
  });
  afterEach(() => {
    delete g.window;
  });

  it("is seen only for the sign-in that dismissed it", () => {
    expect(deadlinePromptSeen("u1", 1000)).toBe(false);
    markDeadlinePromptSeen("u1", 1000);
    expect(deadlinePromptSeen("u1", 1000)).toBe(true);
    expect(deadlinePromptSeen("u1", 2000)).toBe(false);
    expect(deadlinePromptSeen("u2", 1000)).toBe(false);
  });

  it("shows again when storage is unavailable", () => {
    delete g.window;
    markDeadlinePromptSeen("u1", 1000);
    expect(deadlinePromptSeen("u1", 1000)).toBe(false);
  });
});

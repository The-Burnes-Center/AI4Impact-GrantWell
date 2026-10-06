import { MFA_DEADLINE } from "./instance";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEEN_PREFIX = "gw.mfaDeadlinePromptSeen.";

export type MfaDeadlinePhase = "none" | "before" | "after";

export function mfaDeadlinePhase(now: number = Date.now(), deadline: number | null = MFA_DEADLINE): MfaDeadlinePhase {
  if (deadline === null) return "none";
  return now < deadline ? "before" : "after";
}

export function daysLeftText(now: number, deadline: number): string {
  const days = Math.ceil((deadline - now) / DAY_MS);
  return days === 1 ? "1 day left." : `${days} days left.`;
}

/**
 * The calendar date in the deadline's own offset, so every viewer reads the same day.
 * `withYear` gives "November 2, 2026", otherwise "November 2".
 */
export function deadlineDateText(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    ...(withYear && { year: "numeric" }),
  });
}

// auth_time stays the same across token refreshes, so this is once per sign-in, in every tab.
export function deadlinePromptSeen(userId: string, authTime: number): boolean {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + userId) === String(authTime);
  } catch {
    return false;
  }
}

export function markDeadlinePromptSeen(userId: string, authTime: number): void {
  try {
    window.localStorage.setItem(SEEN_PREFIX + userId, String(authTime));
  } catch {
    // Storage disabled: the prompt shows again on the next load.
  }
}

const KEY_PREFIX = "gw.mfaPromptSnoozedUntil.";
const SNOOZE_DAYS = 30;

// Keyed per user so a shared browser does not silence the prompt for someone else.
function key(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

export function isMfaPromptSnoozed(userId: string): boolean {
  if (!userId) return false;
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (Date.now() >= until) {
      window.localStorage.removeItem(key(userId));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function snoozeMfaPrompt(userId: string): void {
  if (!userId) return;
  try {
    const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(key(userId), String(until));
  } catch {
    // Private browsing or storage disabled — the prompt simply reappears next session.
  }
}

export function clearMfaPromptSnooze(userId: string): void {
  if (!userId) return;
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    // no-op
  }
}

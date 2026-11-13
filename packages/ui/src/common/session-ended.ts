import { signOut } from "aws-amplify/auth";

const NOTICE_KEY = "gw.sessionEnded";
let signedIn = false;
let ending = false;

export function setSignedIn(value: boolean): void {
  signedIn = value;
  if (value) clearSessionEndedNotice();
}

export function isEndingSession(): boolean {
  return ending;
}

/**
 * The API rejected a signed-in session (revoked by an admin, user disabled, or expired past
 * refresh). Sign out once and send the user to sign in again, with a notice explaining why.
 * A no-op on public pages, where there is no session to end.
 */
export async function endSession(): Promise<void> {
  if (!signedIn || ending) return;
  ending = true;
  try {
    sessionStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // The notice is a courtesy; signing out still happens.
  }
  try {
    await signOut();
  } catch {
    // Already signed out.
  }
  window.location.assign("/login");
}

export function hasSessionEndedNotice(): boolean {
  try {
    return sessionStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSessionEndedNotice(): void {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** A JWT's expiry in seconds since the epoch, or null when the token can't be read as one. */
export function tokenExpiry(token: string): number | null {
  const part = token.replace(/^Bearer\s+/i, "").split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const exp = (JSON.parse(atob(base64)) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/**
 * fetch for authenticated API calls: a 401 on a request that carried a token ends the session. 403 keeps its own meanings.
 * A 401 for a token that had already expired only means that request used a kept copy (the exit save does); the
 * session refreshes on the next call, so it is not ended.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const auth = init?.headers ? new Headers(init.headers).get("Authorization") : null;
  if (response.status === 401 && auth) {
    const exp = tokenExpiry(auth);
    if (exp === null || exp * 1000 > Date.now()) void endSession();
  }
  return response;
}

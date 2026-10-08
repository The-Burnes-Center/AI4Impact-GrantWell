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

/** fetch for authenticated API calls: a 401 on a request that carried a token ends the session. 403 keeps its own meanings. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && init?.headers && new Headers(init.headers).has("Authorization")) {
    void endSession();
  }
  return response;
}

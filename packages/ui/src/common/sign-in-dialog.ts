import { fetchAuthSession } from "aws-amplify/auth";

const USED_PREFIX = "gw.signInDialogUsed.";

export interface SignIn {
  userId: string;
  /** The ID token's auth_time: unchanged by token refreshes, so it identifies one sign-in. */
  authTime: number;
}

export async function currentSignIn(): Promise<SignIn | null> {
  const claims = (await fetchAuthSession()).tokens?.idToken?.payload ?? {};
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  return { userId: claims.sub, authTime: typeof claims.auth_time === "number" ? claims.auth_time : 0 };
}

/** At most one dialog per sign-in: a required screen or the MFA prompt uses it up before What's new. */
export function signInDialogUsed({ userId, authTime }: SignIn): boolean {
  try {
    return window.localStorage.getItem(USED_PREFIX + userId) === String(authTime);
  } catch {
    return false;
  }
}

export function markSignInDialogUsed({ userId, authTime }: SignIn): void {
  try {
    window.localStorage.setItem(USED_PREFIX + userId, String(authTime));
  } catch {
    // Storage disabled: What's new may follow another dialog in the same sign-in.
  }
}

export async function markCurrentSignInDialogUsed(): Promise<void> {
  try {
    const signIn = await currentSignIn();
    if (signIn) markSignInDialogUsed(signIn);
  } catch {
    // Not signed in yet or no session: nothing to mark.
  }
}

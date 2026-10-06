import { fetchAuthSession } from "aws-amplify/auth";

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

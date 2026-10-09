import { vi } from "vitest";

export interface Claims {
  sub?: string;
  email?: string;
  auth_time?: number;
  "custom:role"?: string;
  "custom:state"?: string;
  "cognito:username"?: string;
}

export const DEFAULT_CLAIMS: Claims = {
  sub: "user-1",
  email: "user@example.com",
  auth_time: 1_700_000_000,
  "cognito:username": "user-1",
};

const session = (claims: Claims) => ({
  tokens: { idToken: { payload: claims, toString: () => "test-id-token" } },
});

/** The aws-amplify/auth functions the app calls, mocked for every test by setup.ts. */
export const auth = {
  fetchAuthSession: vi.fn(),
  fetchMFAPreference: vi.fn(),
  setUpTOTP: vi.fn(),
  verifyTOTPSetup: vi.fn(),
  updateMFAPreference: vi.fn(),
  updatePassword: vi.fn(),
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
};

export function signedInAs(claims: Claims = {}): void {
  const merged = { ...DEFAULT_CLAIMS, ...claims };
  auth.fetchAuthSession.mockResolvedValue(session(merged));
  auth.getCurrentUser.mockResolvedValue({ userId: merged.sub, username: merged["cognito:username"] });
}

export function mfaEnrolled(enrolled: boolean): void {
  auth.fetchMFAPreference.mockResolvedValue(enrolled ? { enabled: ["TOTP"], preferred: "TOTP" } : {});
}

export function totpSecret(secret = "SECRET123"): void {
  auth.setUpTOTP.mockResolvedValue({
    sharedSecret: secret,
    getSetupUri: (issuer: string, account: string) =>
      new URL(`otpauth://totp/${issuer}:${account}?secret=${secret}`),
  });
}

export function resetAmplify(): void {
  for (const fn of Object.values(auth)) fn.mockReset();
  signedInAs();
  mfaEnrolled(false);
  totpSecret();
  auth.verifyTOTPSetup.mockResolvedValue(undefined);
  auth.updateMFAPreference.mockResolvedValue(undefined);
  auth.signOut.mockResolvedValue(undefined);
}

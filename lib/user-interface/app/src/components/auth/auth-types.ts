export type AuthView =
  | "sign-in"
  | "sign-up"
  | "forgot-password"
  | "reset-password"
  | "verify-sign-up"
  | "new-password-required";

export interface PasswordRequirements {
  minLength: boolean;
  hasNumber: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasSymbol: boolean;
}

export interface AuthChallengeUser extends Record<string, unknown> {
  challengeName?: string;
  username?: string;
}

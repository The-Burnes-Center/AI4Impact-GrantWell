export type AuthView =
  | "sign-in"
  | "sign-up"
  | "forgot-password"
  | "reset-password"
  | "verify-sign-up"
  | "new-password-required"
  | "mfa-challenge"
  | "mfa-setup";

export interface PasswordRequirements {
  minLength: boolean;
  hasNumber: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasSymbol: boolean;
}

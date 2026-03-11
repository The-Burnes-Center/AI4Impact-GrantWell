import { PasswordRequirements } from "./auth-types";

export type AuthErrorContext =
  | "sign-in"
  | "sign-up"
  | "forgot-password"
  | "reset-password"
  | "verify-sign-up"
  | "resend-sign-up"
  | "new-password"
  | "auto-sign-in";

interface AuthErrorShape {
  code?: string;
  name?: string;
  message?: string;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function getPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasSymbol: /[^A-Za-z0-9\s]/.test(password),
  };
}

export function getEmailValidationError(email: string) {
  if (!normalizeEmail(email)) {
    return "Enter your email address.";
  }

  if (!isValidEmail(email)) {
    return "Enter a valid email address.";
  }

  return null;
}

export function getPasswordValidationError(password: string) {
  const requirements = getPasswordRequirements(password);

  if (!password) {
    return "Enter a password.";
  }

  if (!requirements.minLength) {
    return "Password must be at least 8 characters long.";
  }

  if (!requirements.hasNumber) {
    return "Password must include at least one number.";
  }

  if (!requirements.hasLowercase) {
    return "Password must include at least one lowercase letter.";
  }

  if (!requirements.hasUppercase) {
    return "Password must include at least one uppercase letter.";
  }

  if (!requirements.hasSymbol) {
    return "Password must include at least one symbol.";
  }

  return null;
}

export function getVerificationCodeValidationError(verificationCode: string) {
  const normalizedCode = verificationCode.trim();

  if (!normalizedCode) {
    return "Enter the verification code.";
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    return "Enter the 6-digit verification code.";
  }

  return null;
}

export function getSignInValidationError(email: string, password: string) {
  const emailError = getEmailValidationError(email);
  if (emailError) return emailError;

  if (!password) {
    return "Enter your password.";
  }

  return null;
}

export function getSignUpValidationError(
  email: string,
  password: string,
  confirmPassword: string,
) {
  const emailError = getEmailValidationError(email);
  if (emailError) return emailError;

  const passwordError = getPasswordValidationError(password);
  if (passwordError) return passwordError;

  if (!confirmPassword) {
    return "Confirm your password.";
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
}

export function getForgotPasswordValidationError(email: string) {
  return getEmailValidationError(email);
}

export function getResetPasswordValidationError(
  email: string,
  verificationCode: string,
  newPassword: string,
) {
  const emailError = getEmailValidationError(email);
  if (emailError) return emailError;

  const codeError = getVerificationCodeValidationError(verificationCode);
  if (codeError) return codeError;

  return getPasswordValidationError(newPassword);
}

export function getVerifySignUpValidationError(
  email: string,
  verificationCode: string,
) {
  const emailError = getEmailValidationError(email);
  if (emailError) return emailError;

  return getVerificationCodeValidationError(verificationCode);
}

export function getAuthErrorCode(error: unknown) {
  const authError = error as AuthErrorShape | null;
  return authError?.code || authError?.name || "";
}

export function mapAuthError(error: unknown, context: AuthErrorContext) {
  const authError = error as AuthErrorShape | null;
  const code = getAuthErrorCode(error);
  const message = authError?.message?.toLowerCase() || "";

  if (message.includes("pending sign in attempt")) {
    return "Please wait for the current sign-in attempt to finish.";
  }

  switch (code) {
    case "UsernameExistsException":
      return "An account with this email already exists. Sign in or reset your password.";
    case "UserNotFoundException":
      return context === "sign-in"
        ? "Email or password is incorrect."
        : "We could not complete that request. Check the email address and try again.";
    case "UserNotConfirmedException":
      return "Your account is not verified yet. Enter your verification code to continue.";
    case "NotAuthorizedException":
      return context === "sign-in" || context === "auto-sign-in"
        ? "Email or password is incorrect."
        : "You are not authorized to complete that action.";
    case "PasswordResetRequiredException":
      return "You need to reset your password before signing in.";
    case "CodeMismatchException":
      return "The verification code is incorrect.";
    case "ExpiredCodeException":
      return "The verification code has expired. Request a new code and try again.";
    case "LimitExceededException":
    case "TooManyFailedAttemptsException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a moment and try again.";
    case "InvalidPasswordException":
      return "Password does not meet the required complexity rules.";
    case "InvalidParameterException":
      if (message.includes("current status is confirmed")) {
        return "Your email is already verified. Sign in to continue.";
      }
      return "The information entered is not valid. Check your details and try again.";
    default:
      break;
  }

  switch (context) {
    case "sign-in":
    case "auto-sign-in":
      return "We could not sign you in. Check your email and password and try again.";
    case "sign-up":
      return "We could not create your account. Check your details and try again.";
    case "verify-sign-up":
    case "resend-sign-up":
      return "We could not verify your email right now. Try again.";
    case "forgot-password":
      return "We could not send a reset code right now. Try again.";
    case "reset-password":
      return "We could not reset your password right now. Try again.";
    case "new-password":
      return "We could not set your new password right now. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

export function getUnsupportedChallengeMessage(challengeName: string) {
  return `This sign-in challenge (${challengeName}) is not supported on this page. Contact support if you need help finishing sign-in.`;
}

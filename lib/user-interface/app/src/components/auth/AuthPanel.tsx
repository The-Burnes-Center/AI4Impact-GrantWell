import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import { useBranding } from "../../common/branding";
import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import type { SignInOutput } from "aws-amplify/auth";
import SignInStep from "./steps/SignInStep";
import ForgotPasswordStep from "./steps/ForgotPasswordStep";
import ResetPasswordStep from "./steps/ResetPasswordStep";
import NewPasswordStep from "./steps/NewPasswordStep";
import SignUpStep from "./steps/SignUpStep";
import VerifySignUpStep from "./steps/VerifySignUpStep";
import MfaChallengeStep from "./steps/MfaChallengeStep";
import MfaSetupStep from "./steps/MfaSetupStep";
import { AuthView } from "./auth-types";
import type { AuthErrorContext } from "./auth-utils";
import {
  getAuthErrorCode,
  getEmailValidationError,
  getForgotPasswordValidationError,
  getPasswordRequirements,
  getPasswordValidationError,
  getResetPasswordValidationError,
  getSignInValidationError,
  getSignUpValidationError,
  getUnsupportedChallengeMessage,
  getVerificationCodeValidationError,
  getVerifySignUpValidationError,
  mapAuthError,
  normalizeEmail,
} from "./auth-utils";
import "../../styles/auth-panel.css";

interface AuthPanelProps {
  onAuthenticated: () => void;
}

interface CardCopy {
  title: string;
  subtitle: string;
}

type AuthErrorField =
  | "email"
  | "password"
  | "confirmPassword"
  | "newPassword"
  | "verificationCode";

function authErrorFields(
  code: string,
  context: AuthErrorContext,
): AuthErrorField[] {
  switch (code) {
    case "NotAuthorizedException":
      return context === "sign-in" ? ["email", "password"] : [];
    case "UserNotFoundException":
      return context === "sign-in" ? ["email", "password"] : ["email"];
    case "UsernameExistsException":
      return ["email"];
    case "CodeMismatchException":
    case "ExpiredCodeException":
    case "EnableSoftwareTokenMFAException":
      return ["verificationCode"];
    case "InvalidPasswordException":
      return context === "reset-password" || context === "new-password"
        ? ["newPassword"]
        : ["password"];
    default:
      return [];
  }
}

function signUpValidationFields(
  email: string,
  password: string,
): AuthErrorField[] {
  if (getEmailValidationError(email)) return ["email"];
  if (getPasswordValidationError(password)) return ["password"];
  return ["confirmPassword"];
}

function resetPasswordValidationFields(
  email: string,
  verificationCode: string,
  newPassword: string,
): AuthErrorField[] {
  if (getEmailValidationError(email)) return [];
  if (getVerificationCodeValidationError(verificationCode)) {
    return ["verificationCode"];
  }
  if (getPasswordValidationError(newPassword)) return ["newPassword"];
  return [];
}

async function signInFresh(username: string, password: string) {
  try {
    return await signIn({ username, password });
  } catch (error) {
    if ((error as { name?: string })?.name === "UserAlreadyAuthenticatedException") {
      await signOut();
      return await signIn({ username, password });
    }
    throw error;
  }
}

const PENDING_STATE_KEY = "grantwell.pendingSignupState";

function writePendingSignupState(email: string, state: string) {
  try {
    if (!state) {
      sessionStorage.removeItem(PENDING_STATE_KEY);
      return;
    }
    sessionStorage.setItem(PENDING_STATE_KEY, JSON.stringify({ email, state }));
  } catch {
    // Storage denied (private mode): state falls back to admin assignment.
  }
}

function readPendingSignupState(email: string): string {
  try {
    const raw = sessionStorage.getItem(PENDING_STATE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.email === email ? String(parsed.state || "") : "";
  } catch {
    return "";
  }
}

function clearPendingSignupState() {
  try {
    sessionStorage.removeItem(PENDING_STATE_KEY);
  } catch {
    // Nothing to recover; the value is only a hint for confirmSignUp.
  }
}

export default function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const branding = useBranding();
  const [view, setView] = useState<AuthView>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupState, setSignupState] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<AuthErrorField[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [newPasswordPending, setNewPasswordPending] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ uri: string; secret: string } | null>(
    null,
  );

  const errorId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const passwordRequirements = useMemo(
    () => getPasswordRequirements(password),
    [password],
  );
  const newPasswordRequirements = useMemo(
    () => getPasswordRequirements(newPassword),
    [newPassword],
  );

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  useEffect(() => {
    if (success && successRef.current) {
      successRef.current.focus();
    }
  }, [success]);

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [view]);

  const cardCopy = useMemo<CardCopy>(() => {
    switch (view) {
      case "sign-up":
        return {
          title: "Create account",
          subtitle: "Create a new account to get started.",
        };
      case "forgot-password":
        return {
          title: "Reset password",
          subtitle: "Enter your email and we will send you a verification code.",
        };
      case "reset-password":
        return {
          title: "Enter verification code",
          subtitle:
            "Use the code from your email to set a new password. If you don't see it, check your spam or junk folder.",
        };
      case "verify-sign-up":
        return {
          title: "Verify email",
          subtitle: "Confirm your email to finish creating your account.",
        };
      case "new-password-required":
        return {
          title: "Set new password",
          subtitle: "Create a permanent password to continue into GrantWell.",
        };
      case "mfa-challenge":
        return {
          title: "Two-step verification",
          subtitle: "Enter the code from your authenticator app.",
        };
      case "mfa-setup":
        return {
          title: "Set up two-step verification",
          subtitle: "Register an authenticator app to finish signing in.",
        };
      default:
        return {
          title: "Sign in",
          subtitle: "Sign in to GrantWell.",
        };
    }
  }, [view]);

  const setStepError = (message: string, fields: AuthErrorField[] = []) => {
    setError(message);
    setErrorFields(fields);
  };

  const clearError = () => {
    setError(null);
    setErrorFields([]);
  };

  const fieldErrorId = (field: AuthErrorField) =>
    error && errorFields.includes(field) ? errorId : undefined;

  const clearMessages = () => {
    clearError();
    setSuccess(null);
  };

  const resetTransientState = () => {
    setConfirmPassword("");
    setNewPassword("");
    setVerificationCode("");
    setNewPasswordPending(false);
    setTotpSetup(null);
    setShowPassword(false);
  };

  const switchToSignIn = (message?: string) => {
    resetTransientState();
    setPassword("");
    setView("sign-in");
    clearError();
    setSuccess(message ?? null);
  };

  const switchToSignUp = () => {
    resetTransientState();
    setPassword("");
    clearMessages();
    setView("sign-up");
  };

  const applySignInStep = (nextStep: SignInOutput["nextStep"]) => {
    switch (nextStep.signInStep) {
      case "DONE":
        onAuthenticated();
        return;
      case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED":
        setNewPasswordPending(true);
        setNewPassword("");
        setView("new-password-required");
        return;
      case "CONFIRM_SIGN_UP":
        setVerificationCode("");
        setView("verify-sign-up");
        setStepError(
          "Your account is not verified yet. Enter your verification code to continue.",
        );
        return;
      case "RESET_PASSWORD":
        setView("forgot-password");
        setStepError("You need to reset your password before signing in.");
        return;
      case "CONFIRM_SIGN_IN_WITH_TOTP_CODE":
        setVerificationCode("");
        setView("mfa-challenge");
        return;
      case "CONTINUE_SIGN_IN_WITH_TOTP_SETUP":
        setVerificationCode("");
        setTotpSetup({
          uri: nextStep.totpSetupDetails
            .getSetupUri(branding.appName, normalizedEmail)
            .toString(),
          secret: nextStep.totpSetupDetails.sharedSecret,
        });
        setView("mfa-setup");
        return;
      default:
        setStepError(getUnsupportedChallengeMessage(nextStep.signInStep));
    }
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getSignInValidationError(email, password);
    if (validationError) {
      setStepError(validationError, [
        getEmailValidationError(email) ? "email" : "password",
      ]);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const { nextStep } = await signInFresh(normalizedEmail, password);
      applySignInStep(nextStep);
    } catch (authError) {
      const code = getAuthErrorCode(authError);
      if (code === "UserNotConfirmedException") {
        setView("verify-sign-up");
      }
      setStepError(
        mapAuthError(authError, "sign-in"),
        authErrorFields(code, "sign-in"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getForgotPasswordValidationError(email);
    if (validationError) {
      setStepError(validationError, ["email"]);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await resetPassword({ username: normalizedEmail });
      setVerificationCode("");
      setNewPassword("");
      setSuccess("Check your email for a verification code to reset your password.");
      setView("reset-password");
    } catch (authError) {
      setStepError(
        mapAuthError(authError, "forgot-password"),
        authErrorFields(getAuthErrorCode(authError), "forgot-password"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getResetPasswordValidationError(
      email,
      verificationCode,
      newPassword,
    );
    if (validationError) {
      setStepError(
        validationError,
        resetPasswordValidationFields(email, verificationCode, newPassword),
      );
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await confirmResetPassword({
        username: normalizedEmail,
        confirmationCode: verificationCode.trim(),
        newPassword,
      });
      setNewPassword("");
      setVerificationCode("");
      switchToSignIn("Password reset successful. Sign in with your new password.");
    } catch (authError) {
      setStepError(
        mapAuthError(authError, "reset-password"),
        authErrorFields(getAuthErrorCode(authError), "reset-password"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getSignUpValidationError(email, password, confirmPassword);
    if (validationError) {
      setStepError(validationError, signUpValidationFields(email, password));
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await signUp({
        username: normalizedEmail,
        password,
        options: {
          userAttributes: { email: normalizedEmail },
          clientMetadata: signupState ? { state: signupState } : undefined,
        },
      });
      writePendingSignupState(normalizedEmail, signupState);
      setVerificationCode("");
      setSuccess("Verification code sent. Enter it below to finish creating your account.");
      setView("verify-sign-up");
    } catch (authError) {
      setStepError(
        mapAuthError(authError, "sign-up"),
        authErrorFields(getAuthErrorCode(authError), "sign-up"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getVerifySignUpValidationError(email, verificationCode);
    if (validationError) {
      setStepError(
        validationError,
        getEmailValidationError(email) ? [] : ["verificationCode"],
      );
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const pendingState = signupState || readPendingSignupState(normalizedEmail);
      await confirmSignUp({
        username: normalizedEmail,
        confirmationCode: verificationCode.trim(),
        options: {
          clientMetadata: pendingState ? { state: pendingState } : undefined,
        },
      });
      clearPendingSignupState();

      if (!password) {
        switchToSignIn("Email verified. Sign in to continue.");
        return;
      }

      const { nextStep } = await signInFresh(normalizedEmail, password);
      applySignInStep(nextStep);
    } catch (authError) {
      setStepError(
        mapAuthError(authError, "verify-sign-up"),
        authErrorFields(getAuthErrorCode(authError), "verify-sign-up"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignUpCode = async () => {
    if (loading) return;

    const validationError = getForgotPasswordValidationError(email);
    if (validationError) {
      setStepError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await resendSignUpCode({ username: normalizedEmail });
      setSuccess("Verification code resent. Check your email for the latest code.");
    } catch (authError) {
      setStepError(
        mapAuthError(authError, "resend-sign-up"),
        authErrorFields(getAuthErrorCode(authError), "resend-sign-up"),
      );
    } finally {
      setLoading(false);
    }
  };

  const submitChallengeCode = async (
    event: FormEvent<HTMLFormElement>,
    context: AuthErrorContext,
  ) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getVerificationCodeValidationError(verificationCode);
    if (validationError) {
      setStepError(validationError, ["verificationCode"]);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const { nextStep } = await confirmSignIn({
        challengeResponse: verificationCode.trim(),
      });
      setVerificationCode("");
      applySignInStep(nextStep);
    } catch (authError) {
      const code = getAuthErrorCode(authError);
      if (code === "SignInException") {
        switchToSignIn(mapAuthError(authError, context));
        return;
      }
      if (code === "CodeMismatchException" || code === "EnableSoftwareTokenMFAException") {
        setVerificationCode("");
      }
      setStepError(
        mapAuthError(authError, context),
        authErrorFields(code, context),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMfaChallenge = (event: FormEvent<HTMLFormElement>) =>
    submitChallengeCode(event, "mfa");

  const handleMfaSetup = (event: FormEvent<HTMLFormElement>) =>
    submitChallengeCode(event, "mfa-setup");

  const handleNewPasswordRequired = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getPasswordValidationError(newPassword);
    if (validationError) {
      setStepError(validationError, ["newPassword"]);
      setSuccess(null);
      return;
    }

    if (!newPasswordPending) {
      switchToSignIn("Your password setup session expired. Sign in again to continue.");
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const { nextStep } = await confirmSignIn({ challengeResponse: newPassword });
      setNewPasswordPending(false);
      applySignInStep(nextStep);
    } catch (authError) {
      setStepError(
        mapAuthError(authError, "new-password"),
        authErrorFields(getAuthErrorCode(authError), "new-password"),
      );
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (view) {
      case "sign-up":
        return (
          <SignUpStep
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            showPassword={showPassword}
            stateCode={signupState}
            loading={loading}
            passwordRequirements={passwordRequirements}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onShowPasswordChange={setShowPassword}
            onStateChange={setSignupState}
            onSubmit={handleSignUp}
            onSwitchToSignIn={() => switchToSignIn()}
            emailErrorId={fieldErrorId("email")}
            passwordErrorId={fieldErrorId("password")}
            confirmPasswordErrorId={fieldErrorId("confirmPassword")}
          />
        );
      case "forgot-password":
        return (
          <ForgotPasswordStep
            email={email}
            loading={loading}
            onEmailChange={setEmail}
            onSubmit={handleForgotPassword}
            onBackToSignIn={() => switchToSignIn()}
            emailErrorId={fieldErrorId("email")}
          />
        );
      case "reset-password":
        return (
          <ResetPasswordStep
            verificationCode={verificationCode}
            newPassword={newPassword}
            showPassword={showPassword}
            loading={loading}
            passwordRequirements={newPasswordRequirements}
            onVerificationCodeChange={setVerificationCode}
            onNewPasswordChange={setNewPassword}
            onShowPasswordChange={setShowPassword}
            onSubmit={handleResetPassword}
            onBackToSignIn={() => switchToSignIn()}
            verificationCodeErrorId={fieldErrorId("verificationCode")}
            newPasswordErrorId={fieldErrorId("newPassword")}
          />
        );
      case "verify-sign-up":
        return (
          <VerifySignUpStep
            email={normalizedEmail}
            verificationCode={verificationCode}
            loading={loading}
            onVerificationCodeChange={setVerificationCode}
            onSubmit={handleVerifySignUp}
            onResendCode={handleResendSignUpCode}
            onBackToSignUp={switchToSignUp}
            verificationCodeErrorId={fieldErrorId("verificationCode")}
          />
        );
      case "mfa-challenge":
        return (
          <MfaChallengeStep
            verificationCode={verificationCode}
            loading={loading}
            onVerificationCodeChange={setVerificationCode}
            onSubmit={handleMfaChallenge}
            onCancel={() => switchToSignIn()}
            verificationCodeErrorId={fieldErrorId("verificationCode")}
          />
        );
      case "mfa-setup":
        return (
          <MfaSetupStep
            setupUri={totpSetup?.uri ?? ""}
            secret={totpSetup?.secret ?? ""}
            verificationCode={verificationCode}
            loading={loading}
            onVerificationCodeChange={setVerificationCode}
            onSubmit={handleMfaSetup}
            onCancel={() => switchToSignIn()}
            verificationCodeErrorId={fieldErrorId("verificationCode")}
          />
        );
      case "new-password-required":
        return (
          <NewPasswordStep
            newPassword={newPassword}
            showPassword={showPassword}
            loading={loading}
            passwordRequirements={newPasswordRequirements}
            onNewPasswordChange={setNewPassword}
            onShowPasswordChange={setShowPassword}
            onSubmit={handleNewPasswordRequired}
            onCancel={() => switchToSignIn()}
            newPasswordErrorId={fieldErrorId("newPassword")}
          />
        );
      default:
        return (
          <SignInStep
            email={email}
            password={password}
            showPassword={showPassword}
            loading={loading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onShowPasswordChange={setShowPassword}
            onForgotPassword={() => {
              clearMessages();
              setVerificationCode("");
              setNewPassword("");
              setShowPassword(false);
              setView("forgot-password");
            }}
            onSubmit={handleSignIn}
            onSwitchToSignUp={switchToSignUp}
            emailErrorId={fieldErrorId("email")}
            passwordErrorId={fieldErrorId("password")}
          />
        );
    }
  };

  const showTabs = view === "sign-in" || view === "sign-up";

  return (
    <div className="auth-login-card">
      <img
        className="auth-card-logo"
        src={branding.logo}
        alt={branding.appName}
      />
      {showTabs && (
        <div className="auth-tabs" role="group" aria-label="Authentication mode">
          <button
            type="button"
            aria-pressed={view === "sign-in"}
            className={
              "auth-tab" + (view === "sign-in" ? " auth-tab--active" : "")
            }
            onClick={() => switchToSignIn()}
          >
            Sign In
          </button>
          <button
            type="button"
            aria-pressed={view === "sign-up"}
            className={
              "auth-tab" + (view === "sign-up" ? " auth-tab--active" : "")
            }
            onClick={switchToSignUp}
          >
            Sign Up
          </button>
        </div>
      )}
      <div className="auth-card-header">
        <h1
          id="auth-card-title"
          className="auth-card-title"
          ref={titleRef}
          tabIndex={-1}
        >
          {cardCopy.title}
        </h1>
        <p className="auth-card-subtitle">{cardCopy.subtitle}</p>
      </div>
      <div className="auth-card-content">
        <div aria-live="polite" aria-atomic="true">
          {error ? (
            <Alert
              variant="danger"
              dismissible
              onClose={clearError}
              className="mb-3"
              ref={errorRef}
              tabIndex={-1}
            >
              <span id={errorId}>{error}</span>
            </Alert>
          ) : null}
          {success ? (
            <Alert
              variant="success"
              dismissible
              onClose={() => setSuccess(null)}
              className="mb-3"
              ref={successRef}
              tabIndex={-1}
            >
              {success}
            </Alert>
          ) : null}
        </div>
        {renderStep()}
      </div>
    </div>
  );
}

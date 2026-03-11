import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import { Auth } from "aws-amplify";
import SignInStep from "../../components/auth/steps/SignInStep";
import ForgotPasswordStep from "../../components/auth/steps/ForgotPasswordStep";
import ResetPasswordStep from "../../components/auth/steps/ResetPasswordStep";
import NewPasswordStep from "../../components/auth/steps/NewPasswordStep";
import SignUpStep from "../../components/auth/steps/SignUpStep";
import VerifySignUpStep from "../../components/auth/steps/VerifySignUpStep";
import { AuthChallengeUser, AuthView } from "../../components/auth/auth-types";
import {
  getAuthErrorCode,
  getForgotPasswordValidationError,
  getPasswordRequirements,
  getPasswordValidationError,
  getResetPasswordValidationError,
  getSignInValidationError,
  getSignUpValidationError,
  getUnsupportedChallengeMessage,
  getVerifySignUpValidationError,
  mapAuthError,
  normalizeEmail,
} from "../../components/auth/auth-utils";
import "../../styles/utilities.css";
import "../../styles/auth-page.css";

interface AuthPageProps {
  onAuthenticated: () => void;
}

interface CardCopy {
  title: string;
  subtitle: string;
}

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [view, setView] = useState<AuthView>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [challengeUser, setChallengeUser] = useState<AuthChallengeUser | null>(null);

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
          subtitle: "Use the code from your email to set a new password.",
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
      default:
        return {
          title: "Sign in",
          subtitle: "Sign in to GrantWell.",
        };
    }
  }, [view]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const resetTransientState = () => {
    setConfirmPassword("");
    setNewPassword("");
    setVerificationCode("");
    setChallengeUser(null);
    setShowPassword(false);
  };

  const switchToSignIn = (message?: string) => {
    resetTransientState();
    setPassword("");
    setView("sign-in");
    setError(null);
    setSuccess(message ?? null);
  };

  const switchToSignUp = () => {
    resetTransientState();
    setPassword("");
    clearMessages();
    setView("sign-up");
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getSignInValidationError(email, password);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const user = (await Auth.signIn(
        normalizedEmail,
        password,
      )) as AuthChallengeUser | undefined;

      const challengeName = user?.challengeName;
      if (challengeName === "NEW_PASSWORD_REQUIRED") {
        setChallengeUser(user ?? null);
        setNewPassword("");
        setView("new-password-required");
        return;
      }

      if (challengeName) {
        setError(getUnsupportedChallengeMessage(challengeName));
        return;
      }

      onAuthenticated();
    } catch (authError) {
      if (getAuthErrorCode(authError) === "UserNotConfirmedException") {
        setView("verify-sign-up");
      }
      setError(mapAuthError(authError, "sign-in"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getForgotPasswordValidationError(email);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await Auth.forgotPassword(normalizedEmail);
      setVerificationCode("");
      setNewPassword("");
      setSuccess("Check your email for a verification code to reset your password.");
      setView("reset-password");
    } catch (authError) {
      setError(mapAuthError(authError, "forgot-password"));
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
      setError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await Auth.forgotPasswordSubmit(
        normalizedEmail,
        verificationCode.trim(),
        newPassword,
      );
      setNewPassword("");
      setVerificationCode("");
      switchToSignIn("Password reset successful. Sign in with your new password.");
    } catch (authError) {
      setError(mapAuthError(authError, "reset-password"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getSignUpValidationError(email, password, confirmPassword);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await Auth.signUp({
        username: normalizedEmail,
        password,
        attributes: {
          email: normalizedEmail,
        },
      });
      setVerificationCode("");
      setSuccess("Verification code sent. Enter it below to finish creating your account.");
      setView("verify-sign-up");
    } catch (authError) {
      setError(mapAuthError(authError, "sign-up"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getVerifySignUpValidationError(email, verificationCode);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await Auth.confirmSignUp(normalizedEmail, verificationCode.trim());

      if (!password) {
        switchToSignIn("Email verified. Sign in to continue.");
        return;
      }

      const user = (await Auth.signIn(
        normalizedEmail,
        password,
      )) as AuthChallengeUser | undefined;

      if (user?.challengeName) {
        if (user.challengeName === "NEW_PASSWORD_REQUIRED") {
          setChallengeUser(user);
          setNewPassword("");
          setView("new-password-required");
          return;
        }

        switchToSignIn("Email verified. Sign in to continue.");
        return;
      }

      onAuthenticated();
    } catch (authError) {
      setError(mapAuthError(authError, "verify-sign-up"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignUpCode = async () => {
    if (loading) return;

    const validationError = getForgotPasswordValidationError(email);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await Auth.resendSignUp(normalizedEmail);
      setSuccess("Verification code resent. Check your email for the latest code.");
    } catch (authError) {
      setError(mapAuthError(authError, "resend-sign-up"));
    } finally {
      setLoading(false);
    }
  };

  const handleNewPasswordRequired = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const validationError = getPasswordValidationError(newPassword);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    if (!challengeUser) {
      switchToSignIn("Your password setup session expired. Sign in again to continue.");
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      await Auth.completeNewPassword(challengeUser, newPassword);
      onAuthenticated();
    } catch (authError) {
      setError(mapAuthError(authError, "new-password"));
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
            loading={loading}
            passwordRequirements={passwordRequirements}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onShowPasswordChange={setShowPassword}
            onSubmit={handleSignUp}
            onSwitchToSignIn={() => switchToSignIn()}
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
          />
        );
    }
  };

  return (
    <main className="auth-page-wrapper" id="main-content">
      <div className="auth-page-container">
        <div className="auth-hero-row">
          <div className="auth-hero-column">
            <section className="auth-product-identity" aria-labelledby="product-title">
              <div className="auth-logo-row">
                <img
                  src="/images/stateseal-color.png"
                  alt="Massachusetts State Seal"
                  className="auth-state-seal"
                />
                <h1 id="product-title" className="auth-product-name">
                  GrantWell
                </h1>
              </div>
              <p className="auth-tagline">Find and apply for state and federal grants</p>
              <p className="auth-product-description">
                GrantWell helps Massachusetts municipalities discover, understand,
                and draft applications for state and federal grants. This tool is
                free to use for Massachusetts municipalities and their partners.
              </p>
            </section>
          </div>

          <div className="auth-login-column">
            <div className="auth-login-card">
              <div className="auth-card-header">
                <h2
                  id="auth-card-title"
                  className="auth-card-title"
                  ref={titleRef}
                  tabIndex={-1}
                >
                  {cardCopy.title}
                </h2>
                <p className="auth-card-subtitle">{cardCopy.subtitle}</p>
              </div>
              <div className="auth-card-content">
                <div aria-live="polite" aria-atomic="true">
                  {error ? (
                    <Alert
                      variant="danger"
                      dismissible
                      onClose={() => setError(null)}
                      className="mb-3"
                      ref={errorRef}
                      tabIndex={-1}
                    >
                      {error}
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
          </div>
        </div>

        <section className="auth-features-row" aria-labelledby="features-heading">
          <h2 id="features-heading" className="visually-hidden">
            Key features
          </h2>
          <div className="auth-features-grid">
            <div className="auth-feature-card">
              <img
                src="/images/grantwell-icons_discover.png"
                alt=""
                className="auth-feature-icon-image"
                aria-hidden="true"
              />
              <h3 className="auth-feature-title">Discover</h3>
              <p className="auth-feature-description">
                Search for relevant state and federal funding opportunities aligned
                with your community needs.
              </p>
            </div>

            <div className="auth-feature-card">
              <img
                src="/images/grantwell-icons_understand.png"
                alt=""
                className="auth-feature-icon-image"
                aria-hidden="true"
              />
              <h3 className="auth-feature-title">Understand</h3>
              <p className="auth-feature-description">
                Extract key grant information and use chat to ask questions about
                eligibility and requirements.
              </p>
            </div>

            <div className="auth-feature-card">
              <img
                src="/images/grantwell-icons_draft.png"
                alt=""
                className="auth-feature-icon-image"
                aria-hidden="true"
              />
              <h3 className="auth-feature-title">Draft</h3>
              <p className="auth-feature-description">
                Get step-by-step guidance to help draft your grant applications
                with AI-powered assistance.
              </p>
            </div>
          </div>
        </section>

        <section className="auth-trust-row" aria-labelledby="trust-heading">
          <div className="auth-trust-panel">
            <div className="auth-trust-content">
              <div className="auth-trust-text">
                <h2 id="trust-heading" className="auth-trust-title">
                  Free and AI-Powered
                </h2>
                <p className="auth-trust-description">
                  GrantWell uses AI as a support tool, not a decision-maker. AI
                  responses are grounded in official Notice of Funding Opportunity
                  documents. The system is designed not to invent requirements or
                  facts. All drafts require human review before submission. Users
                  retain full control and professional judgment.
                </p>
              </div>
              <img
                src="/images/grantwell-icons_hero-image.png"
                alt=""
                className="auth-trust-image"
                aria-hidden="true"
              />
            </div>
          </div>
        </section>

        <section
          className="auth-attribution"
          aria-label="Attribution and contact information"
        >
          <p className="auth-attribution-text">
            Brought to you by the Federal Funds and Infrastructure Office of the
            Commonwealth of Massachusetts.
          </p>
          <p className="auth-attribution-text">
            Developed by{" "}
            <a
              href="https://burnes.northeastern.edu/ai-for-impact-coop/"
              target="_blank"
              rel="noopener noreferrer"
              className="auth-attribution-link"
            >
              AI for Impact
            </a>{" "}
            at the Burnes Center, Northeastern University.
          </p>
          <p className="auth-attribution-text">
            Questions? Contact{" "}
            <a
              href="mailto:FedFundsInfra@mass.gov"
              className="auth-attribution-link"
            >
              FedFundsInfra@mass.gov
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}

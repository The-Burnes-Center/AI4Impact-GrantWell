import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";

interface VerifySignUpStepProps {
  email: string;
  verificationCode: string;
  loading: boolean;
  onVerificationCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResendCode: () => void;
  onBackToSignUp: () => void;
}

export default function VerifySignUpStep({
  email,
  verificationCode,
  loading,
  onVerificationCodeChange,
  onSubmit,
  onResendCode,
  onBackToSignUp,
}: VerifySignUpStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <p className="auth-form-description">
        Enter the verification code sent to <strong>{email}</strong> to finish creating
        your account.
      </p>
      <Form onSubmit={onSubmit} aria-label="Email verification form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="signup-verification-code-input">
            Verification code <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="signup-verification-code-input"
            type="text"
            placeholder="Enter 6-digit code"
            value={verificationCode}
            onChange={(event) => onVerificationCodeChange(event.target.value)}
            disabled={loading}
            required
            className="form-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-required="true"
          />
        </Form.Group>
        <div className="login-form-actions">
          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            className="login-submit-button"
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span className="visually-hidden">Loading</span>
                Verifying...
              </>
            ) : (
              "Verify email"
            )}
          </Button>
        </div>
      </Form>
      <div className="login-form-footer login-form-footer--split">
        <Button
          variant="link"
          type="button"
          onClick={onResendCode}
          disabled={loading}
          className="create-account-link"
        >
          Resend code
        </Button>
        <Button
          variant="link"
          type="button"
          onClick={onBackToSignUp}
          disabled={loading}
          className="create-account-link"
        >
          Back
        </Button>
      </div>
    </div>
  );
}

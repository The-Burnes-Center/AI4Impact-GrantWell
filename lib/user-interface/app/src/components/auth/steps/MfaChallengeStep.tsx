import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import MfaRecoveryNote from "../MfaRecoveryNote";

interface MfaChallengeStepProps {
  verificationCode: string;
  loading: boolean;
  onVerificationCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  verificationCodeErrorId?: string;
}

export default function MfaChallengeStep({
  verificationCode,
  loading,
  onVerificationCodeChange,
  onSubmit,
  onCancel,
  verificationCodeErrorId,
}: MfaChallengeStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <p className="auth-form-description">
        Enter the 6-digit code from your authenticator app to finish signing in.
      </p>
      <Form onSubmit={onSubmit} aria-label="Two-step verification form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="mfa-code-input">
            Authentication code <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="mfa-code-input"
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
            aria-invalid={verificationCodeErrorId ? true : undefined}
            aria-describedby={verificationCodeErrorId}
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
                <Spinner animation="border" size="sm" aria-hidden="true" className="me-2" />
                <span className="visually-hidden">Loading</span>
                Verifying...
              </>
            ) : (
              "Verify code"
            )}
          </Button>
        </div>
      </Form>
      <MfaRecoveryNote variant="challenge" />
      <div className="login-form-footer">
        <Button
          variant="link"
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="create-account-link"
        >
          Back to sign in
        </Button>
      </div>
    </div>
  );
}

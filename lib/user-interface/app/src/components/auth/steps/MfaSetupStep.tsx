import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import TotpEnrollment from "../TotpEnrollment";
import MfaRecoveryNote from "../MfaRecoveryNote";

interface MfaSetupStepProps {
  setupUri: string;
  secret: string;
  verificationCode: string;
  loading: boolean;
  onVerificationCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  verificationCodeErrorId?: string;
}

export default function MfaSetupStep({
  setupUri,
  secret,
  verificationCode,
  loading,
  onVerificationCodeChange,
  onSubmit,
  onCancel,
  verificationCodeErrorId,
}: MfaSetupStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <p className="auth-form-description">
        This account requires two-step verification. Register an authenticator app
        to finish signing in.
      </p>
      <TotpEnrollment setupUri={setupUri} secret={secret} />
      <MfaRecoveryNote variant="setup" />
      <Form onSubmit={onSubmit} aria-label="Two-step verification setup form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="mfa-setup-code-input">
            Authentication code <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="mfa-setup-code-input"
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
              "Finish setup"
            )}
          </Button>
        </div>
      </Form>
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

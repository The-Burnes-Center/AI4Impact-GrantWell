import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import OtpInput from "../OtpInput";
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
      <Form onSubmit={onSubmit} aria-label="Two-step verification form" noValidate>
        <Form.Group className="mb-3">
          <span className="form-label otp-input-label" id="mfa-code-label">
            Authentication code <span aria-hidden="true">*</span>
          </span>
          <OtpInput
            idPrefix="mfa-code-input"
            labelId="mfa-code-label"
            value={verificationCode}
            onChange={onVerificationCodeChange}
            loading={loading}
            invalid={Boolean(verificationCodeErrorId)}
            describedById={verificationCodeErrorId}
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
      <MfaRecoveryNote />
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

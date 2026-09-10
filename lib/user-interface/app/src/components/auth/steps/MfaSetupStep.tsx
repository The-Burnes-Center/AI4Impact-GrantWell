import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import OtpInput from "../OtpInput";
import TotpEnrollment from "../TotpEnrollment";

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
        Two-step verification is required on every account.
      </p>
      <TotpEnrollment setupUri={setupUri} secret={secret} />
      <Form onSubmit={onSubmit} aria-label="Two-step verification setup form" noValidate>
        <Form.Group className="mb-3">
          <span className="form-label otp-input-label" id="mfa-setup-code-label">
            Authentication code <span aria-hidden="true">*</span>
          </span>
          <OtpInput
            idPrefix="mfa-setup-code-input"
            labelId="mfa-setup-code-label"
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

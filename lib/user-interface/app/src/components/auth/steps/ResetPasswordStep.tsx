import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import PasswordRequirementsList from "../PasswordRequirementsList";
import { PasswordRequirements } from "../auth-types";

interface ResetPasswordStepProps {
  verificationCode: string;
  newPassword: string;
  showPassword: boolean;
  loading: boolean;
  passwordRequirements: PasswordRequirements;
  onVerificationCodeChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onShowPasswordChange: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBackToSignIn: () => void;
}

export default function ResetPasswordStep({
  verificationCode,
  newPassword,
  showPassword,
  loading,
  passwordRequirements,
  onVerificationCodeChange,
  onNewPasswordChange,
  onShowPasswordChange,
  onSubmit,
  onBackToSignIn,
}: ResetPasswordStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <Form onSubmit={onSubmit} aria-label="Reset password form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="verification-code-input">
            Verification code <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="verification-code-input"
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
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="reset-new-password-input">
            New password <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="reset-new-password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Enter new password"
            value={newPassword}
            onChange={(event) => onNewPasswordChange(event.target.value)}
            disabled={loading}
            autoComplete="new-password"
            required
            className="form-input"
            aria-required="true"
            aria-describedby="reset-password-requirements"
          />
          <PasswordRequirementsList
            id="reset-password-requirements"
            requirements={passwordRequirements}
          />
        </Form.Group>
        <div className="login-form-options">
          <Form.Check
            type="checkbox"
            id="reset-show-password-checkbox"
            label="Show password"
            checked={showPassword}
            onChange={(event) => onShowPasswordChange(event.target.checked)}
            className="show-password-checkbox"
          />
        </div>
        <div className="login-form-actions">
          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            className="login-submit-button"
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span className="visually-hidden">Loading</span>
                Resetting...
              </>
            ) : (
              "Reset password"
            )}
          </Button>
        </div>
      </Form>
      <div className="login-form-footer">
        <Button
          variant="link"
          type="button"
          onClick={onBackToSignIn}
          disabled={loading}
          className="create-account-link"
        >
          Back to sign in
        </Button>
      </div>
    </div>
  );
}

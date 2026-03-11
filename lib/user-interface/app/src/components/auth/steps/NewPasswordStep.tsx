import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import PasswordRequirementsList from "../PasswordRequirementsList";
import { PasswordRequirements } from "../auth-types";

interface NewPasswordStepProps {
  newPassword: string;
  showPassword: boolean;
  loading: boolean;
  passwordRequirements: PasswordRequirements;
  onNewPasswordChange: (value: string) => void;
  onShowPasswordChange: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export default function NewPasswordStep({
  newPassword,
  showPassword,
  loading,
  passwordRequirements,
  onNewPasswordChange,
  onShowPasswordChange,
  onSubmit,
  onCancel,
}: NewPasswordStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <Form onSubmit={onSubmit} aria-label="Set new password form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="new-password-input">
            New password <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="new-password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Enter new password"
            value={newPassword}
            onChange={(event) => onNewPasswordChange(event.target.value)}
            disabled={loading}
            autoComplete="new-password"
            required
            className="form-input"
            aria-required="true"
            aria-describedby="new-password-requirements"
          />
          <PasswordRequirementsList
            id="new-password-requirements"
            requirements={passwordRequirements}
          />
        </Form.Group>
        <div className="login-form-options">
          <Form.Check
            type="checkbox"
            id="new-password-show-checkbox"
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
                Setting password...
              </>
            ) : (
              "Set new password"
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
          Cancel
        </Button>
      </div>
    </div>
  );
}

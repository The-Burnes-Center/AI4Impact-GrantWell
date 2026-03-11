import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import PasswordRequirementsList from "../PasswordRequirementsList";
import { PasswordRequirements } from "../auth-types";

interface SignUpStepProps {
  email: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  loading: boolean;
  passwordRequirements: PasswordRequirements;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onShowPasswordChange: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchToSignIn: () => void;
}

export default function SignUpStep({
  email,
  password,
  confirmPassword,
  showPassword,
  loading,
  passwordRequirements,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onShowPasswordChange,
  onSubmit,
  onSwitchToSignIn,
}: SignUpStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <Form onSubmit={onSubmit} aria-label="Create account form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="signup-email-input">
            Email address <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="signup-email-input"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            disabled={loading}
            autoComplete="email"
            required
            className="form-input"
            aria-required="true"
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="signup-password-input">
            Password <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="signup-password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Enter password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            disabled={loading}
            autoComplete="new-password"
            required
            className="form-input"
            aria-required="true"
            aria-describedby="password-requirements"
          />
          <PasswordRequirementsList
            id="password-requirements"
            requirements={passwordRequirements}
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="confirm-password-input">
            Confirm password <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="confirm-password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(event) => onConfirmPasswordChange(event.target.value)}
            disabled={loading}
            autoComplete="new-password"
            required
            className="form-input"
            aria-required="true"
          />
        </Form.Group>
        <div className="login-form-options">
          <Form.Check
            type="checkbox"
            id="signup-show-password-checkbox"
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
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span className="visually-hidden">Loading</span>
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </div>
      </Form>
      <div className="login-form-footer login-form-footer--center">
        <span className="auth-footer-prompt">Have an account already?</span>
        <Button
          variant="link"
          type="button"
          onClick={onSwitchToSignIn}
          disabled={loading}
          className="create-account-link create-account-link--inline"
        >
          Sign in
        </Button>
      </div>
    </div>
  );
}

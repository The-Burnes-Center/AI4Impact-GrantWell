import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";

interface SignInStepProps {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onShowPasswordChange: (checked: boolean) => void;
  onForgotPassword: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchToSignUp: () => void;
}

export default function SignInStep({
  email,
  password,
  showPassword,
  loading,
  onEmailChange,
  onPasswordChange,
  onShowPasswordChange,
  onForgotPassword,
  onSubmit,
  onSwitchToSignUp,
}: SignInStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <Form onSubmit={onSubmit} aria-label="Sign in form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="email-input">
            Email address <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="email-input"
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
          <Form.Label className="form-label" htmlFor="password-input">
            Password <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Enter password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            disabled={loading}
            autoComplete="current-password"
            required
            className="form-input"
            aria-required="true"
          />
        </Form.Group>
        <div className="login-form-options">
          <Form.Check
            type="checkbox"
            id="show-password-checkbox"
            label="Show password"
            checked={showPassword}
            onChange={(event) => onShowPasswordChange(event.target.checked)}
            className="show-password-checkbox"
          />
          <Button
            variant="link"
            type="button"
            onClick={onForgotPassword}
            disabled={loading}
            className="forgot-password-link"
          >
            Forgot password?
          </Button>
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
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </div>
      </Form>
      <div className="login-form-footer login-form-footer--center">
        <Button
          variant="link"
          type="button"
          onClick={onSwitchToSignUp}
          disabled={loading}
          className="create-account-link"
        >
          New user? Create an account
        </Button>
      </div>
    </div>
  );
}

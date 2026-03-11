import type { FormEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";

interface ForgotPasswordStepProps {
  email: string;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBackToSignIn: () => void;
}

export default function ForgotPasswordStep({
  email,
  loading,
  onEmailChange,
  onSubmit,
  onBackToSignIn,
}: ForgotPasswordStepProps) {
  return (
    <div className="login-form" role="region" aria-labelledby="auth-card-title">
      <Form onSubmit={onSubmit} aria-label="Forgot password form" noValidate>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="forgot-email-input">
            Email address <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="forgot-email-input"
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
                Sending...
              </>
            ) : (
              "Send reset code"
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

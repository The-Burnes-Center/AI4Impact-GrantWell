import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Auth } from 'aws-amplify';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../styles/auth-page.css';

interface SignUpFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export default function SignUpForm({ onSuccess, onSwitchToLogin }: SignUpFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);

  // Focus error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Focus success message when it appears
  useEffect(() => {
    if (success && successRef.current) {
      successRef.current.focus();
    }
  }, [success]);

  // Focus verification input when verification form appears
  useEffect(() => {
    if (showVerification && verificationInputRef.current) {
      verificationInputRef.current.focus();
    }
  }, [showVerification]);

  // Password requirements validation
  const passwordRequirements = useMemo(() => {
    return {
      minLength: password.length >= 8,
      hasNumber: /\d/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasUppercase: /[A-Z]/.test(password),
      hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    };
  }, [password]);

  const handleSignUp = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password requirements
    if (!passwordRequirements.minLength) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }
    if (!passwordRequirements.hasNumber) {
      setError('Password must contain at least one number');
      setLoading(false);
      return;
    }
    if (!passwordRequirements.hasLowercase) {
      setError('Password must contain at least one lowercase letter');
      setLoading(false);
      return;
    }
    if (!passwordRequirements.hasUppercase) {
      setError('Password must contain at least one uppercase letter');
      setLoading(false);
      return;
    }
    if (!passwordRequirements.hasSymbol) {
      setError('Password must contain at least one symbol');
      setLoading(false);
      return;
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      await Auth.signUp({
        username: normalizedEmail,
        password,
        attributes: {
          email: normalizedEmail,
        },
      });
      setShowVerification(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    setLoading(true);
    setError(null);

    try {
      await Auth.confirmSignUp(email.toLowerCase().trim(), verificationCode);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await Auth.resendSignUp(email.toLowerCase().trim());
      setSuccess('Verification code resent to your email');
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code');
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  if (showVerification) {
    return (
      <div className="login-form">
        <p style={{ marginBottom: '16px', color: '#6b7280' }}>
          We've sent a verification code to <strong>{email}</strong>. Please enter it below.
        </p>
        <Form onSubmit={handleVerify} aria-label="Email verification form" noValidate>
          <div role="alert" aria-live="polite" aria-atomic="true">
            {error && (
              <Alert 
                variant="danger" 
                dismissible 
                onClose={() => setError(null)} 
                className="mt-3"
                ref={errorRef}
                tabIndex={-1}
              >
                {error}
              </Alert>
            )}
          </div>
          <Form.Group className="mb-3">
            <Form.Label className="form-label" htmlFor="verification-code-input">
              Verification Code <span aria-hidden="true">*</span>
            </Form.Label>
            <Form.Control
              id="verification-code-input"
              type="text"
              placeholder="Enter verification code from email"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              disabled={loading}
              required
              className="form-input"
              ref={verificationInputRef}
              aria-describedby={error ? "verification-error" : undefined}
              aria-invalid={error ? true : false}
              aria-required="true"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            {error && (
              <div id="verification-error" className="sr-only" role="alert">
                {error}
              </div>
            )}
          </Form.Group>
          <div className="login-form-actions">
            <Button 
              variant="primary" 
              type="submit" 
              disabled={loading} 
              className="login-submit-button"
              aria-label={loading ? "Verifying email, please wait" : "Verify email address"}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" aria-hidden="true" />
                  <span className="sr-only">Loading...</span>
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </Button>
          </div>
          <div className="login-form-footer">
            <Button 
              variant="link" 
              onClick={handleResendCode} 
              disabled={loading} 
              className="create-account-link"
              aria-label="Resend verification code"
            >
              Resend Code
            </Button>
            <Button 
              variant="link" 
              onClick={() => {
                setShowVerification(false);
                setVerificationCode('');
                setError(null);
                setSuccess(null);
              }}
              disabled={loading}
              className="create-account-link"
              style={{ marginLeft: '16px' }}
              aria-label="Go back to sign up form"
            >
              Back
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  return (
    <div className="login-form" role="region" aria-labelledby="signup-heading">
      <h3 id="signup-heading" className="visually-hidden">Create account form</h3>
      <Form onSubmit={handleSignUp} aria-label="Create account form" noValidate>
        <div role="alert" aria-live="polite" aria-atomic="true">
          {error && (
            <Alert 
              variant="danger" 
              dismissible 
              onClose={() => setError(null)} 
              className="mt-3"
              ref={errorRef}
              tabIndex={-1}
            >
              {error}
            </Alert>
          )}
        </div>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="signup-email-input">
            Email address <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="signup-email-input"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            disabled={loading}
            autoComplete="email"
            required
            className="form-input"
            aria-describedby={error && error.toLowerCase().includes('email') ? "signup-email-error" : undefined}
            aria-invalid={error && error.toLowerCase().includes('email') ? true : false}
            aria-required="true"
          />
          {error && error.toLowerCase().includes('email') && (
            <div id="signup-email-error" className="sr-only" role="alert">
              {error}
            </div>
          )}
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
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            required
            className="form-input"
            aria-describedby={`password-requirements${error && (error.toLowerCase().includes('password') || error.toLowerCase().includes('match')) ? ' signup-password-error' : ''}`}
            aria-invalid={error && (error.toLowerCase().includes('password') || error.toLowerCase().includes('match')) ? true : false}
            aria-required="true"
          />
          {error && (error.toLowerCase().includes('password') || error.toLowerCase().includes('match')) && (
            <div id="signup-password-error" className="sr-only" role="alert">
              {error}
            </div>
          )}
          <div id="password-requirements" className="password-requirements mt-2" role="group" aria-label="Password requirements">
            <small>
              <div className={`password-requirement ${passwordRequirements.minLength ? 'text-success' : 'text-muted'}`}>
                <span aria-hidden="true" className="requirement-icon">{passwordRequirements.minLength ? '✓' : '○'}</span>
                <span>
                  <span className={passwordRequirements.minLength ? 'sr-only' : ''}>Requirement not met: </span>
                  Password must be at least 8 characters
                </span>
              </div>
              <div className={`password-requirement ${passwordRequirements.hasNumber ? 'text-success' : 'text-muted'}`}>
                <span aria-hidden="true" className="requirement-icon">{passwordRequirements.hasNumber ? '✓' : '○'}</span>
                <span>
                  <span className={passwordRequirements.hasNumber ? 'sr-only' : ''}>Requirement not met: </span>
                  Use a number
                </span>
              </div>
              <div className={`password-requirement ${passwordRequirements.hasLowercase ? 'text-success' : 'text-muted'}`}>
                <span aria-hidden="true" className="requirement-icon">{passwordRequirements.hasLowercase ? '✓' : '○'}</span>
                <span>
                  <span className={passwordRequirements.hasLowercase ? 'sr-only' : ''}>Requirement not met: </span>
                  Use a lowercase letter
                </span>
              </div>
              <div className={`password-requirement ${passwordRequirements.hasUppercase ? 'text-success' : 'text-muted'}`}>
                <span aria-hidden="true" className="requirement-icon">{passwordRequirements.hasUppercase ? '✓' : '○'}</span>
                <span>
                  <span className={passwordRequirements.hasUppercase ? 'sr-only' : ''}>Requirement not met: </span>
                  Use an uppercase letter
                </span>
              </div>
              <div className={`password-requirement ${passwordRequirements.hasSymbol ? 'text-success' : 'text-muted'}`}>
                <span aria-hidden="true" className="requirement-icon">{passwordRequirements.hasSymbol ? '✓' : '○'}</span>
                <span>
                  <span className={passwordRequirements.hasSymbol ? 'sr-only' : ''}>Requirement not met: </span>
                  Use a symbol
                </span>
              </div>
            </small>
          </div>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="confirm-password-input">
            Confirm password
          </Form.Label>
          <Form.Control
            id="confirm-password-input"
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            required
            className="form-input"
            aria-describedby={error && error.toLowerCase().includes('match') ? "confirm-password-error" : undefined}
            aria-invalid={error && error.toLowerCase().includes('match') ? true : false}
            aria-required="true"
          />
          {error && error.toLowerCase().includes('match') && (
            <div id="confirm-password-error" className="sr-only" role="alert">
              {error}
            </div>
          )}
        </Form.Group>
        <div className="login-form-options">
          <Form.Check
            type="checkbox"
            id="signup-show-password-checkbox"
            label="Show password"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="show-password-checkbox"
            aria-label="Show password as plain text"
          />
        </div>
        <div className="login-form-actions">
          <Button 
            variant="primary" 
            type="submit" 
            disabled={loading} 
            className="login-submit-button"
            aria-label={loading ? "Creating account, please wait" : "Create account"}
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span className="sr-only">Loading...</span>
                Creating account...
              </>
            ) : (
              'Sign up'
            )}
          </Button>
        </div>
      </Form>
      <div className="login-form-footer">
        <Button 
          variant="link" 
          onClick={onSwitchToLogin} 
          disabled={loading} 
          className="create-account-link"
          aria-label="Have an account already? Sign in"
        >
          Have an account already? Sign in
        </Button>
      </div>
    </div>
  );
}


import { useState, useEffect, useRef } from 'react';
import { Auth } from 'aws-amplify';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../styles/auth-page.css';

interface ResetPasswordPageProps {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}

export default function ResetPasswordPage({ email, onBack, onSuccess }: ResetPasswordPageProps) {
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Focus error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const handleResetPassword = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    setLoading(true);
    setError(null);

    if (!verificationCode || !newPassword) {
      setError('Please enter verification code and new password');
      setLoading(false);
      return;
    }

    try {
      await Auth.forgotPasswordSubmit(email.toLowerCase().trim(), verificationCode, newPassword);
      setSuccess(true);
      // Wait a moment to show success message, then redirect
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
      setLoading(false);
    }
  };

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <main role="main" className="auth-simple-wrapper" id="main-content">
        <div className="auth-simple-card">
          {/* Logo and Branding */}
          <div className="auth-simple-header">
            <div className="auth-logo-container">
              <img
                src="/images/stateseal-color.png"
                alt="Massachusetts State Seal"
                className="auth-logo"
              />
              <h1 className="auth-brand-title">GrantWell</h1>
            </div>
          </div>

          {/* Form Section */}
          <div className="auth-simple-content">
            <h2 className="auth-page-title">Reset your password</h2>
            <p className="auth-page-subtitle">
              Enter the verification code sent to <strong>{email}</strong> and your new password.
            </p>
            
            <div className="login-form">
              <Form onSubmit={handleResetPassword} aria-label="Reset password form" noValidate>
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
                  {success && (
                    <Alert variant="success" className="mt-3">
                      Password reset successful! Redirecting to sign in...
                    </Alert>
                  )}
                </div>
                <Form.Group className="mb-3">
                  <Form.Label className="form-label" htmlFor="reset-verification-input">
                    Verification Code
                  </Form.Label>
                  <Form.Control
                    id="reset-verification-input"
                    type="text"
                    placeholder="Enter verification code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    disabled={loading || success}
                    required
                    className="form-input"
                    aria-describedby={error ? "reset-verification-error" : undefined}
                    aria-invalid={error ? true : false}
                    aria-required="true"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  {error && <div id="reset-verification-error" className="sr-only">{error}</div>}
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="form-label" htmlFor="reset-password-input">
                    New Password
                  </Form.Label>
                  <Form.Control
                    id="reset-password-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading || success}
                    autoComplete="new-password"
                    required
                    className="form-input"
                    aria-describedby={error ? "reset-password-error" : undefined}
                    aria-invalid={error ? true : false}
                    aria-required="true"
                  />
                  {error && <div id="reset-password-error" className="sr-only">{error}</div>}
                </Form.Group>
                <div className="login-form-options" style={{ justifyContent: 'flex-start' }}>
                  <Form.Check
                    type="checkbox"
                    id="reset-show-password-checkbox"
                    label="Show password"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="show-password-checkbox"
                    aria-label="Show password as plain text"
                    disabled={loading || success}
                  />
                </div>
                <div className="login-form-actions">
                  <Button 
                    variant="primary" 
                    type="submit" 
                    disabled={loading || success} 
                    className="login-submit-button"
                    aria-label={loading ? "Resetting password, please wait" : "Reset password"}
                  >
                    {loading ? (
                      <>
                        <Spinner animation="border" size="sm" aria-hidden="true" />
                        <span className="sr-only">Loading...</span>
                        Resetting...
                      </>
                    ) : success ? (
                      'Success!'
                    ) : (
                      'Reset password'
                    )}
                  </Button>
                </div>
              </Form>
              <div className="login-form-footer">
                <Button 
                  variant="link" 
                  onClick={onBack} 
                  className="create-account-link"
                  aria-label="Go back to sign in"
                  disabled={loading || success}
                >
                  Back to sign in
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

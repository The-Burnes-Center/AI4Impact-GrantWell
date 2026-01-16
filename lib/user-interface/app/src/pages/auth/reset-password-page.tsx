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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);

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
      alert('Password reset successful! Please sign in with your new password.');
      onSuccess();
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
      <main role="main" className="auth-page-container" id="main-content">
        <div className="auth-card">
          {/* Left Column - Branding Section */}
          <div className="auth-branding-section">
            <div className="auth-branding-content">
              <div className="auth-logo-container">
                <img
                  src="/images/stateseal-color.png"
                  alt="Massachusetts State Seal"
                  className="auth-logo"
                />
                <h1 className="auth-brand-title">GrantWell</h1>
              </div>
              <div className="auth-branding-text">
                <h2 className="auth-branding-heading">Create new password</h2>
                <p className="auth-branding-description">
                  Enter the verification code we sent to your email and choose a secure new password for your account.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Form Section */}
          <div className="auth-form-section">
            <div className="auth-form-header">
              <h2 className="auth-page-title">Reset your password</h2>
              <p className="auth-page-subtitle">
                Enter the verification code sent to your email and your new password.
              </p>
            </div>
            <div className="auth-content">
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
                  </div>
                  <Form.Group className="mb-3">
                    <Form.Label className="form-label" htmlFor="reset-email-input">
                      Email address
                    </Form.Label>
                    <Form.Control
                      id="reset-email-input"
                      type="email"
                      value={email}
                      readOnly
                      disabled={true}
                      autoComplete="email"
                      className="form-input"
                      style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
                      aria-label="Email address (read-only)"
                    />
                  </Form.Group>
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
                      disabled={loading}
                      required
                      className="form-input"
                      ref={verificationInputRef}
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
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="new-password"
                      required
                      className="form-input"
                      aria-describedby={error ? "reset-password-error" : undefined}
                      aria-invalid={error ? true : false}
                      aria-required="true"
                    />
                    {error && <div id="reset-password-error" className="sr-only">{error}</div>}
                  </Form.Group>
                  <div className="login-form-actions">
                    <Button 
                      variant="primary" 
                      type="submit" 
                      disabled={loading} 
                      className="login-submit-button"
                      aria-label={loading ? "Resetting password, please wait" : "Reset password"}
                    >
                      {loading ? (
                        <>
                          <Spinner animation="border" size="sm" aria-hidden="true" />
                          <span className="sr-only">Loading...</span>
                          Resetting...
                        </>
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
                    aria-label="Go back to forgot password"
                  >
                    Back
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}


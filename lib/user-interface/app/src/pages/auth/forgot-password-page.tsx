import { useState, useEffect, useRef } from 'react';
import { Auth } from 'aws-amplify';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../styles/auth-page.css';

interface ForgotPasswordPageProps {
  onBack: () => void;
  onCodeSent: (email: string) => void;
}

export default function ForgotPasswordPage({ onBack, onCodeSent }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

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

    if (!email) {
      setError('Please enter your email address');
      setLoading(false);
      return;
    }

    try {
      // Normalize email to lowercase
      const normalizedEmail = email.toLowerCase().trim();
      await Auth.forgotPassword(normalizedEmail);
      onCodeSent(normalizedEmail);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset code');
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
                <h2 className="auth-branding-heading">Reset your password</h2>
                <p className="auth-branding-description">
                  Don't worry, we'll help you get back into your account. Enter your email address and we'll send you a verification code.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Form Section */}
          <div className="auth-form-section">
            <div className="auth-form-header">
              <h2 className="auth-page-title">Forgot your password?</h2>
              <p className="auth-page-subtitle">
                Enter your email address. We will send a message with a code to reset your password.
              </p>
            </div>
            <div className="auth-content">
              <div className="login-form">
                <Form onSubmit={handleResetPassword} aria-label="Forgot password form" noValidate>
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
                    <Form.Label className="form-label" htmlFor="forgot-email-input">
                      Email address
                    </Form.Label>
                    <Form.Control
                      id="forgot-email-input"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.toLowerCase())}
                      disabled={loading}
                      autoComplete="email"
                      required
                      className="form-input"
                      ref={emailInputRef}
                      aria-describedby={error ? "forgot-email-error" : undefined}
                      aria-invalid={error ? true : false}
                      aria-required="true"
                    />
                    {error && <div id="forgot-email-error" className="sr-only">{error}</div>}
                  </Form.Group>
                  <div className="login-form-actions">
                    <Button 
                      variant="primary" 
                      type="submit" 
                      disabled={loading} 
                      className="login-submit-button"
                      aria-label={loading ? "Sending password reset code, please wait" : "Reset my password"}
                    >
                      {loading ? (
                        <>
                          <Spinner animation="border" size="sm" aria-hidden="true" />
                          <span className="sr-only">Loading...</span>
                          Sending...
                        </>
                      ) : (
                        'Reset my password'
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


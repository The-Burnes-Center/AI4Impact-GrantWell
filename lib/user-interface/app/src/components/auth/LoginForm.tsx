import { useState, useEffect, useRef } from 'react';
import { Auth } from 'aws-amplify';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../styles/auth-page.css';

interface LoginFormProps {
  onSuccess: () => void;
  onError?: (error: string) => void;
  onSwitchToSignUp?: () => void;
}

type FormView = 'login' | 'forgot-password' | 'reset-password' | 'new-password-required';

export default function LoginForm({ onSuccess, onError, onSwitchToSignUp }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formView, setFormView] = useState<FormView>('login');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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

  // Focus heading when view changes for screen readers
  useEffect(() => {
    if (headingRef.current) {
      headingRef.current.focus();
    }
  }, [formView]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSignIn = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    clearMessages();

    try {
      const user = await Auth.signIn(email.toLowerCase().trim(), password);
      
      if (user.challengeName === 'NEW_PASSWORD_REQUIRED') {
        setCurrentUser(user);
        setFormView('new-password-required');
        setLoading(false);
        return;
      }

      onSuccess();
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred during sign in';
      if (errorMessage.toLowerCase().includes('pending sign in attempt')) {
        setLoading(false);
        return;
      }
      setError(errorMessage);
      onError?.(errorMessage);
      setLoading(false);
    }
  };

  const handleNewPasswordRequired = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    clearMessages();

    if (!newPassword) {
      setError('Please enter a new password');
      setLoading(false);
      return;
    }

    try {
      await Auth.completeNewPassword(currentUser, newPassword);
      onSuccess();
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred setting new password';
      if (errorMessage.toLowerCase().includes('pending sign in attempt')) {
        setLoading(false);
        return;
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    clearMessages();

    if (!email) {
      setError('Please enter your email address');
      setLoading(false);
      return;
    }

    try {
      await Auth.forgotPassword(email.toLowerCase().trim());
      setSuccess('Verification code sent to your email');
      setFormView('reset-password');
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    clearMessages();

    if (!verificationCode || !newPassword) {
      setError('Please enter verification code and new password');
      setLoading(false);
      return;
    }

    try {
      await Auth.forgotPasswordSubmit(email.toLowerCase().trim(), verificationCode, newPassword);
      setSuccess('Password reset successful! You can now sign in.');
      setNewPassword('');
      setVerificationCode('');
      setFormView('login');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setFormView('login');
    setNewPassword('');
    setVerificationCode('');
    clearMessages();
  };

  // Render: New Password Required (first-time login)
  if (formView === 'new-password-required') {
    return (
      <div className="login-form" role="region" aria-labelledby="new-password-heading">
        <h3 
          id="new-password-heading" 
          className="auth-form-heading" 
          tabIndex={-1} 
          ref={headingRef}
        >
          Set New Password
        </h3>
        <p className="auth-form-description">
          You need to set a new password to continue.
        </p>
        <Form onSubmit={handleNewPasswordRequired} aria-label="Set new password form" noValidate>
          <div role="alert" aria-live="polite" aria-atomic="true">
            {error && (
              <Alert 
                variant="danger" 
                dismissible 
                onClose={() => setError(null)} 
                className="mb-3"
                ref={errorRef}
                tabIndex={-1}
              >
                {error}
              </Alert>
            )}
          </div>
          <Form.Group className="mb-3">
            <Form.Label className="form-label" htmlFor="new-password-input">
              New Password <span aria-hidden="true">*</span>
            </Form.Label>
            <Form.Control
              id="new-password-input"
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
              className="form-input"
              aria-required="true"
              aria-describedby="new-password-requirements"
            />
            <div id="new-password-requirements" className="form-help-text">
              Password must be at least 8 characters with uppercase, lowercase, number, and symbol.
            </div>
          </Form.Group>
          <Form.Check
            type="checkbox"
            id="new-password-show-checkbox"
            label="Show password"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="show-password-checkbox mb-3"
          />
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
                'Set New Password'
              )}
            </Button>
          </div>
          <div className="login-form-footer">
            <Button 
              variant="link" 
              onClick={handleBackToLogin}
              disabled={loading}
              className="create-account-link"
            >
              Cancel
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  // Render: Forgot Password (enter email)
  if (formView === 'forgot-password') {
    return (
      <div className="login-form" role="region" aria-labelledby="forgot-password-heading">
        <h3 
          id="forgot-password-heading" 
          className="auth-form-heading" 
          tabIndex={-1} 
          ref={headingRef}
        >
          Reset Password
        </h3>
        <p className="auth-form-description">
          Enter your email address and we'll send you a verification code.
        </p>
        <Form onSubmit={handleForgotPassword} aria-label="Forgot password form" noValidate>
          <div role="alert" aria-live="polite" aria-atomic="true">
            {error && (
              <Alert 
                variant="danger" 
                dismissible 
                onClose={() => setError(null)} 
                className="mb-3"
                ref={errorRef}
                tabIndex={-1}
              >
                {error}
              </Alert>
            )}
          </div>
          <Form.Group className="mb-3">
            <Form.Label className="form-label" htmlFor="forgot-email-input">
              Email address <span aria-hidden="true">*</span>
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
                'Send Reset Code'
              )}
            </Button>
          </div>
          <div className="login-form-footer">
            <Button 
              variant="link" 
              onClick={handleBackToLogin}
              disabled={loading}
              className="create-account-link"
            >
              Back to sign in
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  // Render: Reset Password (enter code + new password)
  if (formView === 'reset-password') {
    return (
      <div className="login-form" role="region" aria-labelledby="reset-password-heading">
        <h3 
          id="reset-password-heading" 
          className="auth-form-heading" 
          tabIndex={-1} 
          ref={headingRef}
        >
          Enter Verification Code
        </h3>
        <p className="auth-form-description">
          We sent a code to <strong>{email}</strong>. Enter it below with your new password.
        </p>
        <Form onSubmit={handleResetPassword} aria-label="Reset password form" noValidate>
          <div role="alert" aria-live="polite" aria-atomic="true">
            {error && (
              <Alert 
                variant="danger" 
                dismissible 
                onClose={() => setError(null)} 
                className="mb-3"
                ref={errorRef}
                tabIndex={-1}
              >
                {error}
              </Alert>
            )}
            {success && (
              <Alert 
                variant="success" 
                className="mb-3"
                ref={successRef}
                tabIndex={-1}
              >
                {success}
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
              placeholder="Enter 6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
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
              New Password <span aria-hidden="true">*</span>
            </Form.Label>
            <Form.Control
              id="reset-new-password-input"
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
              className="form-input"
              aria-required="true"
              aria-describedby="reset-password-requirements"
            />
            <div id="reset-password-requirements" className="form-help-text">
              Password must be at least 8 characters with uppercase, lowercase, number, and symbol.
            </div>
          </Form.Group>
          <Form.Check
            type="checkbox"
            id="reset-show-password-checkbox"
            label="Show password"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="show-password-checkbox mb-3"
          />
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
                'Reset Password'
              )}
            </Button>
          </div>
          <div className="login-form-footer">
            <Button 
              variant="link" 
              onClick={handleBackToLogin}
              disabled={loading}
              className="create-account-link"
            >
              Back to sign in
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  // Render: Login Form (default)
  return (
    <div className="login-form" role="region" aria-labelledby="login-heading">
      <h3 id="login-heading" className="visually-hidden">Sign in form</h3>
      <Form onSubmit={handleSignIn} aria-label="Sign in form" noValidate>
        <div role="alert" aria-live="polite" aria-atomic="true">
          {error && (
            <Alert 
              variant="danger" 
              dismissible 
              onClose={() => setError(null)} 
              className="mb-3"
              ref={errorRef}
              tabIndex={-1}
            >
              {error}
            </Alert>
          )}
          {success && (
            <Alert 
              variant="success" 
              dismissible
              onClose={() => setSuccess(null)}
              className="mb-3"
              ref={successRef}
              tabIndex={-1}
            >
              {success}
            </Alert>
          )}
        </div>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="email-input">
            Email address <span aria-hidden="true">*</span>
          </Form.Label>
          <Form.Control
            id="email-input"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            disabled={loading}
            autoComplete="email"
            required
            className="form-input"
            ref={emailInputRef}
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
            onChange={(e) => setPassword(e.target.value)}
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
            onChange={(e) => setShowPassword(e.target.checked)}
            className="show-password-checkbox"
          />
          <Button 
            variant="link" 
            onClick={() => setFormView('forgot-password')} 
            disabled={loading}
            className="forgot-password-link"
            type="button"
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
              'Sign in'
            )}
          </Button>
        </div>
      </Form>
      {onSwitchToSignUp && (
        <div className="login-form-footer">
          <Button 
            variant="link" 
            onClick={onSwitchToSignUp} 
            disabled={loading} 
            className="create-account-link"
            type="button"
          >
            New user? Create an account
          </Button>
        </div>
      )}
    </div>
  );
}

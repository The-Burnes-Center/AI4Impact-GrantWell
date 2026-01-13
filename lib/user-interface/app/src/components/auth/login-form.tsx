import React, { useState, useEffect, useRef } from 'react';
import { Auth } from 'aws-amplify';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../styles/auth-page.css';

interface LoginFormProps {
  onSuccess: () => void;
  onError?: (error: string) => void;
  onSwitchToSignUp?: () => void;
  onForgotPassword?: () => void;
}

export default function LoginForm({ onSuccess, onError, onSwitchToSignUp, onForgotPassword }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewPasswordRequired, setShowNewPasswordRequired] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);

  // Focus error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const handleSignIn = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    // Prevent multiple simultaneous sign-in attempts
    if (loading) {
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const user = await Auth.signIn(email.toLowerCase().trim(), password);
      
      // Check if user needs to set a new password (first-time login)
      if (user.challengeName === 'NEW_PASSWORD_REQUIRED') {
        setCurrentUser(user);
        setShowNewPasswordRequired(true);
        setLoading(false);
        return;
      }

      // Successful login
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
    if (e) {
      e.preventDefault();
    }
    
    // Prevent multiple simultaneous attempts
    if (loading) {
      return;
    }
    
    setLoading(true);
    setError(null);

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

  const handleForgotPasswordClick = () => {
    if (onForgotPassword) {
      onForgotPassword();
    }
  };

  if (showNewPasswordRequired) {
    return (
      <div className="login-form">
        <p style={{ marginBottom: '16px', color: '#6b7280' }}>
          You need to set a new password to continue.
        </p>
        <Form onSubmit={handleNewPasswordRequired} aria-label="Set new password form">
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
            <Form.Label className="form-label" htmlFor="new-password-input">
              New Password
            </Form.Label>
            <Form.Control
              id="new-password-input"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
              className="form-input"
              ref={newPasswordInputRef}
              aria-describedby={error ? "new-password-error" : undefined}
              aria-invalid={error ? true : false}
            />
            {error && <div id="new-password-error" className="sr-only">{error}</div>}
          </Form.Group>
          <div className="login-form-actions">
            <Button 
              variant="primary" 
              type="submit" 
              disabled={loading} 
              className="login-submit-button"
              aria-label={loading ? "Setting new password, please wait" : "Set new password"}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" aria-hidden="true" />
                  <span className="sr-only">Loading...</span>
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
              onClick={() => {
                setShowNewPasswordRequired(false);
                setCurrentUser(null);
                setNewPassword('');
                setError(null);
              }}
              disabled={loading}
              className="create-account-link"
              aria-label="Cancel setting new password"
            >
              Cancel
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  return (
    <div className="login-form">
      <Form onSubmit={handleSignIn} aria-label="Sign in form" noValidate>
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
          <Form.Label className="form-label" htmlFor="email-input">
            Email address
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
            aria-describedby={error ? "email-error" : undefined}
            aria-invalid={error ? true : false}
            aria-required="true"
          />
          {error && <div id="email-error" className="sr-only">{error}</div>}
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="form-label" htmlFor="password-input">
            Password
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
            ref={passwordInputRef}
            aria-describedby={error ? "password-error" : undefined}
            aria-invalid={error ? true : false}
            aria-required="true"
          />
          {error && <div id="password-error" className="sr-only">{error}</div>}
        </Form.Group>
        <div className="login-form-options">
          <Form.Check
            type="checkbox"
            id="show-password-checkbox"
            label="Show password"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="show-password-checkbox"
            aria-label="Show password as plain text"
          />
          {onForgotPassword && (
            <Button 
              variant="link" 
              onClick={handleForgotPasswordClick} 
              disabled={loading}
              className="forgot-password-link"
              aria-label="Forgot your password? Reset it here"
            >
              Forgot your password?
            </Button>
          )}
        </div>
        <div className="login-form-actions">
          <Button 
            variant="primary" 
            type="submit" 
            disabled={loading} 
            className="login-submit-button"
            aria-label={loading ? "Signing in, please wait" : "Sign in to your account"}
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span className="sr-only">Loading...</span>
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
            aria-label="New user? Create an account"
          >
            New user? Create an account
          </Button>
        </div>
      )}
    </div>
  );
}


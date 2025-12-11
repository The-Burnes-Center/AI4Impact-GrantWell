import React, { useState, useMemo } from 'react';
import { Auth } from 'aws-amplify';
import { Button, FormField, Input, Alert, SpaceBetween, Checkbox } from '@cloudscape-design/components';

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
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);

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
      await Auth.signUp({
        username: email,
        password,
        attributes: {
          email,
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
      await Auth.confirmSignUp(email, verificationCode);
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

    try {
      await Auth.resendSignUp(email);
      setError(null);
      alert('Verification code resent to your email');
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code');
    } finally {
      setLoading(false);
    }
  };

  if (showVerification) {
    return (
      <form onSubmit={handleVerify}>
        <SpaceBetween size="m">
          <div>
            <p style={{ marginBottom: '16px', color: '#5a6169' }}>
              We've sent a verification code to <strong>{email}</strong>. Please enter it below.
            </p>
          </div>
          <FormField label="Verification Code">
            <Input
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.detail.value)}
              placeholder="Enter verification code from email"
              type="text"
              disabled={loading}
            />
          </FormField>
          {error && (
            <Alert type="error" dismissible onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" loading={loading} onClick={() => handleVerify()}>
              Verify Email
            </Button>
            <Button onClick={handleResendCode} disabled={loading}>
              Resend Code
            </Button>
            <Button onClick={() => {
              setShowVerification(false);
              setVerificationCode('');
              setError(null);
            }}>
              Back
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignUp} className="login-form">
      <SpaceBetween size="l">
        <FormField label="Email address">
          <Input
            value={email}
            onChange={(e) => setEmail(e.detail.value)}
            placeholder="Enter your email"
            type="email"
            disabled={loading}
            autoComplete="email"
          />
        </FormField>
        <FormField label="Password">
          <Input
            value={password}
            onChange={(e) => setPassword(e.detail.value)}
            placeholder="Enter password"
            type={showPassword ? "text" : "password"}
            disabled={loading}
            autoComplete="new-password"
          />
          <div className="password-requirements">
            <div className={`password-requirement ${passwordRequirements.minLength ? 'met' : ''}`}>
              <span className="requirement-icon" aria-hidden="true">{passwordRequirements.minLength ? '✓' : '○'}</span>
              <span>Password must be at least 8 characters</span>
            </div>
            <div className={`password-requirement ${passwordRequirements.hasNumber ? 'met' : ''}`}>
              <span className="requirement-icon" aria-hidden="true">{passwordRequirements.hasNumber ? '✓' : '○'}</span>
              <span>Use a number</span>
            </div>
            <div className={`password-requirement ${passwordRequirements.hasLowercase ? 'met' : ''}`}>
              <span className="requirement-icon" aria-hidden="true">{passwordRequirements.hasLowercase ? '✓' : '○'}</span>
              <span>Use a lowercase letter</span>
            </div>
            <div className={`password-requirement ${passwordRequirements.hasUppercase ? 'met' : ''}`}>
              <span className="requirement-icon" aria-hidden="true">{passwordRequirements.hasUppercase ? '✓' : '○'}</span>
              <span>Use an uppercase letter</span>
            </div>
            <div className={`password-requirement ${passwordRequirements.hasSymbol ? 'met' : ''}`}>
              <span className="requirement-icon" aria-hidden="true">{passwordRequirements.hasSymbol ? '✓' : '○'}</span>
              <span>Use a symbol</span>
            </div>
          </div>
        </FormField>
        <FormField label="Confirm password">
          <Input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.detail.value)}
            placeholder="Reenter password"
            type={showPassword ? "text" : "password"}
            disabled={loading}
            autoComplete="new-password"
          />
        </FormField>
        <div className="login-form-options">
          <Checkbox
            checked={showPassword}
            onChange={(e) => setShowPassword(e.detail.checked)}
          >
            Show password
          </Checkbox>
        </div>
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <div className="login-form-actions">
          <Button variant="primary" loading={loading} onClick={() => handleSignUp()}>
            Sign up
          </Button>
        </div>
        <div className="login-form-footer">
          <Button variant="link" onClick={onSwitchToLogin}>
            Have an account already? Sign in
          </Button>
        </div>
      </SpaceBetween>
    </form>
  );
}


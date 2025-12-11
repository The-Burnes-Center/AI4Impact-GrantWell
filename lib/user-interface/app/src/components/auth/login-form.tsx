import React, { useState } from 'react';
import { Auth } from 'aws-amplify';
import { Button, FormField, Input, Alert, SpaceBetween } from '@cloudscape-design/components';

interface LoginFormProps {
  onSuccess: () => void;
  onError?: (error: string) => void;
  onSwitchToSignUp?: () => void;
}

export default function LoginForm({ onSuccess, onError, onSwitchToSignUp }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showNewPasswordRequired, setShowNewPasswordRequired] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSignIn = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    setLoading(true);
    setError(null);

    try {
      const user = await Auth.signIn(email, password);
      
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
      setError(errorMessage);
      onError?.(errorMessage);
      setLoading(false);
    }
  };

  const handleNewPasswordRequired = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
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
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await Auth.forgotPassword(email);
      setShowPasswordReset(true);
      setError(null);
      alert('Password reset code sent to your email');
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    setLoading(true);
    setError(null);

    try {
      await Auth.forgotPasswordSubmit(email, verificationCode, newPassword);
      setError(null);
      alert('Password reset successful! Please sign in with your new password.');
      setShowPasswordReset(false);
      setPassword('');
      setVerificationCode('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (showNewPasswordRequired) {
    return (
      <form onSubmit={handleNewPasswordRequired}>
        <SpaceBetween size="m">
          <div>
            <p style={{ marginBottom: '16px', color: '#5a6169' }}>
              You need to set a new password to continue.
            </p>
          </div>
          <FormField label="New Password">
            <Input
              value={newPassword}
              onChange={(e) => setNewPassword(e.detail.value)}
              placeholder="Enter new password"
              type="password"
              disabled={loading}
              autoComplete="new-password"
            />
          </FormField>
          {error && (
            <Alert type="error" dismissible onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" loading={loading} onClick={() => handleNewPasswordRequired()}>
              Set New Password
            </Button>
            <Button onClick={() => {
              setShowNewPasswordRequired(false);
              setCurrentUser(null);
              setNewPassword('');
              setError(null);
            }}>
              Cancel
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </form>
    );
  }

  if (showPasswordReset) {
    return (
      <form onSubmit={handleForgotPasswordSubmit}>
        <SpaceBetween size="m">
          <FormField label="Email">
            <Input
              value={email}
              onChange={(e) => setEmail(e.detail.value)}
              placeholder="Enter your email"
              type="email"
              disabled={loading}
              autoComplete="email"
            />
          </FormField>
          <FormField label="Verification Code">
            <Input
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.detail.value)}
              placeholder="Enter verification code from email"
              type="text"
              disabled={loading}
            />
          </FormField>
          <FormField label="New Password">
            <Input
              value={newPassword}
              onChange={(e) => setNewPassword(e.detail.value)}
              placeholder="Enter new password"
              type="password"
              disabled={loading}
              autoComplete="new-password"
            />
          </FormField>
          {error && (
            <Alert type="error" dismissible onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" loading={loading} onClick={() => handleForgotPasswordSubmit()}>
              Reset Password
            </Button>
            <Button onClick={() => {
              setShowPasswordReset(false);
              setVerificationCode('');
              setNewPassword('');
              setError(null);
            }}>
              Back to Login
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignIn}>
      <SpaceBetween size="m">
        <FormField label="Email">
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
            placeholder="Enter your password"
            type="password"
            disabled={loading}
            autoComplete="current-password"
          />
        </FormField>
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <SpaceBetween direction="horizontal" size="xs">
          <Button variant="primary" loading={loading} onClick={() => handleSignIn()}>
            Sign In
          </Button>
          <Button variant="link" onClick={handleForgotPassword} disabled={loading}>
            Forgot Password?
          </Button>
        </SpaceBetween>
        {onSwitchToSignUp && (
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <Button variant="link" onClick={onSwitchToSignUp}>
              Don't have an account? Sign Up
            </Button>
          </div>
        )}
      </SpaceBetween>
    </form>
  );
}


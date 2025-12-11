import React, { useState } from 'react';
import { Auth } from 'aws-amplify';
import { Button, FormField, Input, Alert, SpaceBetween, Checkbox } from '@cloudscape-design/components';

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

  const handleForgotPasswordClick = () => {
    if (onForgotPassword) {
      onForgotPassword();
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

  return (
    <form onSubmit={handleSignIn} className="login-form">
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
            autoComplete="current-password"
          />
        </FormField>
        <div className="login-form-options">
          <Checkbox
            checked={showPassword}
            onChange={(e) => setShowPassword(e.detail.checked)}
          >
            Show password
          </Checkbox>
          <Button variant="link" onClick={handleForgotPasswordClick} disabled={loading}>
            Forgot your password?
          </Button>
        </div>
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <div className="login-form-actions">
          <Button variant="primary" loading={loading} onClick={() => handleSignIn()}>
            Sign in
          </Button>
        </div>
        {onSwitchToSignUp && (
          <div className="login-form-footer">
            <Button variant="link" onClick={onSwitchToSignUp}>
              New user? Create an account
            </Button>
          </div>
        )}
      </SpaceBetween>
    </form>
  );
}


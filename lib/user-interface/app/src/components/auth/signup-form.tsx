import React, { useState } from 'react';
import { Auth } from 'aws-amplify';
import { Button, FormField, Input, Alert, SpaceBetween } from '@cloudscape-design/components';

interface SignUpFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export default function SignUpForm({ onSuccess, onSwitchToLogin }: SignUpFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);

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

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
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
    <form onSubmit={handleSignUp}>
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
        <FormField 
          label="Password"
          description="Password must be at least 8 characters long"
        >
          <Input
            value={password}
            onChange={(e) => setPassword(e.detail.value)}
            placeholder="Enter password"
            type="password"
            disabled={loading}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="Confirm Password">
          <Input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.detail.value)}
            placeholder="Confirm password"
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
          <Button variant="primary" loading={loading} onClick={() => handleSignUp()}>
            Sign Up
          </Button>
          <Button variant="link" onClick={onSwitchToLogin}>
            Already have an account? Sign In
          </Button>
        </SpaceBetween>
      </SpaceBetween>
    </form>
  );
}


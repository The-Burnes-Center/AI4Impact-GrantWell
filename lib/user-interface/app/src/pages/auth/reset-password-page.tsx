import { useState } from 'react';
import { Auth } from 'aws-amplify';
import { Button, FormField, Input, Alert, SpaceBetween } from '@cloudscape-design/components';
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
    <main role="main" className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header-section">
          <div className="auth-logo-container">
            <img
              src="/images/stateseal-color.png"
              alt="State Seal"
              className="auth-logo"
            />
            <h1 className="auth-brand-title">GrantWell</h1>
          </div>
          <h1 className="auth-page-title">Reset your password</h1>
          <p className="auth-page-subtitle">
            Enter the verification code sent to your email and your new password.
          </p>
        </div>
        <div className="auth-content">
          <form onSubmit={handleResetPassword} className="login-form">
            <SpaceBetween size="l">
              <FormField label="Email address">
                <Input
                  value={email}
                  readOnly
                  placeholder="Enter your email"
                  type="email"
                  disabled={true}
                  autoComplete="email"
                />
              </FormField>
              <FormField label="Verification Code">
                <Input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.detail.value)}
                  placeholder="Enter verification code"
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
              <div className="login-form-actions">
                <Button variant="primary" loading={loading} onClick={() => handleResetPassword()}>
                  Reset password
                </Button>
              </div>
              <div className="login-form-footer">
                <Button variant="normal" onClick={onBack}>
                  Back
                </Button>
              </div>
            </SpaceBetween>
          </form>
        </div>
      </div>
    </main>
  );
}


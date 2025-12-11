import { useState } from 'react';
import { Auth } from 'aws-amplify';
import { Button, FormField, Input, Alert, SpaceBetween } from '@cloudscape-design/components';
import '../../styles/auth-page.css';

interface ForgotPasswordPageProps {
  onBack: () => void;
  onCodeSent: (email: string) => void;
}

export default function ForgotPasswordPage({ onBack, onCodeSent }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await Auth.forgotPassword(email);
      onCodeSent(email);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset code');
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
          <h1 className="auth-page-title">Forgot your password?</h1>
          <p className="auth-page-subtitle">
            Enter your email address. We will send a message with a code to reset your password.
          </p>
        </div>
        <div className="auth-content">
          <form onSubmit={handleResetPassword} className="login-form">
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
              {error && (
                <Alert type="error" dismissible onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              )}
              <div className="login-form-actions">
                <Button variant="primary" loading={loading} onClick={() => handleResetPassword()}>
                  Reset my password
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


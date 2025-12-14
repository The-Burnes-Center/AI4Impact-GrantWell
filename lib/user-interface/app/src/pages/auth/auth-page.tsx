import { useState } from 'react';
import LoginForm from '../../components/auth/login-form';
import SignUpForm from '../../components/auth/signup-form';
import ForgotPasswordPage from './forgot-password-page';
import ResetPasswordPage from './reset-password-page';
import '../../styles/auth-page.css';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const handleAuthSuccess = () => {
    window.location.reload();
  };

  const handleForgotPasswordClick = () => {
    setShowForgotPassword(true);
  };

  const handleCodeSent = (email: string) => {
    setResetEmail(email.toLowerCase().trim());
    setShowForgotPassword(false);
    setShowResetPassword(true);
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setShowResetPassword(false);
    setResetEmail('');
  };

  if (showResetPassword) {
    return (
      <ResetPasswordPage
        email={resetEmail}
        onBack={handleBackToLogin}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (showForgotPassword) {
    return (
      <ForgotPasswordPage
        onBack={handleBackToLogin}
        onCodeSent={handleCodeSent}
      />
    );
  }

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
          <h1 className="auth-page-title">{isLogin ? 'Sign in' : 'Create account'}</h1>
          <p className="auth-page-subtitle">
            {isLogin ? 'Sign in to your account.' : 'Create a new account to get started.'}
          </p>
        </div>
        <div className="auth-content">
          {isLogin ? (
            <LoginForm 
              onSuccess={handleAuthSuccess}
              onSwitchToSignUp={() => setIsLogin(false)}
              onForgotPassword={handleForgotPasswordClick}
            />
          ) : (
            <SignUpForm 
              onSuccess={handleAuthSuccess}
              onSwitchToLogin={() => setIsLogin(true)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
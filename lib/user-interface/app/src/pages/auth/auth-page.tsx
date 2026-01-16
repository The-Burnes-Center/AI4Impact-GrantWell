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
                <h2 className="auth-branding-heading">
                  {isLogin ? 'Welcome back' : 'Get started today'}
                </h2>
                <p className="auth-branding-description">
                  {isLogin 
                    ? 'Streamline your grant application process and discover funding opportunities tailored to your needs.' 
                    : 'Join GrantWell to access personalized grant recommendations and simplify your application journey.'}
                </p>
                <div className="auth-branding-features">
                  <div className="auth-feature-item">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16.6667 5L7.50004 14.1667L3.33337 10" stroke="rgba(255, 255, 255, 0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Personalized grant matching</span>
                  </div>
                  <div className="auth-feature-item">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16.6667 5L7.50004 14.1667L3.33337 10" stroke="rgba(255, 255, 255, 0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>AI-powered application assistance</span>
                  </div>
                  <div className="auth-feature-item">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16.6667 5L7.50004 14.1667L3.33337 10" stroke="rgba(255, 255, 255, 0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Secure and confidential</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form Section */}
          <div className="auth-form-section">
            <div className="auth-form-header">
              <h2 className="auth-page-title">{isLogin ? 'Sign in' : 'Create account'}</h2>
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
        </div>
      </main>
    </>
  );
}
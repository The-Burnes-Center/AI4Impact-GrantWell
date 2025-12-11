import React, { useState } from 'react';
import { Container, Box } from '@cloudscape-design/components';
import LoginForm from '../../components/auth/login-form';
import SignUpForm from '../../components/auth/signup-form';
import '../../styles/auth-page.css';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);

  const handleAuthSuccess = () => {
    // Reload the page to trigger authentication check
    window.location.reload();
  };

  return (
    <div className="auth-page-container">
      <Container>
        <Box padding="xl">
          <div className="auth-card">
            <div className="auth-header">
              <img
                src="/images/stateseal-color.png"
                alt="State Seal"
                style={{ width: '60px', height: '60px', marginRight: '15px' }}
              />
              <div>
                <h1 className="auth-title">GrantWell</h1>
                <p className="auth-subtitle">Free AI powered tool designed for finding and writing grants</p>
              </div>
            </div>
            <div className="auth-content">
              {isLogin ? (
                <LoginForm 
                  onSuccess={handleAuthSuccess}
                  onSwitchToSignUp={() => setIsLogin(false)}
                />
              ) : (
                <SignUpForm 
                  onSuccess={handleAuthSuccess}
                  onSwitchToLogin={() => setIsLogin(true)}
                />
              )}
            </div>
          </div>
        </Box>
      </Container>
    </div>
  );
}


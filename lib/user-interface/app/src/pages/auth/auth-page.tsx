import { useState } from 'react';
import LoginForm from '../../components/auth/login-form';
import SignUpForm from '../../components/auth/signup-form';
import '../../styles/auth-page.css';

// Feature icons as SVG components
const DiscoverIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="14" cy="14" r="10" stroke="#14558F" strokeWidth="2"/>
    <path d="M22 22L28 28" stroke="#14558F" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="14" cy="14" r="4" fill="#14558F" fillOpacity="0.2"/>
  </svg>
);

const UnderstandIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="4" y="4" width="24" height="24" rx="3" stroke="#14558F" strokeWidth="2"/>
    <path d="M9 12H23" stroke="#14558F" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 17H19" stroke="#14558F" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 22H16" stroke="#14558F" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="6" fill="white" stroke="#14558F" strokeWidth="2"/>
    <path d="M24 22V24.5L25.5 26" stroke="#14558F" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const DraftIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M8 4H20L26 10V28H8V4Z" stroke="#14558F" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M20 4V10H26" stroke="#14558F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 16H22" stroke="#14558F" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 20H22" stroke="#14558F" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 24H18" stroke="#14558F" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="10" cy="16" r="1.5" fill="#14558F"/>
    <circle cx="10" cy="20" r="1.5" fill="#14558F"/>
    <circle cx="10" cy="24" r="1.5" fill="#14558F"/>
  </svg>
);

const AIIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 2L17 10.5L26 14L17 17.5L14 26L11 17.5L2 14L11 10.5L14 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <circle cx="14" cy="14" r="3.5" fill="currentColor" fillOpacity="0.15"/>
  </svg>
);

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);

  const handleAuthSuccess = () => {
    window.location.reload();
  };

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <main role="main" className="auth-page-wrapper" id="main-content">
        <div className="auth-page-container">
          
          {/* Row 1: Hero + Login */}
          <div className="auth-hero-row">
            {/* Left Column - Hero / Product Identity */}
            <div className="auth-hero-column">
              <section className="auth-product-identity" aria-labelledby="product-title">
                <div className="auth-logo-row">
                  <img
                    src="/images/stateseal-color.png"
                    alt="Massachusetts State Seal"
                    className="auth-state-seal"
                  />
                  <h1 id="product-title" className="auth-product-name">GrantWell</h1>
                </div>
                <p className="auth-tagline">Find and apply for state and federal grants</p>
                <p className="auth-product-description">
                  GrantWell helps Massachusetts municipalities discover, understand, and draft applications 
                  for state and federal grants. This tool is free to use for Massachusetts municipalities 
                  and their partners.
                </p>
              </section>
            </div>

            {/* Right Column - Login Panel */}
            <div className="auth-login-column">
              <div className="auth-login-card">
                <div className="auth-card-header">
                  <h2 className="auth-card-title">{isLogin ? 'Sign in' : 'Create account'}</h2>
                  <p className="auth-card-subtitle">
                    {isLogin ? 'Sign in to GrantWell.' : 'Create a new account to get started.'}
                  </p>
                </div>
                <div className="auth-card-content">
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
            </div>
          </div>

          {/* Row 2: Feature Cards */}
          <section className="auth-features-row" aria-labelledby="features-heading">
            <h2 id="features-heading" className="sr-only">Key Features</h2>
            <div className="auth-features-grid">
              <div className="auth-feature-item">
                <div className="auth-feature-card">
                  <div className="auth-feature-icon">
                    <DiscoverIcon />
                  </div>
                </div>
                <h3 className="auth-feature-title">Discover</h3>
                <p className="auth-feature-description">
                  Search for relevant state and federal funding opportunities aligned with 
                  your community's needs.
                </p>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-card">
                  <div className="auth-feature-icon">
                    <UnderstandIcon />
                  </div>
                </div>
                <h3 className="auth-feature-title">Understand</h3>
                <p className="auth-feature-description">
                  Extract key grant information and use chat to ask questions about 
                  eligibility and requirements.
                </p>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-card">
                  <div className="auth-feature-icon">
                    <DraftIcon />
                  </div>
                </div>
                <h3 className="auth-feature-title">Draft</h3>
                <p className="auth-feature-description">
                  Get step-by-step guidance to help draft your grant applications 
                  with AI-powered assistance.
                </p>
              </div>
            </div>
          </section>

          {/* Row 3: AI Transparency & Trust Section */}
          <section className="auth-trust-row" aria-labelledby="trust-heading">
            <div className="auth-trust-panel">
              <div className="auth-trust-icon">
                <AIIcon />
              </div>
              <div className="auth-trust-content">
                <h2 id="trust-heading" className="auth-trust-title">Free and AI-Powered</h2>
                <ul className="auth-trust-list">
                  <li>GrantWell uses AI as a support tool, not a decision-maker.</li>
                  <li>AI responses are grounded in official Notice of Funding Opportunity (NOFO) documents.</li>
                  <li>The system is designed not to invent requirements or facts.</li>
                  <li>All drafts require human review before submission.</li>
                  <li>Users retain full control and professional judgment.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Footer: Attribution */}
          <footer className="auth-footer" aria-label="Attribution and contact information">
            <p className="auth-footer-text">
              Brought to you by the Federal Funds and Infrastructure Office of the Commonwealth of Massachusetts.
            </p>
            <p className="auth-footer-text">
              Developed by{' '}
              <a 
                href="https://burnes.northeastern.edu/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="auth-footer-link"
              >
                AI for Impact
              </a>{' '}
              at the Burnes Center, Northeastern University.
            </p>
            <p className="auth-footer-text">
              Questions? Contact{' '}
              <a href="mailto:FedFundsInfra@mass.gov" className="auth-footer-link">
                FedFundsInfra@mass.gov
              </a>
            </p>
          </footer>

        </div>
      </main>
    </>
  );
}

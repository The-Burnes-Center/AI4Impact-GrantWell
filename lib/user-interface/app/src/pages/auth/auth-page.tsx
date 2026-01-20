import { useState } from 'react';
import LoginForm from '../../components/auth/login-form';
import SignUpForm from '../../components/auth/signup-form';
import '../../styles/auth-page.css';

// Feature icons as SVG components - white icons for blue background
const DiscoverIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2"/>
    <path d="M16 16L20 20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const UnderstandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M7 8H17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M7 12H14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M7 16H11" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const DraftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M7 8H8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M11 8H17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M7 12H8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M11 12H17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M7 16H8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M11 16H15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
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
              <div className="auth-feature-card">
                <img 
                  src="/images/Discover.png" 
                  alt="" 
                  className="auth-feature-icon-image"
                  aria-hidden="true"
                />
                <h3 className="auth-feature-title">Discover</h3>
                <p className="auth-feature-description">
                  Search for relevant state and federal funding opportunities aligned with 
                  your community's needs.
                </p>
              </div>

              <div className="auth-feature-card">
                <div className="auth-feature-icon-wrapper">
                  <UnderstandIcon />
                </div>
                <h3 className="auth-feature-title">Understand</h3>
                <p className="auth-feature-description">
                  Extract key grant information and use chat to ask questions about 
                  eligibility and requirements.
                </p>
              </div>

              <div className="auth-feature-card">
                <div className="auth-feature-icon-wrapper">
                  <DraftIcon />
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
              <div className="auth-trust-content">
                <h2 id="trust-heading" className="auth-trust-title">Free and AI-Powered</h2>
                <p className="auth-trust-description">
                  GrantWell uses AI as a support tool, not a decision-maker. AI responses are grounded 
                  in official Notice of Funding Opportunity (NOFO) documents. The system is designed not 
                  to invent requirements or facts. All drafts require human review before submission. 
                  Users retain full control and professional judgment.
                </p>
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

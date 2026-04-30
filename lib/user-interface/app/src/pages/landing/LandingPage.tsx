import { useNavigate } from "react-router-dom";
import "../../styles/marketing-landing.css";
import {
  FeatureFind,
  FeatureSummarize,
  FeatureWrite,
} from "./featureIllustrations";
import {
  LandingFooter,
  LandingNavbar,
  OmniHeader,
} from "./chrome";

const ArrowRight = ({ className = "mk-btn__arrow" }: { className?: string }) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 19.575 15.1425"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="translate(2.21625 -2.21625) rotate(-90 7.57125 9.7875)">
      <path
        d="M6.93 18.9375L7.5675 19.575L8.205 18.9375L14.505 12.6375L15.1425 12L13.8712 10.7288L13.2337 11.3663L8.47125 16.1288V0H6.67125V16.1288L1.90875 11.3663L1.27125 10.7288L0 12L0.6375 12.6375L6.9375 18.9375H6.93Z"
        fill="currentColor"
      />
    </g>
  </svg>
);

export default function LandingPage() {
  const navigate = useNavigate();
  const goToLogin = () => navigate("/login");
  const scrollToFeatures = () => {
    document
      .getElementById("features")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="marketing">
      <OmniHeader />

      <main id="main-content">
      <section className="marketing__hero" aria-labelledby="hero-title">
        <div className="marketing__hero-bg" aria-hidden="true" />
        <LandingNavbar />
        <div className="marketing__hero-row">
          <div className="marketing__hero-content">
            <h1 className="marketing__hero-title" id="hero-title">
              <img
                className="marketing__hero-wordmark"
                src="/images/marketing/grantwell-wordmark-dark.svg"
                alt="GrantWell"
              />
            </h1>
            <p className="marketing__hero-tagline">
              A free AI tool for municipalities and community organizations
              that want to go after federal grants without eating up weeks of
              staff time.
            </p>
            <div className="marketing__hero-actions">
              <button
                type="button"
                className="mk-btn mk-btn--primary"
                onClick={goToLogin}
              >
                <span>Get Started</span>
                <ArrowRight className="mk-btn__arrow mk-btn__arrow--lg" />
              </button>
              <button
                type="button"
                className="mk-btn mk-btn--outline"
                onClick={scrollToFeatures}
              >
                <span>Learn More</span>
                <ArrowRight className="mk-btn__arrow mk-btn__arrow--lg" />
              </button>
            </div>
          </div>
          <div className="marketing__hero-spacer" aria-hidden="true" />
        </div>
      </section>

      <section id="features" className="marketing__features">
        <article className="marketing__feature">
          <FeatureFind />
          <div className="marketing__feature-text">
            <h2 className="marketing__feature-title">Find the right grants</h2>
            <p className="marketing__feature-body">
              Search for relevant state and federal funding opportunities
              aligned with your community needs.
            </p>
          </div>
        </article>
        <article className="marketing__feature">
          <FeatureSummarize />
          <div className="marketing__feature-text">
            <h2 className="marketing__feature-title">
              Understand what's required
            </h2>
            <p className="marketing__feature-body">
              Extract key grant information and use chat to ask questions
              about eligibility and requirements.
            </p>
          </div>
        </article>
        <article className="marketing__feature">
          <FeatureWrite />
          <div className="marketing__feature-text">
            <h2 className="marketing__feature-title">Draft your application</h2>
            <p className="marketing__feature-body">
              Get step-by-step guidance to help draft your grant applications
              with AI-powered assistance.
            </p>
          </div>
        </article>
      </section>

      <section className="marketing__band" aria-labelledby="band-title">
        <div className="marketing__band-content">
          <h2 className="marketing__band-title" id="band-title">
            Free and AI-Powered
          </h2>
          <p className="marketing__band-body">
            GrantWell uses AI as a support tool, not a decision-maker. AI
            responses are grounded in official Notice of Funding Opportunity
            documents. The system is designed not to invent requirements or
            facts. All drafts require human review before submission. Users
            retain full control and professional judgment.
          </p>
          <button
            type="button"
            className="mk-btn mk-btn--light"
            onClick={goToLogin}
          >
            <span>Get Started</span>
            <ArrowRight className="mk-btn__arrow mk-btn__arrow--lg" />
          </button>
        </div>
        <div className="marketing__band-spacer" aria-hidden="true" />
      </section>
      </main>

      <LandingFooter />

      <OmniHeader position="bottom" />
    </div>
  );
}

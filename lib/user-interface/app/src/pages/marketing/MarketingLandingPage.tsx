import "../../styles/marketing-landing.css";

interface MarketingLandingPageProps {
  onGetStarted: () => void;
}

const ArrowRight = () => (
  <svg
    className="mk-btn__arrow"
    aria-hidden="true"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M1 7h12m0 0L7.5 1.5M13 7l-5.5 5.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ArrowUpRight = () => (
  <svg
    className="mk-btn__arrow"
    aria-hidden="true"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3.5 10.5L10.5 3.5M10.5 3.5H4.5M10.5 3.5V9.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function MarketingLandingPage({
  onGetStarted,
}: MarketingLandingPageProps) {
  const scrollToFeatures = () => {
    document
      .getElementById("features")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="marketing">
      <div className="marketing__omni">
        <div className="marketing__omni-left">
          <span>An official website of the Commonwealth of Massachusetts</span>
        </div>
        <div className="marketing__omni-right">
          <a href="https://www.mass.gov" target="_blank" rel="noreferrer">
            Mass.gov
          </a>
        </div>
      </div>

      <section className="marketing__hero" aria-labelledby="hero-title">
        <div className="marketing__hero-bg" aria-hidden="true" />
        <div className="marketing__hero-overlay" aria-hidden="true" />
        <div className="marketing__hero-inner">
          <img
            className="marketing__hero-wordmark"
            src="/images/marketing/grantwell-wordmark-dark.png"
            alt="GrantWell"
            id="hero-title"
          />
          <p className="marketing__hero-tagline">
            AI-powered grant discovery and writing for Massachusetts
            municipalities and community organizations.
          </p>
          <div className="marketing__hero-actions">
            <button
              type="button"
              className="mk-btn mk-btn--primary"
              onClick={onGetStarted}
            >
              Get Started
              <ArrowRight />
            </button>
            <button
              type="button"
              className="mk-btn mk-btn--ghost"
              onClick={scrollToFeatures}
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="marketing__features"
        aria-labelledby="features-title"
      >
        <div className="marketing__features-inner">
          <p className="marketing__features-eyebrow">What GrantWell does</p>
          <h2 className="marketing__features-title" id="features-title">
            Find, summarize, and write grant applications — faster.
          </h2>
          <div className="marketing__features-grid">
            <article className="marketing__feature">
              <img
                className="marketing__feature-img"
                src="/images/marketing/feature-find.png"
                alt=""
              />
              <h3 className="marketing__feature-title">Find</h3>
              <p className="marketing__feature-body">
                Browse and search a curated library of federal and state grant
                opportunities relevant to your community.
              </p>
            </article>
            <article className="marketing__feature">
              <img
                className="marketing__feature-img"
                src="/images/marketing/feature-summarize.png"
                alt=""
              />
              <h3 className="marketing__feature-title">Summarize</h3>
              <p className="marketing__feature-body">
                Get plain-language summaries of complex Notices of Funding
                Opportunity, with eligibility and deadlines surfaced upfront.
              </p>
            </article>
            <article className="marketing__feature">
              <img
                className="marketing__feature-img"
                src="/images/marketing/feature-write.png"
                alt=""
              />
              <h3 className="marketing__feature-title">Write</h3>
              <p className="marketing__feature-body">
                Draft narrative sections with an AI assistant trained on the
                requirements of the grant you're applying to.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="marketing__band" aria-labelledby="band-title">
        <div className="marketing__band-inner">
          <h2 className="marketing__band-title" id="band-title">
            Free and AI-powered for the Commonwealth.
          </h2>
          <p className="marketing__band-body">
            GrantWell is a public-interest project built with the
            Massachusetts Digital Service. Use it as much as you'd like —
            no sign-up fees, no usage caps.
          </p>
          <button
            type="button"
            className="mk-btn mk-btn--light"
            onClick={onGetStarted}
          >
            Get Started
            <ArrowUpRight />
          </button>
        </div>
      </section>

      <footer className="marketing__footer">
        <div className="marketing__footer-inner">
          <div className="marketing__footer-top">
            <div className="marketing__footer-brand">
              <img
                className="marketing__footer-wordmark"
                src="/images/marketing/grantwell-wordmark-light.png"
                alt="GrantWell"
              />
              <p className="marketing__footer-tagline">
                A collaboration between the Commonwealth of Massachusetts and
                academic, civic, and research partners.
              </p>
            </div>
            <div
              className="marketing__partners"
              aria-label="Partner organizations"
            >
              <img
                className="marketing__partner"
                src="/images/marketing/partner-burnes.png"
                alt="Burnes Center"
              />
              <img
                className="marketing__partner"
                src="/images/marketing/partner-innovateus.png"
                alt="InnovateUS"
              />
              <img
                className="marketing__partner"
                src="/images/marketing/partner-reboot.png"
                alt="Reboot Democracy"
              />
              <img
                className="marketing__partner"
                src="/images/marketing/partner-govlab.png"
                alt="The GovLab"
              />
            </div>
          </div>
          <div className="marketing__footer-bottom">
            <span>© {new Date().getFullYear()} GrantWell</span>
            <span className="marketing__heart">
              Made with
              <img src="/images/marketing/heart.png" alt="love" />
              in Massachusetts
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

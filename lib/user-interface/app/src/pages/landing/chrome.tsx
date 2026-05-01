import { NavLink, useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";
import { AiForImpactWordmark } from "./featureIllustrations";
import { useAdminCheck } from "../../hooks/use-admin-check";

const ArrowUpRight = ({ className }: { className?: string }) => (
  <svg
    className={className}
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

export function OmniHeader({ position = "top" }: { position?: "top" | "bottom" }) {
  return (
    <aside
      className="marketing__omni"
      aria-label={
        position === "top"
          ? "Partner organizations (top)"
          : "Partner organizations (bottom)"
      }
    >
      <span className="marketing__omni-label">This is a tool by:</span>
      <a
        className="marketing__omni-link"
        href="https://burnes.northeastern.edu"
        target="_blank"
        rel="noreferrer"
      >
        <ArrowUpRight className="marketing__omni-arrow" />
        <span>The Burnes Center for Social Change</span>
      </a>
      <a
        className="marketing__omni-link"
        href="https://www.rebootdemocracy.ai"
        target="_blank"
        rel="noreferrer"
      >
        <ArrowUpRight className="marketing__omni-arrow" />
        <span>Reboot Democracy</span>
      </a>
      <a
        className="marketing__omni-link"
        href="https://ai4impact.ai/"
        target="_blank"
        rel="noreferrer"
      >
        <ArrowUpRight className="marketing__omni-arrow" />
        <span>AI for Impact</span>
      </a>
      <a
        className="marketing__omni-link"
        href="https://thegovlab.org"
        target="_blank"
        rel="noreferrer"
      >
        <ArrowUpRight className="marketing__omni-arrow" />
        <span>The Gov Lab</span>
      </a>
      <a
        className="marketing__omni-link"
        href="https://communitycentered.ai/"
        target="_blank"
        rel="noreferrer"
      >
        <ArrowUpRight className="marketing__omni-arrow" />
        <span>Community-Centered AI</span>
      </a>
    </aside>
  );
}

export function LandingNavbar() {
  return (
    <nav className="marketing__nav" aria-label="Primary">
      <div className="marketing__nav-links">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            "marketing__nav-link" +
            (isActive ? " marketing__nav-link--active" : "")
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/login"
          className={({ isActive }) =>
            "marketing__nav-link" +
            (isActive ? " marketing__nav-link--active" : "")
          }
        >
          Login
        </NavLink>
      </div>
    </nav>
  );
}

const SignOutIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="14"
    viewBox="0 0 20 16"
    fill="currentColor"
  >
    <path d="M6.67 5.6V2.4L13.33 8l-6.66 5.6v-3.2H0V5.6zM8.33 0v1.6h10v12.8h-10V16H20V0z" />
  </svg>
);

export function AppNavbar() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminCheck();

  const handleSignOut = async () => {
    try {
      await Auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      navigate("/");
    }
  };

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate("/home");
  };

  const handleSkipNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.focus();
      mainContent.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    "marketing__nav-link" + (isActive ? " marketing__nav-link--active" : "");

  return (
    <nav className="marketing__nav marketing__nav--app" aria-label="Primary">
      <a
        href="#main-content"
        onClick={handleSkipNavClick}
        className="marketing__skip-nav"
      >
        skip to main content
      </a>
      <a
        href="/home"
        onClick={handleLogoClick}
        className="marketing__nav-brand"
        title="GrantWell home"
      >
        <img
          src="/images/marketing/grantwell-wordmark-dark.svg"
          alt="GrantWell"
          className="marketing__nav-wordmark"
        />
      </a>
      <div className="marketing__nav-links">
        <NavLink to="/home" className={navLinkClass}>
          Home
        </NavLink>
        <NavLink to="/document-editor/drafts" className={navLinkClass}>
          Drafts
        </NavLink>
        <NavLink to="/chat/sessions" className={navLinkClass}>
          Chat Sessions
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin/dashboard" className={navLinkClass}>
            Admin
          </NavLink>
        )}
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="marketing__nav-signout"
      >
        <SignOutIcon className="marketing__nav-signout-icon" />
        <span>Sign out</span>
      </button>
    </nav>
  );
}

export function LandingFooter() {
  return (
    <footer className="marketing__footer">
      <div className="marketing__footer-brand">
        <img
          className="marketing__footer-wordmark"
          src="/images/marketing/grantwell-wordmark-footer.svg"
          alt="GrantWell"
        />
        <div className="marketing__footer-madeby">
          <div className="marketing__footer-madeby-line">
            <span>Made with</span>
            <img
              className="marketing__footer-heart"
              src="/images/marketing/footer-heart.svg"
              alt="love"
            />
            <span>by</span>
          </div>
          <a
            className="marketing__footer-ai4impact"
            href="https://ai4impact.ai/"
            target="_blank"
            rel="noreferrer"
            aria-label="AI for Impact"
          >
            <AiForImpactWordmark />
          </a>
        </div>
      </div>
      <div className="marketing__footer-partners">
        <p className="marketing__footer-partners-label">
          This is a partner project of:
        </p>
        <div
          className="marketing__footer-partners-grid"
          aria-label="Partner organizations"
        >
          <img
            className="marketing__partner marketing__partner--innovateus"
            src="/images/marketing/footer-innovateus.svg"
            alt="InnovateUS"
          />
          <img
            className="marketing__partner marketing__partner--burnes"
            src="/images/marketing/footer-burnes.png"
            alt="Burnes Center for Social Change, Northeastern University"
          />
          <img
            className="marketing__partner marketing__partner--reboot"
            src="/images/marketing/footer-reboot.svg"
            alt="Reboot Democracy"
          />
          <img
            className="marketing__partner marketing__partner--govlab"
            src="/images/marketing/footer-govlab.png"
            alt="The GovLab"
          />
        </div>
      </div>
    </footer>
  );
}

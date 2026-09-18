import { NavLink, useNavigate } from "react-router";
import { signOut } from "aws-amplify/auth";
import { LuMenu } from "react-icons/lu";
import { AiForImpactWordmark } from "./featureIllustrations";
import { useBranding } from "../../common/branding";
import { useNavigationMenuButton } from "../../components/navigation/navigation-context";
import { SIDEBAR_ID } from "../../components/navigation/UnifiedNavigation";

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
  const { omniPartners } = useBranding();

  if (omniPartners.length === 0) return null;

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
      {omniPartners.map((partner) => (
        <a
          key={partner.href}
          className="marketing__omni-link"
          href={partner.href}
          target="_blank"
          rel="noreferrer noopener"
        >
          <ArrowUpRight className="marketing__omni-arrow" />
          <span>{partner.label}</span>
          <span className="visually-hidden"> (opens in new tab)</span>
        </a>
      ))}
    </aside>
  );
}

export function LandingNavbar() {
  const handleSkipNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.focus();
      mainContent.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="marketing__nav" aria-label="Primary">
      <a
        href="#main-content"
        onClick={handleSkipNavClick}
        className="marketing__skip-nav"
      >
        Skip to main content
      </a>
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
  const branding = useBranding();
  const { showMenuButton, isDrawerOpen, toggleDrawer } =
    useNavigationMenuButton();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      navigate("/");
    }
  };

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      return;
    }
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
    <nav className="marketing__nav marketing__nav--app" aria-label="Account">
      <a
        href="#main-content"
        onClick={handleSkipNavClick}
        className="marketing__skip-nav"
      >
        Skip to main content
      </a>
      <div className="marketing__nav-lead">
        {showMenuButton && (
          <button
            type="button"
            className="marketing__nav-menu"
            onClick={toggleDrawer}
            aria-label={isDrawerOpen ? "Close main menu" : "Open main menu"}
            aria-expanded={isDrawerOpen}
            aria-controls={SIDEBAR_ID}
          >
            <LuMenu size={22} aria-hidden="true" />
          </button>
        )}
        <a
          href="/home"
          onClick={handleLogoClick}
          className="marketing__nav-brand"
        >
          <img
            src={branding.logo}
            alt={branding.appName}
            className="marketing__nav-wordmark"
          />
        </a>
      </div>
      <div className="marketing__nav-account">
        <NavLink to="/profile" className={navLinkClass}>
          Profile
        </NavLink>
        <button
          type="button"
          onClick={handleSignOut}
          className="marketing__nav-signout"
        >
          <SignOutIcon className="marketing__nav-signout-icon" />
          <span>Sign out</span>
        </button>
      </div>
    </nav>
  );
}

export function LandingFooter() {
  const { footer, logo } = useBranding();
  const { madeBy, partners } = footer;

  return (
    <footer className="marketing__footer">
      <div className="marketing__footer-brand">
        <img
          className="marketing__footer-wordmark"
          src={footer.wordmark ?? logo}
          alt=""
        />
        {madeBy && (
          <div className="marketing__footer-madeby">
            <div className="marketing__footer-madeby-line">
              <span>Made with</span>
              {madeBy.logo && (
                <img
                  className="marketing__footer-heart"
                  src={madeBy.logo}
                  alt=""
                />
              )}
              <span>by</span>
            </div>
            <a
              className="marketing__footer-ai4impact"
              href={madeBy.href}
              target="_blank"
              rel="noreferrer"
              aria-label="AI for Impact"
            >
              <AiForImpactWordmark />
            </a>
          </div>
        )}
      </div>
      {partners.length > 0 && (
        <div className="marketing__footer-partners">
          <p className="marketing__footer-partners-label">
            This is a partner project of:
          </p>
          <div
            className="marketing__footer-partners-grid"
            role="group"
            aria-label="Partner organizations"
          >
            {partners.map((p) => (
              <a
                key={p.href}
                className="marketing__partner-link"
                href={p.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                <img
                  className={`marketing__partner ${p.className ?? ""}`.trim()}
                  src={p.logo}
                  alt={p.label}
                />
                <span className="visually-hidden"> (opens in new tab)</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
}

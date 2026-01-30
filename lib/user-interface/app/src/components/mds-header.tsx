import { useEffect, useRef } from "react";
import { HeaderSlim, SiteLogo } from "@massds/mayflower-react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";

interface MDSHeaderProps {
  showSignOut?: boolean;
}

export default function MDSHeader({ showSignOut = true }: MDSHeaderProps) {
  const navigate = useNavigate();
  const logoRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    try {
      await Auth.signOut();
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
      // Navigate even if signOut fails
      navigate("/");
    }
  };

  const handleSkipNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      // Focus first to ensure keyboard focus moves
      mainContent.focus();
      // Then scroll smoothly
      mainContent.scrollIntoView({ behavior: "smooth", block: "start" });
      // Ensure focus is maintained after scroll
      setTimeout(() => {
        mainContent.focus();
      }, 100);
    }
  };

  // Intercept logo link clicks for React Router navigation
  useEffect(() => {
    const logoLink = logoRef.current?.querySelector("a");
    if (logoLink) {
      const handleLogoClick = (e: MouseEvent) => {
        e.preventDefault();
        navigate("/");
      };
      logoLink.addEventListener("click", handleLogoClick);
      return () => {
        logoLink.removeEventListener("click", handleLogoClick);
      };
    }
  }, [navigate]);

  return (
    <div
      style={{
        position: "static",
        width: "100%",
        margin: 0,
        padding: 0,
        marginBottom: 0,
      }}
    >
      <HeaderSlim
        skipNav={
          <a
            className="ma__header__skip-nav"
            href="#main-content"
            style={{
              position: "absolute",
              left: "-9999px",
              top: "10px",
              zIndex: 9999,
              padding: "10px 20px",
              backgroundColor: "#14558F",
              color: "white",
              textDecoration: "none",
              borderRadius: "4px",
              fontWeight: "600",
            }}
            onFocus={(e) => {
              e.currentTarget.style.left = "10px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.left = "-9999px";
            }}
            onClick={handleSkipNavClick}
          >
            skip to main content
          </a>
        }
        siteLogo={
          <div ref={logoRef}>
            <SiteLogo
              url={{ domain: "/" }}
              image={{
                src: "https://unpkg.com/@massds/mayflower-assets@14.1.0/static/images/logo/stateseal.png",
                alt: "GrantWell homepage",
                width: 45,
                height: 45,
              }}
              siteName="GrantWell"
              title="GrantWell homepage"
            />
          </div>
        }
        utilityNav={
          showSignOut ? (
            <a
              className="ma__header_slim__utility-link"
              href="#main-content"
              onClick={(e) => {
                e.preventDefault();
                handleSignOut();
              }}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "'Noto Sans', sans-serif",
                fontSize: "16px",
                fontWeight: "500",
                letterSpacing: "0.01em",
                textDecoration: "none",
                color: "#ffffff",
                padding: "8px 12px",
                borderRadius: "4px",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(255, 255, 255, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 20 16"
                fill="#fff"
                style={{
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                <path d="M6.67 5.6V2.4L13.33 8l-6.66 5.6v-3.2H0V5.6zM8.33 0v1.6h10v12.8h-10V16H20V0z"></path>
              </svg>
              <span>Sign out</span>
            </a>
          ) : undefined
        }
      />
    </div>
  );
}

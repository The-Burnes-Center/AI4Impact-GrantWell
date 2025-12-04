import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";

export default function MDSHeader() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await Auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Add the CSS link for header-slim styles
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/@massds/mayflower-assets@14.1.0/css/header-slim.css";
    
    // Check if link already exists
    const existingLink = document.querySelector(`link[href="${link.href}"]`);
    if (!existingLink) {
      document.head.appendChild(link);
    }

    return () => {
      // Cleanup: remove link when component unmounts (optional)
      // Note: We might want to keep it if other components use it
    };
  }, []);

  return (
    <div 
      className="ma__header_slim"
      style={{
        position: "static",
        width: "100%",
        margin: 0,
        padding: 0,
        marginBottom: 0,
      }}
    >
      <a 
        className="ma__header__skip-nav" 
        href="#main-content"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "10px",
          zIndex: 9999,
          padding: "10px 20px",
          backgroundColor: "#0073bb",
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
        onClick={(e) => {
          e.preventDefault();
          const mainContent = document.getElementById("main-content");
          if (mainContent) {
            mainContent.scrollIntoView({ behavior: "smooth", block: "start" });
            mainContent.focus();
          }
        }}
      >
        skip to main content
      </a>

      <div className="ma__header_slim__utility">
        <div className="ma__header_slim__utility-container ma__container">
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
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
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
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
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
              <path
                d="M6.67 5.6V2.4L13.33 8l-6.66 5.6v-3.2H0V5.6zM8.33 0v1.6h10v12.8h-10V16H20V0z"
              ></path>
            </svg>
            <span>Sign out</span>
          </a>
        </div>
      </div>

      <header className="ma__header_slim__header" id="header">
        <div className="ma__header_slim__header-container ma__container">
          <div className="ma__header_slim__logo">
            <div className="ma__site-logo">
              <a 
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/");
                }}
                style={{ cursor: "pointer" }}
              >
                <img
                  className="ma__image"
                  src="https://unpkg.com/@massds/mayflower-assets@14.1.0/static/images/logo/stateseal.png"
                  width="45"
                  height="45"
                  alt="GrantWell homepage"
                />
                <span aria-hidden="true">GrantWell</span>
              </a>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}


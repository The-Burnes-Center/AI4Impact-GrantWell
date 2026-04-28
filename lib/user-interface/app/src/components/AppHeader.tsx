import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";

export default function AppHeader() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await Auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      navigate("/");
    }
  };

  const handleSkipNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.focus();
      mainContent.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <header
      style={{
        position: "static",
        width: "100%",
        margin: 0,
        padding: "12px 24px",
        backgroundColor: "#244140",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "'Public Sans', 'Inter', system-ui, sans-serif",
      }}
    >
      <a
        href="#main-content"
        onClick={handleSkipNavClick}
        onFocus={(e) => {
          e.currentTarget.style.left = "10px";
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = "-9999px";
        }}
        style={{
          position: "absolute",
          left: "-9999px",
          top: "10px",
          zIndex: 9999,
          padding: "10px 20px",
          backgroundColor: "#244140",
          color: "white",
          textDecoration: "none",
          borderRadius: "4px",
          fontWeight: 600,
        }}
      >
        skip to main content
      </a>
      <a
        href="/"
        onClick={handleLogoClick}
        title="GrantWell homepage"
        style={{
          color: "#ffffff",
          textDecoration: "none",
          fontSize: "20px",
          fontWeight: 700,
          letterSpacing: "0.01em",
          fontFamily: "'PT Serif', Georgia, serif",
        }}
      >
        GrantWell
      </a>
      <a
        href="#signout"
        onClick={(e) => {
          e.preventDefault();
          handleSignOut();
        }}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "15px",
          fontWeight: 500,
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
          style={{ flexShrink: 0, marginTop: "1px" }}
        >
          <path d="M6.67 5.6V2.4L13.33 8l-6.66 5.6v-3.2H0V5.6zM8.33 0v1.6h10v12.8h-10V16H20V0z"></path>
        </svg>
        <span>Sign out</span>
      </a>
    </header>
  );
}

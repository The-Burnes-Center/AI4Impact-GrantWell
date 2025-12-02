import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { MessageSquare, Edit, Home, ChevronLeft, ChevronRight } from "lucide-react";

// Function to get brand banner + header height dynamically
const getTopOffset = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  const headerElement = document.querySelector(".awsui-context-top-navigation");
  
  let bannerHeight = 40; // Default fallback
  let headerHeight = 56; // Default fallback
  
  if (bannerElement) {
    bannerHeight = bannerElement.getBoundingClientRect().height;
  }
  
  if (headerElement) {
    headerHeight = headerElement.getBoundingClientRect().height;
  }
  
  return bannerHeight + headerHeight;
};

interface NavigationProps {
  documentIdentifier?: string;
  onCollapseChange?: (isCollapsed: boolean) => void;
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    backgroundColor: "#0f1b2a",
    color: "white",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.3s ease, top 0.3s ease, height 0.3s ease",
    overflow: "hidden",
    borderRight: "1px solid #1f3b5a",
    position: "fixed",
    zIndex: 100,
    left: 0,
  },
  sidebarHeader: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid #1f3b5a",
  },
  navContainer: {
    flex: 1,
    padding: "16px 8px",
    overflowY: "auto",
  },
  sectionHeader: {
    padding: "8px 12px",
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    color: "#e2e8f0",
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  navButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    padding: "12px",
    marginBottom: "4px",
    background: "transparent",
    color: "#e2e8f0",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
    textAlign: "left",
    textDecoration: "none",
  },
  navButtonActive: {
    background: "#0073bb",
    color: "white",
  },
  navLinkText: {
    marginLeft: "12px",
  },
  recentlyViewedSection: {
    marginTop: "20px",
  },
};

export default function RequirementsNavigation({
  documentIdentifier,
  onCollapseChange,
}: NavigationProps) {
  const [recentlyViewedNOFOs, setRecentlyViewedNOFOs] = useState<any[]>([]);
  const [topOffset, setTopOffset] = useState<number>(96); // Default: 40px banner + 56px header
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Notify parent component when collapse state changes
  useEffect(() => {
    if (onCollapseChange) {
      onCollapseChange(isCollapsed);
    }
  }, [isCollapsed, onCollapseChange]);

  // Load recently viewed NOFOs from localStorage
  useEffect(() => {
    const storedHistory =
      JSON.parse(localStorage.getItem("recentlyViewedNOFOs")) || [];
    setRecentlyViewedNOFOs(storedHistory);
  }, []);

  // Monitor brand banner + header height changes
  useEffect(() => {
    const updateTopOffset = () => {
      const offset = getTopOffset();
      setTopOffset(offset);
    };

    // Initial calculation
    updateTopOffset();

    // Watch for changes
    const observer = new MutationObserver(updateTopOffset);
    const bannerElement = document.querySelector(".ma__brand-banner");
    
    if (bannerElement) {
      observer.observe(bannerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    // Also observe header changes
    const headerElement = document.querySelector(".awsui-context-top-navigation");
    if (headerElement) {
      observer.observe(headerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    window.addEventListener("resize", updateTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTopOffset);
    };
  }, []);

  // Handle chat navigation
  const handleChatNavigation = () => {
    const newSessionId = uuidv4();
    const queryParams = documentIdentifier
      ? `?folder=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/chatbot/playground/${newSessionId}${queryParams}`);
  };

  // Determine active tab based on the current URL
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes("/playground")) return "chat";
    if (path.includes("/document-editor")) return "editor";
    if (path.includes("/checklists")) return "requirements";
    return "";
  };

  const activeTab = getActiveTab();

  return (
    <div
      style={{
        ...styles.sidebar,
        top: `${topOffset}px`,
        height: `calc(100vh - ${topOffset}px)`,
        width: isCollapsed ? "60px" : "240px",
      }}
    >
      {/* Sidebar header */}
      <div
        style={{
          ...styles.sidebarHeader,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {!isCollapsed && (
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>Navigation</div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!isCollapsed}
          style={{
            background: "none",
            border: "none",
            color: "white",
            cursor: "pointer",
            opacity: 0.8,
            transition: "opacity 0.2s",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "32px",
            minHeight: "32px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
        >
          {isCollapsed ? (
            <ChevronRight size={20} />
          ) : (
            <ChevronLeft size={20} />
          )}
        </button>
      </div>

      {/* Navigation links */}
      <div style={styles.navContainer}>
        <div>
          {!isCollapsed && (
            <div style={styles.sectionHeader}>
              <span>Menu</span>
            </div>
          )}

          {/* Home Button */}
          <button
            onClick={() => navigate("/landing-page/basePage")}
            style={{
              ...styles.navButton,
              ...(location.pathname === "/landing-page/basePage" ? styles.navButtonActive : {}),
            }}
            aria-label="Home"
            title="Home"
          >
            <Home size={20} />
            {!isCollapsed && <span style={styles.navLinkText}>Home</span>}
          </button>

          <button
            onClick={handleChatNavigation}
            style={{
              ...styles.navButton,
              ...(activeTab === "chat" ? styles.navButtonActive : {}),
            }}
            aria-label="Chat with AI"
            title="Chat with AI"
          >
            <MessageSquare size={20} />
            {!isCollapsed && <span style={styles.navLinkText}>Chat with AI</span>}
          </button>

          <button
            onClick={() =>
              navigate(
                `/document-editor${
                  documentIdentifier
                    ? `?nofo=${encodeURIComponent(documentIdentifier)}`
                    : ""
                }`
              )
            }
            style={{
              ...styles.navButton,
              ...(activeTab === "editor" ? styles.navButtonActive : {}),
            }}
            aria-label="Write Application"
            title="Write Application"
          >
            <Edit size={20} />
            {!isCollapsed && <span style={styles.navLinkText}>Write Application</span>}
          </button>
        </div>

        {/* Recently Viewed NOFOs Section */}
        {recentlyViewedNOFOs.length > 0 && !isCollapsed && (
          <div style={styles.recentlyViewedSection}>
            <div style={styles.sectionHeader}>
              <span>Recent Grants</span>
            </div>
            {recentlyViewedNOFOs.slice(0, 3).map((nofo, index) => (
              <button
                key={index}
                onClick={() =>
                  navigate(
                    `/landing-page/basePage/checklists/${encodeURIComponent(
                      nofo.value
                    )}`
                  )
                }
                style={styles.navButton}
              >
                <span style={styles.navLinkText}>{nofo.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

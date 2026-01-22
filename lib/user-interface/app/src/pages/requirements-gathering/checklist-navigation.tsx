import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { MessageSquare, Edit, Home, ChevronLeft, ChevronRight } from "lucide-react";

const useViewportWidth = () => {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
};

// Function to get brand banner + MDS header height dynamically
const getTopOffset = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  const mdsHeaderElement = document.querySelector(".ma__header_slim");
  
  let bannerHeight = 0;
  let mdsHeaderHeight = 0;
  
  if (bannerElement) {
    const rect = bannerElement.getBoundingClientRect();
    bannerHeight = rect.height || 0;
  }
  
  if (mdsHeaderElement) {
    const rect = mdsHeaderElement.getBoundingClientRect();
    mdsHeaderHeight = rect.height || 0;
  }
  
  return bannerHeight + mdsHeaderHeight;
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
    transition: "width 0.3s ease",
    overflow: "hidden",
    borderRight: "1px solid #1f3b5a",
    position: "static",
    flexShrink: 0,
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
    fontSize: "14px",
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
    background: "#14558F",
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
  const [topOffset, setTopOffset] = useState<number>(0);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const viewportWidth = useViewportWidth();
  const isNarrowViewport = viewportWidth <= 320;
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

  // Monitor brand banner + MDS header height changes dynamically
  useEffect(() => {
    const updateTopOffset = () => {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        const offset = getTopOffset();
        setTopOffset(offset);
      });
    };

    // Initial calculation with a small delay to ensure headers are rendered
    const initialTimer = setTimeout(updateTopOffset, 100);
    updateTopOffset();

    // Watch for changes
    const observer = new MutationObserver(() => {
      updateTopOffset();
    });
    
    const bannerElement = document.querySelector(".ma__brand-banner");
    const mdsHeaderElement = document.querySelector(".ma__header_slim");
    
    if (bannerElement) {
      observer.observe(bannerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    // Observe MDS header changes
    if (mdsHeaderElement) {
      observer.observe(mdsHeaderElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    window.addEventListener("resize", updateTopOffset);
    window.addEventListener("scroll", updateTopOffset, { passive: true });

    return () => {
      clearTimeout(initialTimer);
      observer.disconnect();
      window.removeEventListener("resize", updateTopOffset);
      window.removeEventListener("scroll", updateTopOffset);
    };
  }, []);

  // Handle chat navigation
  const handleChatNavigation = () => {
    const newSessionId = uuidv4();
    const queryParams = documentIdentifier
      ? `?folder=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/chat/${newSessionId}${queryParams}`);
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

  useEffect(() => {
    if (isNarrowViewport && !isCollapsed) {
      setIsCollapsed(true);
    }
  }, [isNarrowViewport]);

  return (
    <>
      {isNarrowViewport && isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            position: 'fixed',
            top: '8px',
            left: '8px',
            zIndex: 1001,
            background: '#0f1b2a',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          aria-label="Open navigation menu"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {isNarrowViewport && !isCollapsed && (
        <div
          onClick={() => setIsCollapsed(true)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
          aria-hidden="true"
        />
      )}

      <div
        style={{
          ...styles.sidebar,
          width: isNarrowViewport 
            ? (!isCollapsed ? "100%" : "0")
            : (isCollapsed ? "60px" : "240px"),
          height: "100%",
          alignSelf: "stretch",
          ...(isNarrowViewport && {
            position: !isCollapsed ? 'fixed' : 'relative',
            top: !isCollapsed ? 0 : 'auto',
            left: !isCollapsed ? 0 : 'auto',
            right: !isCollapsed ? 0 : 'auto',
            bottom: !isCollapsed ? 0 : 'auto',
            zIndex: !isCollapsed ? 1001 : 'auto',
            maxWidth: !isCollapsed ? '280px' : '0',
            transition: "width 0.3s ease, transform 0.3s ease",
          }),
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
            onClick={() => navigate("/home")}
            style={{
              ...styles.navButton,
              ...(location.pathname === "/home" || location.pathname === "/" ? styles.navButtonActive : {}),
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
                    `/requirements/${encodeURIComponent(
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
    </>
  );
}

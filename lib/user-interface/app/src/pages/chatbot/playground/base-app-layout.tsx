import React, { useState, useEffect } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  List,
  CheckSquare,
  Edit,
  Home,
} from "lucide-react";

// Function to get brand banner + MDS header height dynamically
// Note: Headers are now static, so this is only used for minHeight calculations
const getTopOffset = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  const mdsHeaderElement = document.querySelector(".ma__header_slim");

  let bannerHeight = 40; // Default fallback
  let mdsHeaderHeight = 60; // Default fallback (typical MDS header height)

  if (bannerElement) {
    bannerHeight = bannerElement.getBoundingClientRect().height;
  }

  if (mdsHeaderElement) {
    mdsHeaderHeight = mdsHeaderElement.getBoundingClientRect().height;
  }

  return bannerHeight + mdsHeaderHeight;
};

const useViewportWidth = () => {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
};

interface BaseAppLayoutProps {
  header: React.ReactNode;
  content: React.ReactNode;
  info?: React.ReactNode;
  toolsOpenExternal?: boolean;
  onToolsOpenChange?: (isOpen: boolean) => void;
  documentIdentifier?: string;
  toolsWidth?: number;
  sessionId?: string | null;
  modalOpen?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  mainContainer: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
  },
  contentArea: {
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
  toolsPanel: {
    height: "100%",
    overflow: "auto",
    borderLeft: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    minWidth: 0,
  },
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
  sidebarExpanded: {
    width: "240px",
  },
  sidebarCollapsed: {
    width: "72px",
  },
  sidebarHeader: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid #1f3b5a",
  },
  sidebarToggle: {
    background: "none",
    border: "none",
    color: "#ffffff",
    cursor: "pointer",
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
};

export default function BaseAppLayout({
  header,
  content,
  info,
  toolsOpenExternal = false,
  onToolsOpenChange,
  documentIdentifier,
  toolsWidth = 300,
  sessionId,
  modalOpen = false,
}: BaseAppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [topOffset, setTopOffset] = useState<number>(100); // Default: 40px banner + 60px MDS header
  const viewportWidth = useViewportWidth();
  const isNarrowViewport = viewportWidth <= 320;
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();

  // Monitor brand banner + MDS header height changes (for minHeight calculations only)
  useEffect(() => {
    const updateTopOffset = () => {
      requestAnimationFrame(() => {
        const offset = getTopOffset();
        setTopOffset(offset);
      });
    };

    // Initial calculation with a small delay to ensure headers are rendered
    const initialTimer = setTimeout(updateTopOffset, 100);
    updateTopOffset();

    // Watch for changes
    const observer = new MutationObserver(updateTopOffset);
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

  // Auto-collapse sidebar on narrow viewports for better UX
  useEffect(() => {
    if (isNarrowViewport && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isNarrowViewport]);

  // Use the sessionId from props, or fall back to URL params if not provided
  const currentSessionId = sessionId || params.sessionId;

  // Handle chat navigation with proper logic
  const handleChatNavigation = () => {
    if (currentSessionId) {
      // If we have a session ID, navigate to that session
      const queryParams = documentIdentifier
        ? `?folder=${encodeURIComponent(documentIdentifier)}`
        : "";
      navigate(`/chat/${currentSessionId}${queryParams}`);
    } else if (location.pathname.includes("/sessions")) {
      // If we're on the sessions page without a selected session,
      // generate a new session ID and navigate to it
      const newSessionId = uuidv4();
      const queryParams = documentIdentifier
        ? `?folder=${encodeURIComponent(documentIdentifier)}`
        : "";
      navigate(`/chat/${newSessionId}${queryParams}`);
    } else {
      // If we're anywhere else, just go to the current location
      navigate(location.pathname + location.search);
    }
  };

  // Determine active tab based on the current URL
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes("/sessions")) return "sessions";
    if (path.includes("/playground")) return "chat";
    if (path.includes("/document-editor")) return "editor";
    if (path.includes("/checklists")) return "requirements";
    if (path.includes("/documents")) return "documents";
    return "";
  };

  const activeTab = getActiveTab();

  return (
    <div
      style={{
        ...styles.container,
        height: `calc(100vh - ${topOffset}px)`,
        maxHeight: `calc(100vh - ${topOffset}px)`,
        width: "100%",
        margin: 0,
        padding: 0,
      }}
    >
      {/* Mobile menu button - only visible on narrow viewports */}
      {isNarrowViewport && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'fixed',
            top: `${topOffset + 8}px`,
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

      {/* Overlay backdrop for mobile sidebar */}
      {isNarrowViewport && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
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
          display: "flex",
          flex: 1,
          overflow: "hidden",
          alignItems: "stretch",
          flexDirection: isNarrowViewport ? "column" : "row",
          minHeight: 0,
        }}
      >
        {/* Sidebar - becomes overlay on narrow viewports */}
        <div
          style={{
            ...styles.sidebar,
            ...(sidebarOpen ? styles.sidebarExpanded : styles.sidebarCollapsed),
            height: "100%",
            alignSelf: "stretch",
            // Mobile overlay styles for WCAG Reflow compliance
            ...(isNarrowViewport && {
              position: sidebarOpen ? 'fixed' : 'relative',
              top: sidebarOpen ? `${topOffset}px` : 'auto',
              left: sidebarOpen ? 0 : 'auto',
              right: sidebarOpen ? 0 : 'auto',
              bottom: sidebarOpen ? 0 : 'auto',
              zIndex: sidebarOpen ? 1001 : 'auto',
              width: sidebarOpen ? '100%' : '0',
              minWidth: sidebarOpen ? '100%' : '0',
              maxWidth: sidebarOpen ? '100%' : '0',
              overflow: sidebarOpen ? 'auto' : 'hidden',
            }),
            // Desktop styles
            ...(!isNarrowViewport && {
              position: 'static',
            }),
          }}
          aria-hidden={modalOpen || (isNarrowViewport && !sidebarOpen)}
        >
          {/* Sidebar header with toggle button */}
          <div
            style={{
              ...styles.sidebarHeader,
              justifyContent: sidebarOpen ? "space-between" : "center",
            }}
          >
            {sidebarOpen && (
              <div style={{ fontWeight: "bold", fontSize: "16px" }}>
                Navigation
              </div>
            )}
            <button
              style={styles.sidebarToggle}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={
                sidebarOpen
                  ? "Collapse navigation sidebar"
                  : "Expand navigation sidebar"
              }
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? (
                <ChevronLeft size={20} />
              ) : (
                <ChevronRight size={20} />
              )}
            </button>
          </div>

          {/* Navigation links */}
          <div style={styles.navContainer}>
            <div>
              {sidebarOpen && (
                <div style={styles.sectionHeader}>
                  <span>Menu</span>
                </div>
              )}

              {/* Home Button */}
              <button
                onClick={() => navigate("/home")}
                style={{
                  ...styles.navButton,
                }}
                aria-label="Home"
                title="Home"
              >
                <Home size={20} />
                {sidebarOpen && <span style={styles.navLinkText}>Home</span>}
              </button>

              <button
                onClick={handleChatNavigation}
                style={{
                  ...styles.navButton,
                  ...(activeTab === "chat" ? styles.navButtonActive : {}),
                }}
                aria-current={activeTab === "chat" ? "page" : undefined}
                aria-label="Navigate to chat"
              >
                <MessageSquare size={20} />
                {sidebarOpen && <span style={styles.navLinkText}>Chat</span>}
              </button>

              <button
                onClick={() => {
                  const queryParams = documentIdentifier
                    ? `?folder=${encodeURIComponent(documentIdentifier)}`
                    : "";
                  navigate(`/chat/sessions${queryParams}`);
                }}
                style={{
                  ...styles.navButton,
                  ...(activeTab === "sessions" ? styles.navButtonActive : {}),
                }}
                aria-current={activeTab === "sessions" ? "page" : undefined}
                aria-label="Navigate to sessions"
              >
                <List size={20} />
                {sidebarOpen && (
                  <span style={styles.navLinkText}>Sessions</span>
                )}
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
                aria-current={activeTab === "editor" ? "page" : undefined}
                aria-label="Navigate to write application"
              >
                <Edit size={20} />
                {sidebarOpen && (
                  <span style={styles.navLinkText}>Write Application</span>
                )}
              </button>

              <button
                onClick={() =>
                  navigate(
                    `/requirements/${
                      documentIdentifier || ""
                    }`
                  )
                }
                style={{
                  ...styles.navButton,
                  ...(activeTab === "requirements"
                    ? styles.navButtonActive
                    : {}),
                }}
                aria-current={activeTab === "requirements" ? "page" : undefined}
                aria-label="Navigate to key requirements"
              >
                <CheckSquare size={20} />
                {sidebarOpen && (
                  <span style={styles.navLinkText}>Key Requirements</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            margin: 0,
            padding: 0,
            minHeight: 0,
            minWidth: 0,
            width: isNarrowViewport ? '100%' : 'auto',
          }}
        >
          {/* Header area */}
          {header}

          {/* Main content area */}
          <div style={{
            ...styles.mainContainer,
            flexDirection: isNarrowViewport ? 'column' : 'row',
          }}>
            {/* Primary content */}
            <div style={{
              ...styles.contentArea,
              width: isNarrowViewport ? '100%' : 'auto',
            }}>
              {content}
            </div>

            {/* Tools/help panel - stacks below content on narrow viewports */}
            {toolsOpenExternal && info && (
              <div
                style={{
                  ...styles.toolsPanel,
                  width: isNarrowViewport ? '100%' : toolsWidth,
                  height: isNarrowViewport ? 'auto' : '100%',
                  borderLeft: isNarrowViewport ? 'none' : '1px solid #e5e7eb',
                  borderTop: isNarrowViewport ? '1px solid #e5e7eb' : 'none',
                }}
              >
                {info}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

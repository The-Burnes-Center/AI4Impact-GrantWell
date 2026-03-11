import React, { useState, useEffect } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import UnifiedNavigation from "../components/navigation/UnifiedNavigation";

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
        {/* Unified Navigation Sidebar */}
        <nav aria-label="Application navigation" style={{ flexShrink: 0 }}>
          <UnifiedNavigation
            documentIdentifier={documentIdentifier}
          />
        </nav>

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

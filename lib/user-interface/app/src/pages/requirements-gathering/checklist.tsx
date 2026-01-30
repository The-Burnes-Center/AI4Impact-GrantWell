import React, { useState, useEffect, useContext } from "react";
import { createPortal } from "react-dom";
import {
  useParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { GrantTypeId } from "../../common/grant-types";
import "../../styles/checklists.css";
import { v4 as uuidv4 } from "uuid";
import RequirementsNavigation from "./checklist-navigation";

// Grant type definitions for display
const GRANT_TYPES: Record<GrantTypeId, { label: string; color: string }> = {
  federal: { label: "Federal", color: "#1a4480" },
  state: { label: "State", color: "#2e8540" },
  quasi: { label: "Quasi", color: "#8168b3" },
  philanthropic: { label: "Philanthropic", color: "#e66f0e" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

// Types
interface TabContent {
  title: string;
  content: string;
}

interface TabContents {
  [key: string]: TabContent;
}

interface LlmData {
  grantName: string;
  eligibility: string;
  documents: string;
  narrative: string;
  deadlines: string;
}

// Removed unused ButtonProps interface

interface TabProps {
  id: string;
  activeId: string;
  onClick: (id: string) => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}

// Theme
const THEME = {
  colors: {
    primary: "#14558F",
    primaryHover: "#104472",
    primaryLight: "#f2f8fd",
    text: "#333",
    textSecondary: "#444",
    accent: "#14558F",
    heading: "#0a2e52",
    border: "#ddd",
    white: "#ffffff",
    background: "#f9fafb",
    success: "#037f51",
    successLight: "#eafaf1",
    warning: "#cc7700",
    warningLight: "#fff8ec",
    info: "#14558F",
    infoLight: "#e6f7ff",
    gray: "#eaeaea",
  },
  fonts: {
    base: "'Noto Sans', sans-serif",
  },
  shadows: {
    small: "0 2px 4px rgba(0,0,0,0.08)",
    medium: "0 4px 8px rgba(0,0,0,0.12)",
    large: "0 10px 20px rgba(0,0,0,0.08)",
  },
  transitions: {
    default: "all 0.2s ease",
  },
  borderRadius: {
    small: "4px",
    medium: "6px",
    large: "8px",
  },
};

// CSS styles as objects
const styles = {
  container: {
    width: "100%",
    margin: "0 auto",
    padding: "32px",
    fontSize: "18px",
    fontFamily: THEME.fonts.base,
    fontWeight: 400,
    color: THEME.colors.text,
    lineHeight: "1.5",
    position: "relative" as const,
    backgroundColor: THEME.colors.white,
    boxShadow: THEME.shadows.medium,
    borderRadius: THEME.borderRadius.medium,
  },
  heading: {
    fontFamily: THEME.fonts.base,
    fontWeight: 600,
    color: THEME.colors.heading,
    letterSpacing: "-0.01em",
    fontSize: "32px",
    lineHeight: "1.4",
    margin: 0,
    marginBottom: "20px",
    wordSpacing: "0.05em",
  },
  paragraph: {
    fontFamily: THEME.fonts.base,
    fontSize: "18px",
    lineHeight: "1.6",
    marginTop: "12px",
    marginBottom: "24px",
    color: THEME.colors.textSecondary,
  },
  italicParagraph: {
    fontFamily: THEME.fonts.base,
    fontSize: "16px",
    lineHeight: "1.6",
    marginTop: "12px",
    marginBottom: "0",
    color: THEME.colors.textSecondary,
    fontStyle: "italic",
  },
  // Removed unused button styles
  tabsContainer: {
    marginTop: "20px",
    marginBottom: "24px",
    width: "100%",
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.medium,
    boxShadow: THEME.shadows.medium,
  },
  tabsHeader: {
    borderBottom: `1px solid ${THEME.colors.border}`,
    display: "flex",
    fontFamily: THEME.fonts.base,
  },
  tabContent: {
    padding: "28px",
  },
  buttonContainer: {
    position: "absolute" as const,
    top: "0",
    right: "0",
    display: "flex",
    flexDirection: "column" as const,
    gap: "14px",
    width: "220px",
  },
  headerContainer: {
    position: "relative" as const,
    marginBottom: "48px",
  },
  headerContent: {
    paddingRight: "240px",
  },
  mainContainer: {
    backgroundColor: THEME.colors.background,
    padding: "32px 16px 16px 16px",
  },
  loadingContainer: {
    textAlign: "center" as const,
    padding: "40px 0",
  },
  contentArea: {
    width: "100%",
    marginRight: "auto",
    marginLeft: "0",
    marginTop: "12px",
  },
  markdownContainer: {
    fontSize: "19px",
    lineHeight: "1.7",
  },
  helpBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    maxWidth: "10000px",
    marginTop: "36px",
    marginBottom: "24px",
    marginLeft: "0",
    marginRight: "auto",
    padding: "24px",
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.medium,
    border: `1px solid ${THEME.colors.border}`,
  },
  helpIcon: {
    backgroundColor: THEME.colors.primary,
    color: THEME.colors.white,
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "bold",
  },
  helpContent: {
    display: "flex",
    gap: "18px",
    alignItems: "flex-start",
  },
  helpTitle: {
    margin: "0 0 10px 0",
    fontSize: "20px",
    fontWeight: 600,
    color: THEME.colors.heading,
  },
  helpText: {
    margin: 0,
    fontSize: "17px",
    lineHeight: "1.6",
    color: THEME.colors.textSecondary,
  },
  infoBox: {
    backgroundColor: THEME.colors.infoLight,
    padding: "20px 24px",
    maxWidth: "850px",
    marginTop: "24px",
    marginLeft: "0",
    marginRight: "auto",
    borderRadius: THEME.borderRadius.medium,
    border: `1px solid ${THEME.colors.info}`,
    display: "flex",
    alignItems: "flex-start",
    gap: "16px",
  },
  infoTitle: {
    margin: "0 0 10px 0",
    fontSize: "18px",
    fontWeight: 600,
    color: THEME.colors.heading,
  },
  infoText: {
    margin: 0,
    fontSize: "16px",
    lineHeight: "1.6",
    color: THEME.colors.textSecondary,
  },
  // No tooltip styles needed
};

// CSS to be injected for markdown and spinner
const cssToInject = `
  .custom-markdown strong {
    font-weight: 700;
    color: ${THEME.colors.heading};
  }
  .custom-markdown {
    font-size: 19px;
    line-height: 1.7;
  }
  .custom-markdown ul {
    padding-left: 24px;
  }
  .custom-markdown li {
    margin-bottom: 20px;
    position: relative;
    list-style-type: none;
    padding-left: 24px;
  }
  .custom-markdown li:before {
    content: "";
    position: absolute;
    left: 0;
    top: 12px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${THEME.colors.primary};
  }
  .spinner {
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top: 4px solid ${THEME.colors.primary};
    width: 50px;
    height: 50px;
    animation: spin 1s linear infinite;
    margin: 24px auto;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Icon components
const UserIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M20 21V19C20 16.7909 18.2091 15 16 15H8C5.79086 15 4 16.7909 4 19V21"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="7"
      r="4"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DocumentIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M14 3V7H18"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H14L19 8V19C19 20.1046 18.1046 21 17 21Z"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 13H15"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M9 17H15"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const ListIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 6H19"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M4 6H4.01"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M8 12H19"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M4 12H4.01"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M8 18H19"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M4 18H4.01"
      stroke={THEME.colors.primary}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const ClockIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke={THEME.colors.accent}
      strokeWidth="2"
    />
    <path
      d="M12 7V12L15 15"
      stroke={THEME.colors.accent}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// Removed unused LightbulbIcon

const InfoIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="9" stroke={THEME.colors.info} strokeWidth="2" />
    <path
      d="M12 8L12 15"
      stroke={THEME.colors.info}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M12 18.01L12.01 17.9989"
      stroke={THEME.colors.info}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// Removed unused icons

// Removed unused ActionButton component

// Component for Tab
const Tab: React.FC<TabProps> = ({ id, activeId, onClick, children, icon }) => {
  const isActive = id === activeId;

  return (
    <button
      style={{
        padding: "18px 28px",
        cursor: "pointer",
        backgroundColor: isActive ? THEME.colors.primaryLight : "transparent",
        fontWeight: isActive ? "600" : "normal",
        fontSize: "17px",
        transition: THEME.transitions.default,
        color: isActive ? THEME.colors.heading : THEME.colors.textSecondary,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        border: "none",
        borderBottom: isActive
          ? `3px solid ${THEME.colors.primary}`
          : `3px solid transparent`,
      }}
      onClick={() => onClick(id)}
      onFocus={(e) => {
        e.currentTarget.style.outline = "2px solid #0088FF";
        e.currentTarget.style.outlineOffset = "2px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = "none";
      }}
      role="tab"
      tabIndex={0}
      aria-selected={isActive}
      aria-controls={`tabpanel-${id}`}
      id={`tab-${id}`}
    >
      {icon}
      {children}
    </button>
  );
};

// Main component
const Checklists: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { documentIdentifier } = useParams<{ documentIdentifier: string }>();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder") || documentIdentifier;
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [llmData, setLlmData] = useState<LlmData>({
    grantName: "",
    eligibility: "",
    documents: "",
    narrative: "",
    deadlines: "",
  });
  const [grantType, setGrantType] = useState<GrantTypeId | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [activeTabId, setActiveTabId] = useState("eligibility");
  const [showHelp, setShowHelp] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isNavCollapsed, setIsNavCollapsed] = useState<boolean>(false);
  const modalRef = React.useRef<HTMLDivElement>(null);
  const modalPreviousFocusRef = React.useRef<HTMLElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const checkboxRef = React.useRef<HTMLInputElement>(null);
  const gotItButtonRef = React.useRef<HTMLButtonElement>(null);

  // Add CSS styles to document on mount
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.innerHTML = cssToInject;
    document.head.appendChild(styleEl);

    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Check localStorage and show help modal automatically on first visit
  useEffect(() => {
    const hasSeenHelp = localStorage.getItem("checklistsHelpSeen");
    if (!hasSeenHelp && !isLoading) {
      setShowHelp(true);
    }
  }, [isLoading]);

  // Focus trapping effect for modal
  useEffect(() => {
    if (!showHelp) return;

    const modalElement = modalRef.current;
    if (!modalElement) return;

    // Store the currently focused element for restoration
    modalPreviousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the modal container when modal opens so screen readers read all content
    setTimeout(() => {
      modalRef.current?.focus();
    }, 100);

    // Handle tab key for focus trapping
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements = [
        closeButtonRef.current,
        checkboxRef.current,
        gotItButtonRef.current,
      ].filter(Boolean);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) return;

      // Check if currently focused element is inside the modal
      const activeElement = document.activeElement as HTMLElement;
      const isInsideModal = modalRef.current?.contains(activeElement);

      // If focus is outside the modal, bring it back
      if (!isInsideModal) {
        e.preventDefault();
        firstElement?.focus();
        return;
      }

      // If shift+tab on first element, go to last
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
      // If tab on last element, go to first
      else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    // Handle escape key to close modal
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleEscape);

    // Prevent background from being tabbable
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";

      // Restore focus to the element that triggered the modal
      // Only restore focus if the element still exists in the DOM
      if (
        modalPreviousFocusRef.current &&
        document.body.contains(modalPreviousFocusRef.current)
      ) {
        modalPreviousFocusRef.current.focus();
      }
    };
  }, [showHelp]);

  // Handle URL hash for direct tab access
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (["eligibility", "narrative", "documents", "deadlines"].includes(hash)) {
      setActiveTabId(hash);
    }
  }, [location]);

  // Fetch NOFO summary data and grant type
  useEffect(() => {
    const fetchData = async () => {
      if (!documentIdentifier) return;

      try {
        // Fetch NOFO summary
        const result = await apiClient.landingPage.getNOFOSummary(
          documentIdentifier
        );

        // Fetch grant type information
        try {
          const nofoResult = await apiClient.landingPage.getNOFOs();
          if (nofoResult.nofoData) {
            const matchingNofo = nofoResult.nofoData.find(
              (nofo) => nofo.name === documentIdentifier
            );
            if (matchingNofo) {
              setGrantType(matchingNofo.grant_type || null);
            }
          }
        } catch (error) {
          console.error("Error loading grant type: ", error);
        }

        // Process API data with better error handling
        const processApiItems = (items) => {
          if (!items || !Array.isArray(items)) return "";

          return items
            .map((section) => {
              // Handle case where item might be an object or other non-string
              let itemText = "Unknown";
              if (section.item !== undefined) {
                itemText =
                  typeof section.item === "object"
                    ? JSON.stringify(section.item)
                    : String(section.item);
              }

              // Handle case where description might be an object or other non-string
              let descText = "No description";
              if (section.description !== undefined) {
                descText =
                  typeof section.description === "object"
                    ? JSON.stringify(section.description)
                    : String(section.description);
              }

              return `- **${itemText}**: ${descText}`;
            })
            .join("\n");
        };

        setLlmData({
          grantName: result.data.GrantName || "Grant",
          eligibility: processApiItems(result.data.EligibilityCriteria),
          documents: processApiItems(result.data.RequiredDocuments),
          narrative: processApiItems(result.data.ProjectNarrativeSections),
          deadlines: processApiItems(result.data.KeyDeadlines),
        });
      } catch (error) {
        console.error("Error loading NOFO summary: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [documentIdentifier]);

  const linkUrl = `/chat/${uuidv4()}?folder=${encodeURIComponent(
    documentIdentifier || ""
  )}`;

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
    window.location.hash = tabId;
    // Focus the newly selected tab
    setTimeout(() => {
      document.getElementById(`tab-${tabId}`)?.focus();
    }, 0);
  };

  // Handle arrow key navigation for tabs
  const handleTabsKeyDown = (e: React.KeyboardEvent) => {
    const tabIds = ["eligibility", "documents", "narrative", "deadlines"];
    const currentIndex = tabIds.indexOf(activeTabId);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % tabIds.length;
      handleTabClick(tabIds[nextIndex]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      handleTabClick(tabIds[prevIndex]);
    } else if (e.key === "Home") {
      e.preventDefault();
      handleTabClick(tabIds[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      handleTabClick(tabIds[tabIds.length - 1]);
    }
  };

  // Handle modal close
  const handleCloseModal = () => {
    if (dontShowAgain) {
      localStorage.setItem("checklistsHelpSeen", "true");
    }
    setShowHelp(false);
  };

  // Tab content mapping
  const tabContents: TabContents = {
    eligibility: {
      title:
        "Ensure you adhere to the extracted eligibility criteria before continuing with your application.",
      content: llmData.eligibility,
    },
    documents: {
      title: "Include the following documents in your proposal.",
      content: llmData.documents,
    },
    narrative: {
      title:
        "The following sections must be included in the project narrative.",
      content: llmData.narrative,
    },
    deadlines: {
      title: "Note the following key deadlines for this grant.",
      content: llmData.deadlines,
    },
  };

  // Calculate top offset dynamically for brand banner + MDS header
  const [topOffset, setTopOffset] = useState<number>(0);

  useEffect(() => {
    const updateTopOffset = () => {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
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

        const totalHeight = bannerHeight + mdsHeaderHeight;
        setTopOffset(totalHeight);
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
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        minHeight: `calc(100vh - ${topOffset}px)`,
        position: "static",
        width: "100%",
        margin: 0,
        padding: 0,
        // No marginTop needed - headers are static and already in document flow
      }}
    >
      {/* Skip Navigation Link for Accessibility */}
      <a
        href="#main-content"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "10px",
          zIndex: 9999,
          padding: "10px 20px",
          backgroundColor: THEME.colors.primary,
          color: THEME.colors.white,
          textDecoration: "none",
          borderRadius: THEME.borderRadius.small,
          fontWeight: "600",
        }}
        onFocus={(e) => {
          e.currentTarget.style.left = "10px";
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = "-9999px";
        }}
      >
        Skip to main content
      </a>
      {/* Navigation Sidebar */}
      <nav
        aria-label="Requirements navigation"
        aria-hidden={showHelp}
        style={{
          margin: 0,
          padding: 0,
          flexShrink: 0,
        }}
      >
        <RequirementsNavigation
          documentIdentifier={folderParam}
          onCollapseChange={setIsNavCollapsed}
        />
      </nav>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          margin: 0,
          padding: 0,
          paddingLeft: "0",
          minHeight: "calc(100vh - 120px)",
        }}
        aria-hidden={showHelp}
      >
        <div style={styles.mainContainer}>
          {isLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "400px",
                width: "100%",
                maxWidth: "800px",
                margin: "40px auto",
                padding: "40px 20px",
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  marginBottom: "32px",
                }}
              >
                <div className="loading-spinner" />
              </div>
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "600",
                  color: "#333",
                  marginBottom: "16px",
                  textAlign: "center",
                }}
              >
                Loading NOFO Data
              </h2>
              <p
                style={{
                  fontSize: "16px",
                  color: "#666",
                  marginBottom: "32px",
                  textAlign: "center",
                }}
              >
                Retrieving grant information and requirements...
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  backgroundColor: "#f0f7ff",
                  padding: "16px 24px",
                  borderRadius: "8px",
                  maxWidth: "600px",
                }}
              >
                <span style={{ fontSize: "24px" }}>💡</span>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#14558F",
                    margin: 0,
                    lineHeight: "1.5",
                  }}
                >
                  Our AI reviews eligibility criteria, deadlines, and
                  requirements to save you hours of research time.
                </p>
              </div>
            </div>
          ) : (
            <div style={styles.container}>
              <div style={styles.headerContainer}>
                <div style={{ ...styles.headerContent, paddingRight: "120px" }}>
                  <h1 style={styles.heading}>
                    <span>Application Requirements for </span>
                    <span style={{ color: THEME.colors.accent }}>
                      {llmData.grantName}
                    </span>
                    {grantType && GRANT_TYPES[grantType] && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "14px",
                          fontWeight: "500",
                          padding: "4px 12px",
                          borderRadius: "16px",
                          backgroundColor: `${GRANT_TYPES[grantType].color}15`,
                          color: GRANT_TYPES[grantType].color,
                          border: `1px solid ${GRANT_TYPES[grantType].color}40`,
                          marginLeft: "12px",
                          verticalAlign: "middle",
                        }}
                      >
                        {GRANT_TYPES[grantType].label}
                      </span>
                    )}
                  </h1>
                  <p style={styles.paragraph}>
                    Key requirement checkpoints for this Notice of Funding
                    Opportunity (NOFO). Review these requirements to ensure
                    eligibility and understand what documents and narrative
                    sections you'll need to prepare.
                  </p>
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: "32px",
                    right: "32px",
                  }}
                >
                  <button
                    onClick={() => setShowHelp(!showHelp)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 16px",
                      backgroundColor: THEME.colors.info,
                      color: THEME.colors.white,
                      border: "none",
                      borderRadius: THEME.borderRadius.small,
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: "14px",
                      boxShadow: THEME.shadows.small,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="white"
                        strokeWidth="2"
                      />
                      <path
                        d="M12 8L12 15"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 18.01L12.01 17.9989"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    Help
                  </button>
                </div>
              </div>

              <div style={styles.tabsContainer}>
                <div
                  style={styles.tabsHeader}
                  role="tablist"
                  aria-label="Grant requirements"
                  onKeyDown={handleTabsKeyDown}
                >
                  <Tab
                    id="eligibility"
                    activeId={activeTabId}
                    onClick={handleTabClick}
                    icon={<UserIcon />}
                  >
                    Eligibility
                  </Tab>
                  <Tab
                    id="documents"
                    activeId={activeTabId}
                    onClick={handleTabClick}
                    icon={<DocumentIcon />}
                  >
                    Required Documents
                  </Tab>
                  <Tab
                    id="narrative"
                    activeId={activeTabId}
                    onClick={handleTabClick}
                    icon={<ListIcon />}
                  >
                    Narrative Sections
                  </Tab>
                  <Tab
                    id="deadlines"
                    activeId={activeTabId}
                    onClick={handleTabClick}
                    icon={<ClockIcon />}
                  >
                    Key Deadlines
                  </Tab>
                </div>

                {/* Render all tab panels, but only show the active one */}
                {Object.keys(tabContents).map((tabId) => (
                  <div
                    key={tabId}
                    style={{
                      ...styles.tabContent,
                      display: tabId === activeTabId ? "block" : "none",
                    }}
                    role="tabpanel"
                    id={`tabpanel-${tabId}`}
                    aria-labelledby={`tab-${tabId}`}
                    hidden={tabId !== activeTabId}
                  >
                    <div style={styles.contentArea}>
                      <p style={styles.paragraph}>{tabContents[tabId].title}</p>
                      <div style={styles.markdownContainer}>
                        <ReactMarkdown
                          className="custom-markdown"
                          components={{
                            ul: ({ node, ...props }) => <ul {...props} />,
                            li: ({ node, ...props }) => {
                              return (
                                <li {...props} style={{ marginBottom: "20px" }}>
                                  {props.children}
                                </li>
                              );
                            },
                          }}
                        >
                          {tabContents[tabId].content}
                        </ReactMarkdown>

                        {/* Eligibility help prompt */}
                        {tabId === "eligibility" && (
                          <div style={styles.infoBox}>
                            <InfoIcon />
                            <div>
                              <p style={styles.infoTitle}>
                                Not sure if your organization qualifies?
                              </p>
                              <p style={styles.infoText}>
                                Our AI-powered chatbot can help assess your
                                organization's eligibility based on these
                                criteria. Click the "Chat with AI" button in the
                                navigation panel and ask: "Is my organization
                                eligible for this grant?"
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p style={styles.italicParagraph}>
                Note: Always refer to the official NOFO documentation for final
                requirements and details.
              </p>
            </div>
          )}
        </div>
      </div>
      {showHelp &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 10000,
            }}
            onClick={(e) => {
              // Close modal if clicking on the overlay (not the modal content)
              if (e.target === e.currentTarget) {
                handleCloseModal();
              }
            }}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-modal-title"
              aria-describedby="help-modal-description"
              style={{
                width: "650px",
                backgroundColor: THEME.colors.white,
                borderRadius: "12px",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                maxHeight: "90vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                outline: "none",
              }}
              onClick={(e) => {
                // Prevent clicks inside modal from bubbling to overlay
                e.stopPropagation();
              }}
            >
              {/* Header */}
              <div
                style={{
                  backgroundColor: "#14558F",
                  padding: "20px 24px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2
                  id="help-modal-title"
                  style={{
                    fontSize: "22px",
                    fontWeight: 600,
                    color: "#ffffff",
                    margin: 0,
                  }}
                >
                  How to use this page
                </h2>
                <button
                  ref={closeButtonRef}
                  onClick={handleCloseModal}
                  style={{
                    background: "rgba(255, 255, 255, 0.2)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "24px",
                    color: "#ffffff",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    lineHeight: "1",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.2)";
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.background = "#ffffff";
                    e.currentTarget.style.color = "#14558F";
                    e.currentTarget.style.outline = "2px solid #ffffff";
                    e.currentTarget.style.outlineOffset = "2px";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.2)";
                    e.currentTarget.style.color = "#ffffff";
                    e.currentTarget.style.outline = "none";
                  }}
                  aria-label="Close help dialog"
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <div
                id="help-modal-description"
                style={{
                  padding: "28px 32px",
                  overflowY: "auto",
                  flex: 1,
                }}
              >
                <p
                  style={{
                    marginBottom: "20px",
                    lineHeight: "1.6",
                    fontSize: "15px",
                    color: "#555",
                  }}
                >
                  Grantwell uses generative AI to extract and summarize the key
                  elements of the grant.
                </p>

                {/* Highlighted box */}
                <div
                  style={{
                    borderLeft: "4px solid #14558F",
                    backgroundColor: "#F0F7FF",
                    padding: "16px 20px",
                    marginBottom: "24px",
                    borderRadius: "4px",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      lineHeight: "1.6",
                      fontSize: "15px",
                      color: "#333",
                    }}
                  >
                    Click through the tabs above (
                    <strong style={{ fontWeight: 600 }}>
                      Eligibility, Required Documents, Narrative Sections, Key
                      Deadlines
                    </strong>
                    ) to see what you need for this grant.
                  </p>
                </div>

                {/* Have a question section */}
                <div style={{ marginBottom: "20px" }}>
                  <p
                    style={{
                      margin: 0,
                      marginBottom: "6px",
                      fontSize: "15px",
                      color: "#14558F",
                      fontWeight: 600,
                    }}
                  >
                    Have a question?
                  </p>
                  <p
                    style={{
                      margin: 0,
                      lineHeight: "1.6",
                      fontSize: "15px",
                      color: "#555",
                    }}
                  >
                    Use "Chat with AI" in the left sidebar to get help
                    understanding the grant requirements.
                  </p>
                </div>

                {/* Ready to start writing section */}
                <div style={{ marginBottom: "20px" }}>
                  <p
                    style={{
                      margin: 0,
                      marginBottom: "6px",
                      fontSize: "15px",
                      color: "#14558F",
                      fontWeight: 600,
                    }}
                  >
                    Ready to start writing?
                  </p>
                  <p
                    style={{
                      margin: 0,
                      lineHeight: "1.6",
                      fontSize: "15px",
                      color: "#555",
                    }}
                  >
                    Click "Write Application" in the left sidebar to begin
                    drafting.
                  </p>
                </div>

                {/* Want a different grant section */}
                <div style={{ marginBottom: "24px" }}>
                  <p
                    style={{
                      margin: 0,
                      marginBottom: "6px",
                      fontSize: "15px",
                      color: "#14558F",
                      fontWeight: 600,
                    }}
                  >
                    Want a different grant?
                  </p>
                  <p
                    style={{
                      margin: 0,
                      lineHeight: "1.6",
                      fontSize: "15px",
                      color: "#555",
                    }}
                  >
                    Use Recent Grants to access other recently viewed grants, 
                    or select Home to return to the main page.
                  </p>
                </div>

                {/* Checkbox */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginTop: "24px",
                    marginBottom: "20px",
                  }}
                >
                  <input
                    ref={checkboxRef}
                    type="checkbox"
                    id="dont-show-again"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    style={{
                      marginRight: "10px",
                      cursor: "pointer",
                      width: "18px",
                      height: "18px",
                      accentColor: "#14558F",
                    }}
                    aria-label="Do not show this again"
                  />
                  <label
                    htmlFor="dont-show-again"
                    style={{
                      fontSize: "14px",
                      color: "#666",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    Do not show this again
                  </label>
                </div>

                {/* Got it button */}
                <button
                  ref={gotItButtonRef}
                  onClick={handleCloseModal}
                  style={{
                    padding: "14px 24px",
                    backgroundColor: "#14558F",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "16px",
                    width: "100%",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#104472";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#14558F";
                  }}
                  aria-label="Close help dialog"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Checklists;

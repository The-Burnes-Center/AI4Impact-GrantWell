import React, { useState, useEffect, useContext } from "react";
import {
  useParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import "../../styles/checklists.css";
import { v4 as uuidv4 } from "uuid";
import RequirementsNavigation from "./checklist-navigation";

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
    primary: "#0972d3",
    primaryHover: "#0561b8",
    primaryLight: "#f2f8fd",
    text: "#333",
    textSecondary: "#444",
    accent: "#006499",
    heading: "#0a2e52",
    border: "#ddd",
    white: "#ffffff",
    background: "#f9fafb",
    success: "#037f51",
    successLight: "#eafaf1",
    warning: "#f89c24",
    warningLight: "#fff8ec",
    info: "#0073bb",
    infoLight: "#e6f7ff",
    gray: "#eaeaea",
  },
  fonts: {
    base: "'Inter', 'Segoe UI', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
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
    maxWidth: "1300px",
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
    lineHeight: "1.2",
    margin: 0,
    marginBottom: "20px",
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
    minHeight: "100vh",
    padding: "16px",
  },
  loadingContainer: {
    textAlign: "center" as const,
    padding: "40px 0",
  },
  contentArea: {
    maxWidth: "900px",
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
    <div
      style={{
        padding: "18px 28px",
        cursor: "pointer",
        backgroundColor: isActive ? THEME.colors.primaryLight : "transparent",
        borderBottom: isActive ? `3px solid ${THEME.colors.primary}` : "none",
        fontWeight: isActive ? "600" : "normal",
        fontSize: "17px",
        transition: THEME.transitions.default,
        color: isActive ? THEME.colors.heading : THEME.colors.textSecondary,
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
      onClick={() => onClick(id)}
    >
      {icon}
      {children}
    </div>
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
  const [isLoading, setLoading] = useState(true);
  const [activeTabId, setActiveTabId] = useState("eligibility");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  // Toggle sidebar function
  const handleSidebarToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Add CSS styles to document on mount
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.innerHTML = cssToInject;
    document.head.appendChild(styleEl);

    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Handle URL hash for direct tab access
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (["eligibility", "narrative", "documents", "deadlines"].includes(hash)) {
      setActiveTabId(hash);
    }
  }, [location]);

  // Fetch NOFO summary data
  useEffect(() => {
    const fetchData = async () => {
      if (!documentIdentifier) return;

      try {
        const result = await apiClient.landingPage.getNOFOSummary(
          documentIdentifier
        );

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

  const linkUrl = `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(
    documentIdentifier || ""
  )}`;

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
    window.location.hash = tabId;
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

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Navigation Sidebar */}
      <RequirementsNavigation
        documentIdentifier={folderParam}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={handleSidebarToggle}
      />

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          marginLeft: sidebarOpen ? "240px" : "72px",
          transition: "margin-left 0.3s ease",
        }}
      >
        <div style={styles.mainContainer}>
          {isLoading ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '400px',
              width: '100%',
              maxWidth: '800px',
              margin: '40px auto',
              padding: '40px 20px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                marginBottom: '32px'
              }}>
                <div className="loading-spinner" />
              </div>
              <h2 style={{
                fontSize: '28px',
                fontWeight: '600',
                color: '#333',
                marginBottom: '16px',
                textAlign: 'center'
              }}>Loading NOFO Data</h2>
              <p style={{
                fontSize: '16px',
                color: '#666',
                marginBottom: '32px',
                textAlign: 'center'
              }}>Retrieving grant information and requirements...</p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: '#f0f7ff',
                padding: '16px 24px',
                borderRadius: '8px',
                maxWidth: '600px'
              }}>
                <span style={{ fontSize: '24px' }}>💡</span>
                <p style={{
                  fontSize: '14px',
                  color: '#0073BB',
                  margin: 0,
                  lineHeight: '1.5'
                }}>Our AI reviews eligibility criteria, deadlines, and requirements to save you hours of research time.</p>
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

              {showHelp && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 1000,
                  }}
                >
                  <div
                    style={{
                      width: "600px",
                      backgroundColor: THEME.colors.white,
                      borderRadius: THEME.borderRadius.medium,
                      padding: "24px",
                      boxShadow: THEME.shadows.large,
                      maxHeight: "80vh",
                      overflow: "auto",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "16px",
                      }}
                    >
                      <h2
                        style={{
                          fontSize: "20px",
                          fontWeight: 600,
                          color: THEME.colors.heading,
                          margin: 0,
                        }}
                      >
                        How to use this page
                      </h2>
                      <button
                        onClick={() => setShowHelp(false)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "20px",
                          color: THEME.colors.textSecondary,
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <div
                      style={{
                        fontSize: "16px",
                        lineHeight: 1.5,
                        color: THEME.colors.text,
                      }}
                    >
                      <p style={{ marginBottom: "16px", lineHeight: "1.6" }}>
                        <strong>Reviewing requirements:</strong> Click through the tabs above (Eligibility, Required Documents, Narrative Sections, Key Deadlines) to see what you need for this grant.
                      </p>
                      
                      <p style={{ marginBottom: "16px", lineHeight: "1.6" }}>
                        <strong>Need help understanding something?</strong> Use "Chat with AI" in the left sidebar to ask questions about the grant requirements.
                      </p>
                      
                      <p style={{ marginBottom: "16px", lineHeight: "1.6" }}>
                        <strong>Ready to start writing?</strong> Click "Write Application" in the left sidebar to begin drafting your application.
                      </p>
                      
                      <p style={{ marginBottom: "0", lineHeight: "1.6" }}>
                        <strong>Want to check recent grants?</strong> Use "Recent Grants" in the left sidebar to quickly access grants you've looked at before.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowHelp(false)}
                      style={{
                        marginTop: "24px",
                        padding: "10px 16px",
                        backgroundColor: THEME.colors.primary,
                        color: THEME.colors.white,
                        border: "none",
                        borderRadius: THEME.borderRadius.small,
                        cursor: "pointer",
                        fontWeight: 500,
                        fontSize: "16px",
                        display: "block",
                        width: "100%",
                      }}
                    >
                      Got it
                    </button>
                  </div>
                </div>
              )}

              <div style={styles.tabsContainer}>
                <div style={styles.tabsHeader}>
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

                <div style={styles.tabContent}>
                  <div style={styles.contentArea}>
                    <p style={styles.paragraph}>
                      {tabContents[activeTabId].title}
                    </p>
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
                        {tabContents[activeTabId].content}
                      </ReactMarkdown>

                      {/* Eligibility help prompt */}
                      {activeTabId === "eligibility" && (
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
              </div>

              <p style={styles.italicParagraph}>
                Note: Always refer to the official NOFO documentation for final
                requirements and details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Checklists;

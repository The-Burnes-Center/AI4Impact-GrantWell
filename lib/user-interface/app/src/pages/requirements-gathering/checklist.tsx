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

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

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
  button: {
    backgroundColor: THEME.colors.primary,
    color: THEME.colors.white,
    padding: "14px 18px",
    border: "none",
    borderRadius: THEME.borderRadius.small,
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    fontFamily: THEME.fonts.base,
    boxShadow: THEME.shadows.small,
    transition: THEME.transitions.default,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  buttonHover: {
    backgroundColor: THEME.colors.primaryHover,
    boxShadow: THEME.shadows.medium,
  },
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
  tipBox: {
    backgroundColor: THEME.colors.warningLight,
    padding: "16px",
    borderRadius: THEME.borderRadius.small,
    marginTop: "12px",
    border: `1px solid ${THEME.colors.warning}`,
    fontSize: "15px",
    lineHeight: "1.5",
  },
  tipHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "6px",
  },
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

const LightbulbIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9 21H15"
      stroke={THEME.colors.warning}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 3C8.68629 3 6 5.68629 6 9C6 10.415 6.41549 11.7281 7.10812 12.8103C7.07546 12.8703 7.04756 12.9341 7.02591 13H7L8.02513 18H15.9749L17 13H16.974C16.9524 12.9341 16.9245 12.8703 16.8919 12.8103C17.5845 11.7281 18 10.415 18 9C18 5.68629 15.3137 3 12 3Z"
      stroke={THEME.colors.warning}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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

const ChatbotIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M21 12C21 16.9706 16.9706 21 12 21C10.8354 21 9.71871 20.7817 8.69489 20.3797C8.2892 20.2095 7.86371 20.5378 7.4 20.9C6.4 21.8 5.3 21.9 4.5 21.9C5.5 21 6 19.1 5.5 17.9C4.56293 16.2241 4 14.1912 4 12C4 7.02944 8.02944 3 13 3C17.9706 3 21 7.02944 21 12Z"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M9 12H9.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M13 12H13.01"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M17 12H17.01"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const DocumentEditorIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 12H19M19 12L16 9M19 12L16 15"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 6V5C19 3.89543 18.1046 3 17 3H7C5.89543 3 5 3.89543 5 5V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V18"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Component for Action Button
const ActionButton: React.FC<ButtonProps> = ({
  onClick,
  children,
  style = {},
  icon,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      style={
        isHovered
          ? { ...styles.button, ...styles.buttonHover, ...style }
          : { ...styles.button, ...style }
      }
      onClick={onClick}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onMouseLeave?.();
      }}
    >
      {icon}
      {children}
    </button>
  );
};

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
  const [showTip, setShowTip] = useState<number | null>(null);
  const [isHoveredChat, setIsHoveredChat] = useState(false);
  const [isHoveredDoc, setIsHoveredDoc] = useState(false);

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
  }, [documentIdentifier, apiClient.landingPage]);

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
    <div className="checklist-container" style={styles.mainContainer}>
      <div style={styles.container} className="full-height-content">
        {isLoading ? (
          <div style={styles.loadingContainer}>
            <div className="spinner"></div>
            <p style={{ ...styles.paragraph, marginTop: "20px" }}>
              Loading application requirements...
            </p>
          </div>
        ) : (
          <>
            <div style={styles.headerContainer}>
              <div style={styles.headerContent}>
                <h1 style={styles.heading}>
                  <span>Application Requirements for </span>
                  <span style={{ color: THEME.colors.accent }}>
                    {llmData.grantName}
                  </span>
                </h1>
                <p style={styles.paragraph}>
                  We've extracted the Eligibility Criteria, Required Documents,
                  Project Narrative Components, and Key Deadlines for this
                  grant.
                </p>
                <p style={styles.italicParagraph}>
                  Use the tabs below to navigate through each section.
                </p>
              </div>
              <div style={styles.buttonContainer}>
                <ActionButton
                  onClick={() => navigate(linkUrl)}
                  icon={<ChatbotIcon />}
                  onMouseEnter={() => setIsHoveredChat(true)}
                  onMouseLeave={() => setIsHoveredChat(false)}
                  style={{
                    backgroundColor: isHoveredChat
                      ? THEME.colors.primaryHover
                      : THEME.colors.primary,
                    boxShadow: isHoveredChat
                      ? THEME.shadows.medium
                      : THEME.shadows.small,
                  }}
                >
                  Go to Chatbot
                </ActionButton>
                <ActionButton
                  onClick={() =>
                    navigate(
                      `/document-editor/${documentIdentifier}?folder=${encodeURIComponent(
                        folderParam || documentIdentifier || ""
                      )}`
                    )
                  }
                  icon={<DocumentEditorIcon />}
                  onMouseEnter={() => setIsHoveredDoc(true)}
                  onMouseLeave={() => setIsHoveredDoc(false)}
                  style={{
                    backgroundColor: isHoveredDoc
                      ? THEME.colors.primaryHover
                      : THEME.colors.primary,
                    boxShadow: isHoveredDoc
                      ? THEME.shadows.medium
                      : THEME.shadows.small,
                  }}
                >
                  Document Editor
                </ActionButton>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div style={styles.tabsContainer}>
              <div style={styles.tabsHeader}>
                <Tab
                  id="eligibility"
                  activeId={activeTabId}
                  onClick={handleTabClick}
                  icon={<UserIcon />}
                >
                  Eligibility Criteria
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
                  Project Narrative Components
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
                        ul: ({ node, ...props }) => {
                          // Create a counter that will be used by list items
                          let itemCount = 0;
                          return <ul {...props} />;
                        },
                        li: ({ node, ...props }) => {
                          // Get the content string and check if it contains "project design"
                          const itemContent = String(props.children || "");
                          const isProjectDesign =
                            activeTabId === "narrative" &&
                            itemContent
                              .toLowerCase()
                              .includes("project design");

                          return (
                            <li
                              {...props}
                              onMouseEnter={() =>
                                isProjectDesign && setShowTip(1)
                              }
                              onMouseLeave={() => setShowTip(null)}
                              style={{ marginBottom: "20px" }}
                            >
                              {props.children}
                              {showTip === 1 && isProjectDesign && (
                                <div style={styles.tipBox}>
                                  <div style={styles.tipHeader}>
                                    <LightbulbIcon />
                                    <strong>Tip:</strong>
                                  </div>
                                  Your project design should clearly align with
                                  the grant priorities. Include specific,
                                  measurable objectives and a timeline with key
                                  milestones.
                                </div>
                              )}
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
                            organization's eligibility based on these criteria.
                            Click the "Go to Chatbot" button at the top right
                            and ask: "Is my organization eligible for this
                            grant?"
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Help Box */}
            <div style={styles.helpBox}>
              <div style={styles.helpContent}>
                <div style={styles.helpIcon}>i</div>
                <div>
                  <h3 style={styles.helpTitle}>Need Help?</h3>
                  <p style={styles.helpText}>
                    Use the buttons at the top to navigate to the chatbot for
                    interactive help or the document editor to start drafting
                    your project proposal.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Checklists;

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
}

interface TabProps {
  id: string;
  activeId: string;
  onClick: (id: string) => void;
  children: React.ReactNode;
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
  },
  fonts: {
    base: "'Inter', 'Segoe UI', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  shadows: {
    small: "0 2px 4px rgba(0,0,0,0.08)",
    medium: "0 4px 8px rgba(0,0,0,0.12)",
  },
  transitions: {
    default: "all 0.2s ease",
  },
  borderRadius: {
    small: "4px",
    medium: "6px",
  },
};

// CSS styles as objects
const styles = {
  container: {
    padding: "28px",
    fontSize: "18px",
    fontFamily: THEME.fonts.base,
    fontWeight: 400,
    color: THEME.colors.text,
    lineHeight: "1.5",
    position: "relative" as const,
    backgroundColor: THEME.colors.white,
    boxShadow: THEME.shadows.small,
    borderRadius: THEME.borderRadius.medium,
  },
  heading: {
    fontFamily: THEME.fonts.base,
    fontWeight: 600,
    color: THEME.colors.heading,
    letterSpacing: "-0.01em",
    fontSize: "30px",
    lineHeight: "1.2",
    margin: 0,
    marginBottom: "16px",
  },
  paragraph: {
    fontFamily: THEME.fonts.base,
    fontSize: "18px",
    lineHeight: "1.6",
    marginTop: "10px",
    marginBottom: "20px",
    color: THEME.colors.textSecondary,
  },
  italicParagraph: {
    fontFamily: THEME.fonts.base,
    fontSize: "18px",
    lineHeight: "1.6",
    marginTop: "10px",
    marginBottom: "0",
    color: THEME.colors.textSecondary,
    fontStyle: "italic",
  },
  button: {
    backgroundColor: THEME.colors.primary,
    color: THEME.colors.white,
    padding: "12px 16px",
    border: "none",
    borderRadius: THEME.borderRadius.small,
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    fontFamily: THEME.fonts.base,
    boxShadow: THEME.shadows.small,
    transition: THEME.transitions.default,
    width: "100%",
  },
  buttonHover: {
    backgroundColor: THEME.colors.primaryHover,
    boxShadow: THEME.shadows.medium,
  },
  tabsContainer: {
    marginTop: "15px",
    marginBottom: "20px",
    width: "100%",
    backgroundColor: THEME.colors.white,
    borderRadius: THEME.borderRadius.small,
    boxShadow: THEME.shadows.small,
  },
  tabsHeader: {
    borderBottom: `1px solid ${THEME.colors.border}`,
    display: "flex",
    fontFamily: THEME.fonts.base,
  },
  tabContent: {
    padding: "20px",
  },
  buttonContainer: {
    position: "absolute" as const,
    top: "0",
    right: "0",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    width: "200px",
  },
  headerContainer: {
    position: "relative" as const,
    marginBottom: "40px",
  },
  headerContent: {
    paddingRight: "220px",
  },
  mainContainer: {
    backgroundColor: THEME.colors.background,
    minHeight: "100vh",
  },
  loadingContainer: {
    textAlign: "center" as const,
    padding: "40px 0",
  },
  contentArea: {
    margin: "20px 0 0 0",
  },
  markdownContainer: {
    fontSize: "18px",
    lineHeight: "1.6",
  },
};

// CSS to be injected for markdown and spinner
const cssToInject = `
  .custom-markdown strong {
    font-weight: 700;
    color: ${THEME.colors.heading};
  }
  .custom-markdown {
    font-size: 18px;
    line-height: 1.6;
  }
  .custom-markdown ul {
    padding-left: 20px;
  }
  .custom-markdown li {
    margin-bottom: 16px;
    position: relative;
  }
  .custom-markdown li:before {
    content: "";
    position: absolute;
    left: -20px;
    top: 10px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: ${THEME.colors.primary};
  }
  .spinner {
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top: 3px solid ${THEME.colors.primary};
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 20px auto;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Component for Action Button
const ActionButton: React.FC<ButtonProps> = ({
  onClick,
  children,
  style = {},
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
};

// Component for Tab
const Tab: React.FC<TabProps> = ({ id, activeId, onClick, children }) => {
  const isActive = id === activeId;

  return (
    <div
      style={{
        padding: "12px 18px",
        cursor: "pointer",
        backgroundColor: isActive ? THEME.colors.primaryLight : "transparent",
        borderBottom: isActive ? `3px solid ${THEME.colors.primary}` : "none",
        fontWeight: isActive ? "600" : "normal",
        fontSize: "16px",
        transition: THEME.transitions.default,
        color: isActive ? THEME.colors.heading : THEME.colors.textSecondary,
      }}
      onClick={() => onClick(id)}
    >
      {children}
    </div>
  );
};

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
        setLlmData({
          grantName: result.data.GrantName,
          narrative: result.data.ProjectNarrativeSections.map(
            (section) => `- **${section.item}**: ${section.description}`
          ).join("\n"),
          eligibility: result.data.EligibilityCriteria.map(
            (criterion) => `- **${criterion.item}**: ${criterion.description}`
          ).join("\n"),
          documents: result.data.RequiredDocuments.map(
            (doc) => `- **${doc.item}**: ${doc.description}`
          ).join("\n"),
          deadlines: result.data.KeyDeadlines.map(
            (deadline) => `- **${deadline.item}**: ${deadline.description}`
          ).join("\n"),
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
        "The following sections must be included in the project narrative. Navigate to the chatbot through the toolbar for help crafting a narrative draft.",
      content: llmData.narrative,
    },
    deadlines: {
      title: "Note the following key deadlines for this grant.",
      content: llmData.deadlines,
    },
  };

  // Render tab content
  const renderTabContent = () => {
    const currentTab = tabContents[activeTabId];
    if (!currentTab) return null;

    return (
      <div style={styles.contentArea}>
        <p style={styles.paragraph}>{currentTab.title}</p>
        <div style={styles.markdownContainer}>
          <ReactMarkdown className="custom-markdown">
            {currentTab.content}
          </ReactMarkdown>
        </div>
      </div>
    );
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
                  ***Use the tabs below to navigate through each section.
                </p>
              </div>
              <div style={styles.buttonContainer}>
                <ActionButton onClick={() => navigate(linkUrl)}>
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
                >
                  Go to Document Editor
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
                >
                  Eligibility Criteria
                </Tab>
                <Tab
                  id="documents"
                  activeId={activeTabId}
                  onClick={handleTabClick}
                >
                  Required Documents
                </Tab>
                <Tab
                  id="narrative"
                  activeId={activeTabId}
                  onClick={handleTabClick}
                >
                  Project Narrative Components
                </Tab>
                <Tab
                  id="deadlines"
                  activeId={activeTabId}
                  onClick={handleTabClick}
                >
                  Key Deadlines
                </Tab>
              </div>
              <div style={styles.tabContent}>{renderTabContent()}</div>
            </div>
            <p
              style={{
                ...styles.paragraph,
                fontStyle: "italic",
                marginTop: "20px",
                marginBottom: "50px",
              }}
            >
              ***When you're ready, use the buttons at the top to navigate to
              the chatbot for interactive help or the document editor to start
              drafting your project proposal.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Checklists;

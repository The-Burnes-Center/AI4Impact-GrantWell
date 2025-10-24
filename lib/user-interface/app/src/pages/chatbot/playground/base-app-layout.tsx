import React, { useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  List,
  CheckSquare,
  Edit,
} from "lucide-react";

interface BaseAppLayoutProps {
  header: React.ReactNode;
  content: React.ReactNode;
  info?: React.ReactNode;
  toolsOpenExternal?: boolean;
  onToolsOpenChange?: (isOpen: boolean) => void;
  documentIdentifier?: string;
  toolsWidth?: number;
  sessionId?: string | null;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
  },
  mainContainer: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  contentArea: {
    flex: 1,
    overflow: "auto",
    height: "100%",
  },
  toolsPanel: {
    height: "100%",
    overflow: "hidden",
    borderLeft: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
  },
  sidebar: {
    backgroundColor: "#0f1b2a",
    color: "white",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.3s ease",
    overflow: "hidden",
    borderRight: "1px solid #1f3b5a",
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    zIndex: 100,
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
    color: "#a3b5d0",
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
    color: "#a3b5d0",
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
}: BaseAppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();

  // Use the sessionId from props, or fall back to URL params if not provided
  const currentSessionId = sessionId || params.sessionId;

  // Handle chat navigation with proper logic
  const handleChatNavigation = () => {
    if (currentSessionId) {
      // If we have a session ID, navigate to that session
      const queryParams = documentIdentifier
        ? `?folder=${encodeURIComponent(documentIdentifier)}`
        : "";
      navigate(`/chatbot/playground/${currentSessionId}${queryParams}`);
    } else if (location.pathname.includes("/sessions")) {
      // If we're on the sessions page without a selected session,
      // generate a new session ID and navigate to it
      const newSessionId = uuidv4();
      const queryParams = documentIdentifier
        ? `?folder=${encodeURIComponent(documentIdentifier)}`
        : "";
      navigate(`/chatbot/playground/${newSessionId}${queryParams}`);
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
    <div style={styles.container}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div
          style={{
            ...styles.sidebar,
            ...(sidebarOpen ? styles.sidebarExpanded : styles.sidebarCollapsed),
          }}
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

              <button
                onClick={handleChatNavigation}
                style={{
                  ...styles.navButton,
                  ...(activeTab === "chat" ? styles.navButtonActive : {}),
                }}
              >
                <MessageSquare size={20} />
                {sidebarOpen && <span style={styles.navLinkText}>Chat</span>}
              </button>

              <button
                onClick={() => {
                  const queryParams = documentIdentifier
                    ? `?folder=${encodeURIComponent(documentIdentifier)}`
                    : "";
                  navigate(`/chatbot/sessions${queryParams}`);
                }}
                style={{
                  ...styles.navButton,
                  ...(activeTab === "sessions" ? styles.navButtonActive : {}),
                }}
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
              >
                <Edit size={20} />
                {sidebarOpen && (
                  <span style={styles.navLinkText}>Write Application</span>
                )}
              </button>

              <button
                onClick={() =>
                  navigate(
                    `/landing-page/basePage/checklists/${
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
            marginLeft: sidebarOpen ? "240px" : "72px",
            transition: "margin-left 0.3s ease",
            width: "calc(100% - " + (sidebarOpen ? "240px" : "72px") + ")",
          }}
        >
          {/* Header area */}
          {header}

          {/* Main content area */}
          <div style={styles.mainContainer}>
            {/* Primary content */}
            <div style={styles.contentArea}>{content}</div>

            {/* Tools/help panel - conditionally rendered based on toolsOpenExternal */}
            {toolsOpenExternal && info && (
              <div
                style={{
                  ...styles.toolsPanel,
                  width: toolsWidth,
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

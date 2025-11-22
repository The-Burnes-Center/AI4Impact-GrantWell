import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { MessageSquare, Edit } from "lucide-react";

interface NavigationProps {
  documentIdentifier?: string;
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
    height: "100vh",
    position: "fixed",
    zIndex: 100,
    top: 0,
    left: 0,
    width: "240px",
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
}: NavigationProps) {
  const [recentlyViewedNOFOs, setRecentlyViewedNOFOs] = useState<any[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  // Load recently viewed NOFOs from localStorage
  useEffect(() => {
    const storedHistory =
      JSON.parse(localStorage.getItem("recentlyViewedNOFOs")) || [];
    setRecentlyViewedNOFOs(storedHistory);
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
      }}
    >
      {/* Sidebar header */}
      <div
        style={{
          ...styles.sidebarHeader,
          justifyContent: "center",
        }}
      >
        <div style={{ fontWeight: "bold", fontSize: "16px" }}>Navigation</div>
      </div>

      {/* Navigation links */}
      <div style={styles.navContainer}>
        <div>
          <div style={styles.sectionHeader}>
            <span>Menu</span>
          </div>

          <button
            onClick={handleChatNavigation}
            style={{
              ...styles.navButton,
              ...(activeTab === "chat" ? styles.navButtonActive : {}),
            }}
          >
            <MessageSquare size={20} />
            <span style={styles.navLinkText}>Chat with AI</span>
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
            <span style={styles.navLinkText}>Write Application</span>
          </button>
        </div>

        {/* Recently Viewed NOFOs Section */}
        {recentlyViewedNOFOs.length > 0 && (
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

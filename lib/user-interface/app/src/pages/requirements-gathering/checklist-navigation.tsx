import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { ChevronLeft, ChevronRight, MessageSquare, Edit } from "lucide-react";

interface NavigationProps {
  documentIdentifier?: string;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
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
  recentlyViewedSection: {
    marginTop: "20px",
  },
};

export default function RequirementsNavigation({
  documentIdentifier,
  sidebarOpen,
  onSidebarToggle,
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
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>Navigation</div>
        )}
        <button style={styles.sidebarToggle} onClick={onSidebarToggle}>
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
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
            {sidebarOpen && (
              <span style={styles.navLinkText}>Chat / Ask AI</span>
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
              <span style={styles.navLinkText}>Grant Application</span>
            )}
          </button>
        </div>

        {/* Recently Viewed NOFOs Section */}
        {sidebarOpen && recentlyViewedNOFOs.length > 0 && (
          <div style={styles.recentlyViewedSection}>
            <div style={styles.sectionHeader}>
              <span>Recently Viewed</span>
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

import React, { useState } from "react";

interface DocumentNavigationProps {
  documentIdentifier?: string;
  currentStep: string;
  onNavigate: (step: string) => void;
}

const DocumentNavigation: React.FC<DocumentNavigationProps> = ({
  documentIdentifier,
  currentStep,
  onNavigate,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Handle chat navigation
  const handleChatNavigation = () => {
    // Mock navigation to chat feature
    console.log("Navigating to chat with document:", documentIdentifier);
  };

  return (
    <div
      style={{
        width: sidebarOpen ? "240px" : "60px",
        background: "#1a202c",
        color: "white",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        borderRight: "1px solid #23272f",
        transition: "width 0.3s ease",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #2d3748",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {sidebarOpen && (
          <div style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
            Navigation
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
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
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "20px",
              height: "20px",
              stroke: "currentColor",
              fill: "none",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          >
            {sidebarOpen ? (
              <path d="M15 18l-6-6 6-6"></path>
            ) : (
              <path d="M9 18l6-6-6-6"></path>
            )}
          </svg>
        </button>
      </div>

      <div
        style={{
          flex: 1,
          padding: "16px 0",
          overflowY: "auto",
        }}
      >
        <div>
          {sidebarOpen && (
            <div
              style={{
                padding: "0 16px 8px 16px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#a0aec0",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Menu
            </div>
          )}

          <button
            onClick={handleChatNavigation}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "8px",
              background: currentStep === "chat" ? "#2563eb" : "none",
              color: currentStep === "chat" ? "white" : "#cbd5e1",
              border: "none",
              fontSize: "16px",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
              textAlign: "left",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{
                width: "20px",
                height: "20px",
                stroke: "currentColor",
                fill: "none",
                strokeWidth: 2,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            {sidebarOpen && (
              <span style={{ marginLeft: "12px" }}>Chat / Ask AI</span>
            )}
          </button>

          <button
            onClick={() => {}}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "8px",
              background: currentStep === "requirements" ? "#2563eb" : "none",
              color: currentStep === "requirements" ? "white" : "#cbd5e1",
              border: "none",
              fontSize: "16px",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
              textAlign: "left",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{
                width: "20px",
                height: "20px",
                stroke: "currentColor",
                fill: "none",
                strokeWidth: 2,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="9" x2="15" y2="9"></line>
              <line x1="9" y1="12" x2="15" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            {sidebarOpen && (
              <span style={{ marginLeft: "12px" }}>Key Requirements</span>
            )}
          </button>
        </div>

        {/* Only show these navigation items when in document creation flow */}
        {currentStep !== "welcome" && (
          <div style={{ marginTop: "24px" }}>
            {sidebarOpen && (
              <div
                style={{
                  padding: "0 16px 8px 16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#a0aec0",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Current Document
              </div>
            )}

            <button
              onClick={() => onNavigate("projectBasics")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "8px",
                background:
                  currentStep === "projectBasics" ? "#2563eb" : "none",
                color: currentStep === "projectBasics" ? "white" : "#cbd5e1",
                border: "none",
                fontSize: "16px",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
                textAlign: "left",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: "20px",
                  height: "20px",
                  stroke: "currentColor",
                  fill: "none",
                  strokeWidth: 2,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                }}
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              {sidebarOpen && (
                <span style={{ marginLeft: "12px" }}>Project Basics</span>
              )}
            </button>

            {[
              "questionnaire",
              "draftCreated",
              "sectionEditor",
              "reviewApplication",
            ].includes(currentStep) && (
              <button
                onClick={() => onNavigate("questionnaire")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background:
                    currentStep === "questionnaire" ? "#2563eb" : "none",
                  color: currentStep === "questionnaire" ? "white" : "#cbd5e1",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  style={{
                    width: "20px",
                    height: "20px",
                    stroke: "currentColor",
                    fill: "none",
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                {sidebarOpen && (
                  <span style={{ marginLeft: "12px" }}>Questionnaire</span>
                )}
              </button>
            )}

            {["sectionEditor", "reviewApplication"].includes(currentStep) && (
              <button
                onClick={() => onNavigate("sectionEditor")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background:
                    currentStep === "sectionEditor" ? "#2563eb" : "none",
                  color: currentStep === "sectionEditor" ? "white" : "#cbd5e1",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  style={{
                    width: "20px",
                    height: "20px",
                    stroke: "currentColor",
                    fill: "none",
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                {sidebarOpen && (
                  <span style={{ marginLeft: "12px" }}>Section Editor</span>
                )}
              </button>
            )}

            {currentStep === "reviewApplication" && (
              <button
                onClick={() => onNavigate("reviewApplication")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background:
                    currentStep === "reviewApplication" ? "#2563eb" : "none",
                  color:
                    currentStep === "reviewApplication" ? "white" : "#cbd5e1",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  style={{
                    width: "20px",
                    height: "20px",
                    stroke: "currentColor",
                    fill: "none",
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                {sidebarOpen && (
                  <span style={{ marginLeft: "12px" }}>Review</span>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Save button (mobile-friendly) */}
      <div
        style={{
          padding: "16px",
          borderTop: "1px solid #2d3748",
        }}
      >
        <button
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: sidebarOpen ? "center" : "center",
            padding: sidebarOpen ? "10px 16px" : "10px",
            background: "#4361ee",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: sidebarOpen ? "14px" : "0",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "20px",
              height: "20px",
              stroke: "currentColor",
              fill: "none",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              marginRight: sidebarOpen ? "8px" : "0",
            }}
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          {sidebarOpen && "Save Progress"}
        </button>
      </div>
    </div>
  );
};

export default DocumentNavigation;

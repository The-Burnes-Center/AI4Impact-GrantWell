import React from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { addToRecentlyViewed } from "../../utils/recently-viewed-nofos";

interface DocumentNavigationProps {
  documentIdentifier?: string;
  currentStep: string;
  onNavigate: (step: string) => void;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const DocumentNavigation: React.FC<DocumentNavigationProps> = ({
  documentIdentifier,
  currentStep,
  onNavigate,
  isOpen,
  setIsOpen,
}) => {
  const navigate = useNavigate();

  // Handle chat navigation
  const handleChatNavigation = () => {
    const newSessionId = uuidv4();
    const queryParams = documentIdentifier
      ? `?folder=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/chatbot/playground/${newSessionId}${queryParams}`);
  };

  // Handle drafts navigation
  const handleDraftsNavigation = () => {
    const queryParams = documentIdentifier
      ? `?nofo=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/document-editor/drafts${queryParams}`);
  };

  // Handle requirements navigation
  const handleRequirementsNavigation = () => {
    if (documentIdentifier) {
      // Track the NOFO as recently viewed
      addToRecentlyViewed({
        label: documentIdentifier.replace("/", ""), // Remove trailing slash if present
        value: documentIdentifier,
      });

      // Navigate to requirements page - using both path param and query param for compatibility
      // Path param is primary, folder param is for consistency with chatbot navigation
      navigate(
        `/landing-page/basePage/checklists/${encodeURIComponent(
          documentIdentifier
        )}?folder=${encodeURIComponent(documentIdentifier)}`
      );
    } else {
      // If no documentIdentifier, go back to base page
      navigate("/landing-page/basePage");
    }
  };

  return (
    <div
      style={{
        width: isOpen ? "240px" : "60px",
        background: "#1a202c",
        color: "white",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        borderRight: "1px solid #23272f",
        transition: "width 0.3s ease",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 50,
        minHeight: "100%",
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
        {isOpen && (
          <div style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
            Navigation
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Collapse navigation" : "Expand navigation"}
          aria-expanded={isOpen}
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
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
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
            {isOpen ? (
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
          {isOpen && (
            <div
              style={{
                padding: "0 16px 8px 16px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#e2e8f0",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Menu
            </div>
          )}

          <button
            onClick={handleChatNavigation}
            aria-label="Chat with AI"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "8px",
              background: currentStep === "chat" ? "#2563eb" : "none",
              color: currentStep === "chat" ? "white" : "#e2e8f0",
              border: "none",
              fontSize: "16px",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                currentStep === "chat" ? "#2563eb" : "#2d3748")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                currentStep === "chat" ? "#2563eb" : "none")
            }
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
            {isOpen && <span style={{ marginLeft: "12px" }}>Chat with AI</span>}
          </button>

          <button
            onClick={handleDraftsNavigation}
            aria-label="Drafts"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "8px",
              background: currentStep === "drafts" ? "#2563eb" : "none",
              color: currentStep === "drafts" ? "white" : "#e2e8f0",
              border: "none",
              fontSize: "16px",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                currentStep === "drafts" ? "#2563eb" : "#2d3748")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                currentStep === "drafts" ? "#2563eb" : "none")
            }
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            {isOpen && <span style={{ marginLeft: "12px" }}>Drafts</span>}
          </button>

          <button
            onClick={handleRequirementsNavigation}
            aria-label="Requirements"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "8px",
              background: currentStep === "requirements" ? "#2563eb" : "none",
              color: currentStep === "requirements" ? "white" : "#e2e8f0",
              border: "none",
              fontSize: "16px",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                currentStep === "requirements" ? "#2563eb" : "#2d3748")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                currentStep === "requirements" ? "#2563eb" : "none")
            }
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <line x1="10" y1="9" x2="8" y2="9"></line>
            </svg>
            {isOpen && <span style={{ marginLeft: "12px" }}>Requirements</span>}
          </button>
        </div>

        {currentStep !== "drafts" && currentStep !== "welcome" && (
          <div style={{ marginTop: "24px" }}>
            {isOpen && (
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
              aria-label="Project Basics"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "8px",
                background:
                  currentStep === "projectBasics" ? "#2563eb" : "none",
                color: currentStep === "projectBasics" ? "white" : "#e2e8f0",
                border: "none",
                fontSize: "16px",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
                textAlign: "left",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background =
                  currentStep === "projectBasics" ? "#2563eb" : "#2d3748")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background =
                  currentStep === "projectBasics" ? "#2563eb" : "none")
              }
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
              {isOpen && (
                <span style={{ marginLeft: "12px" }}>Project Basics</span>
              )}
            </button>

            {[
              "questionnaire",
              "uploadDocuments",
              "draftCreated",
              "sectionEditor",
              "reviewApplication",
            ].includes(currentStep) && (
              <button
                onClick={() => onNavigate("questionnaire")}
                aria-label="Questionnaire"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background:
                    currentStep === "questionnaire" ? "#2563eb" : "none",
                  color: currentStep === "questionnaire" ? "white" : "#e2e8f0",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "questionnaire" ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "questionnaire" ? "#2563eb" : "none")
                }
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
                {isOpen && (
                  <span style={{ marginLeft: "12px" }}>Questionnaire</span>
                )}
              </button>
            )}

            {[
              "uploadDocuments",
              "draftCreated",
              "sectionEditor",
              "reviewApplication",
            ].includes(currentStep) && (
              <button
                onClick={() => onNavigate("uploadDocuments")}
                aria-label="Upload Documents"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background:
                    currentStep === "uploadDocuments" ? "#2563eb" : "none",
                  color:
                    currentStep === "uploadDocuments" ? "white" : "#cbd5e1",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "uploadDocuments" ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "uploadDocuments" ? "#2563eb" : "none")
                }
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                {isOpen && (
                  <span style={{ marginLeft: "12px" }}>Upload Documents</span>
                )}
              </button>
            )}

            {["sectionEditor", "reviewApplication"].includes(currentStep) && (
              <button
                onClick={() => onNavigate("sectionEditor")}
                aria-label="Section Editor"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background:
                    currentStep === "sectionEditor" ? "#2563eb" : "none",
                  color: currentStep === "sectionEditor" ? "white" : "#e2e8f0",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "sectionEditor" ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "sectionEditor" ? "#2563eb" : "none")
                }
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
                {isOpen && (
                  <span style={{ marginLeft: "12px" }}>Section Editor</span>
                )}
              </button>
            )}

            {currentStep === "reviewApplication" && (
              <button
                onClick={() => onNavigate("reviewApplication")}
                aria-label="Review"
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
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "reviewApplication" ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    currentStep === "reviewApplication" ? "#2563eb" : "none")
                }
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
                {isOpen && <span style={{ marginLeft: "12px" }}>Review</span>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentNavigation;

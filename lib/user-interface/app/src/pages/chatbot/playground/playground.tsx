import React, { useState, useEffect, useContext } from "react";
import BaseAppLayout from "./base-app-layout";
import Chat from "../../../components/chatbot/chat";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { HelpCircle, Upload } from "lucide-react";
import { ApiClient } from "../../../common/api-client/api-client";
import { AppContext } from "../../../common/app-context";
import UploadModal from "../../../components/chatbot/upload-modal";

// Styles for components
const styles: Record<string, React.CSSProperties> = {
  headerContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "white",
  },
  headerTitle: {
    fontSize: "24px",
    fontWeight: 600,
    color: "#111827",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "60%",
    margin: 0,
  },
  headerActions: {
    display: "flex",
    gap: "12px",
  },
  uploadButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "#0073bb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: "44px",
  },
  helpButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "#f3f4f6",
    color: "#374151",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: "44px",
  },
  helpPanel: {
    padding: "20px",
    height: "100%",
    overflowY: "auto",
  },
  helpTitle: {
    color: "#0073bb",
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "16px",
  },
  helpText: {
    color: "#374151",
    marginBottom: "16px",
  },
  helpSubtitle: {
    fontSize: "16px",
    fontWeight: "600",
    marginTop: "20px",
    marginBottom: "8px",
    color: "#0073bb",
  },
  helpList: {
    paddingLeft: "20px",
    marginBottom: "16px",
  },
  helpListItem: {
    marginBottom: "8px",
  },
  helpLink: {
    color: "#0073bb",
    textDecoration: "none",
  },
};

export default function Playground() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");
  const [nofoName, setNofoName] = useState("New NOFO");
  const [isLoading, setIsLoading] = useState(false);
  const appContext = useContext(AppContext);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const navigate = useNavigate();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const modalRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const checkboxRef = React.useRef<HTMLInputElement>(null);
  const gotItButtonRef = React.useRef<HTMLButtonElement>(null);
  const helpButtonRef = React.useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const fetchNofoName = async () => {
      if (!documentIdentifier || !appContext) return;

      setIsLoading(true);
      try {
        const apiClient = new ApiClient(appContext);
        const summaryResult = await apiClient.landingPage.getNOFOSummary(
          documentIdentifier
        );

        if (summaryResult?.data?.GrantName) {
          setNofoName(summaryResult.data.GrantName);
        } else {
          const folderName = documentIdentifier.split("/").pop();
          setNofoName(folderName || "NOFO");
        }
      } catch (error) {
        console.error("Error fetching NOFO name:", error);
        const folderName = documentIdentifier.split("/").pop();
        setNofoName(folderName || "NOFO");
      } finally {
        setIsLoading(false);
      }
    };

    fetchNofoName();
  }, [documentIdentifier, appContext]);

  // Check localStorage and show help modal automatically on first visit
  useEffect(() => {
    const hasSeenPlaygroundHelp = localStorage.getItem("playgroundHelpSeen");
    if (!hasSeenPlaygroundHelp && !isLoading) {
      setHelpOpen(true);
    }
  }, [isLoading]);

  // Focus trapping effect for modal
  useEffect(() => {
    if (!helpOpen) return;

    const modalElement = modalRef.current;
    if (!modalElement) return;

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
        gotItButtonRef.current
      ].filter(Boolean);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) return;

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
    };
  }, [helpOpen]);

  const handleUploadData = () => {
    setUploadModalOpen(true);
  };

  // Handle modal close
  const handleCloseModal = () => {
    if (dontShowAgain) {
      localStorage.setItem("playgroundHelpSeen", "true");
    }
    setHelpOpen(false);
    
    // Restore focus to help button after modal closes
    setTimeout(() => {
      helpButtonRef.current?.focus();
    }, 100);
  };

  return (
    <>
      <BaseAppLayout
        header={
          <div style={styles.headerContainer}>
            <h1 style={styles.headerTitle}>
              {isLoading ? "Loading..." : nofoName}
            </h1>
            <div style={styles.headerActions}>
              {/* Upload Data button - only show if documentIdentifier exists */}
              {documentIdentifier && (
                <button 
                  style={styles.uploadButton} 
                  onClick={handleUploadData}
                  aria-label="Upload supporting documents"
                >
                  <Upload size={16} /> Upload Data
                </button>
              )}
              <button
                ref={helpButtonRef}
                style={styles.helpButton}
                onClick={() => setHelpOpen(!helpOpen)}
                aria-label={helpOpen ? "Close help dialog" : "Open help dialog"}
                aria-expanded={helpOpen}
              >
                <HelpCircle size={16} /> Help
              </button>
            </div>
          </div>
        }
        documentIdentifier={documentIdentifier}
        sessionId={sessionId}
        modalOpen={helpOpen}
        content={
          <div
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
            aria-hidden={helpOpen}
          >
            <Chat sessionId={sessionId} documentIdentifier={documentIdentifier} />
            {/* Upload Modal - only render if documentIdentifier exists */}
            {documentIdentifier && (
              <UploadModal
                isOpen={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
                documentIdentifier={documentIdentifier}
              />
            )}
          </div>
        }
      />

      {/* Help Modal */}
      {helpOpen && (
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
            zIndex: 2000,
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
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              outline: "none",
            }}
          >
            {/* Header */}
            <div
              style={{
                backgroundColor: "#0073BB",
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
                Welcome to GrantWell Chatbot!
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
                  padding: "8px 12px",
                  borderRadius: "4px",
                  lineHeight: "1",
                  transition: "background 0.2s",
                  minWidth: "44px",
                  minHeight: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
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
              <p style={{ 
                marginBottom: "20px", 
                lineHeight: "1.6",
                fontSize: "15px",
                color: "#555",
              }}>
                This AI-powered assistant is your expert guide for understanding a grant. Ask questions about any aspect of the grant application and get instant answers.
              </p>

              {/* Highlighted box */}
              <div style={{
                borderLeft: "4px solid #0073BB",
                backgroundColor: "#F0F7FF",
                padding: "16px 20px",
                marginBottom: "24px",
                borderRadius: "4px",
              }}>
                <p style={{ 
                  margin: 0,
                  marginBottom: "8px",
                  lineHeight: "1.6",
                  fontSize: "15px",
                  color: "#333",
                  fontWeight: 600,
                }}>
                  You can ask GrantWell to:
                </p>
                <ul style={{
                  margin: 0,
                  paddingLeft: "24px",
                  listStyleType: "disc",
                }}>
                  <li style={{ marginBottom: "8px", fontSize: "15px", color: "#333" }}>
                    Explain specific grant requirements, eligibility criteria, and NOFO sections
                  </li>
                  <li style={{ marginBottom: "8px", fontSize: "15px", color: "#333" }}>
                    Review your draft grant narratives and applications for completeness based on evaluation criteria
                  </li>
                  <li style={{ marginBottom: "8px", fontSize: "15px", color: "#333" }}>
                    Assess your organization's eligibility for specific funding opportunities
                  </li>
                  <li style={{ marginBottom: "0", fontSize: "15px", color: "#333" }}>
                    Explain deadlines, submission requirements, budget rules, and compliance requirements
                  </li>
                </ul>
              </div>
              
              {/* Upload Documents section */}
              <div style={{ marginBottom: "20px" }}>
                <p style={{ 
                  margin: 0,
                  marginBottom: "6px",
                  fontSize: "15px",
                  color: "#0073BB",
                  fontWeight: 600,
                }}>
                  Upload Documents
                </p>
                <p style={{ 
                  margin: 0,
                  lineHeight: "1.6",
                  fontSize: "15px",
                  color: "#555",
                }}>
                  Click "Upload Data" to upload supporting documents (mission statements, past projects, organizational charts, etc.) that will help the chatbot provide more contextual and relevant responses.
                </p>
              </div>
              
              {/* Sources section */}
              <div style={{ marginBottom: "20px" }}>
                <p style={{ 
                  margin: 0,
                  marginBottom: "6px",
                  fontSize: "15px",
                  color: "#0073BB",
                  fontWeight: 600,
                }}>
                  Sources
                </p>
                <p style={{ 
                  margin: 0,
                  lineHeight: "1.6",
                  fontSize: "15px",
                  color: "#555",
                }}>
                  If the chatbot references any files from the knowledge base, they will show up underneath the relevant message.
                </p>
              </div>
              
              {/* Session history section */}
              <div style={{ marginBottom: "24px" }}>
                <p style={{ 
                  margin: 0,
                  marginBottom: "6px",
                  fontSize: "15px",
                  color: "#0073BB",
                  fontWeight: 600,
                }}>
                  Session History
                </p>
                <p style={{ 
                  margin: 0,
                  lineHeight: "1.6",
                  fontSize: "15px",
                  color: "#555",
                }}>
                  All conversations are saved and can be accessed later via the <Link to="/chatbot/sessions" style={{ color: "#0073BB", fontWeight: 500 }}>Sessions</Link> page.
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
                  id="dont-show-again-playground"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  style={{
                    marginRight: "10px",
                    cursor: "pointer",
                    width: "18px",
                    height: "18px",
                    accentColor: "#0073BB",
                  }}
                  aria-label="Do not show this again"
                />
                <label
                  htmlFor="dont-show-again-playground"
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
                  backgroundColor: "#0073BB",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "16px",
                  width: "100%",
                  transition: "background 0.2s",
                  minHeight: "44px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#005A94";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#0073BB";
                }}
                aria-label="Close help dialog"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

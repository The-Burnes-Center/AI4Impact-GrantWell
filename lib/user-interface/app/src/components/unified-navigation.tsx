import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { addToRecentlyViewed } from "../common/helpers/recently-viewed-nofos";
import { Home, MessageSquare, FileText, CheckSquare, Upload, LayoutDashboard } from "lucide-react";
import { Auth } from "aws-amplify";

interface UnifiedNavigationProps {
  documentIdentifier?: string;
  currentStep?: string;
  onNavigate?: (step: string) => void;
}

const useViewportWidth = () => {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
};

const UnifiedNavigation: React.FC<UnifiedNavigationProps> = ({
  documentIdentifier,
  currentStep,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const viewportWidth = useViewportWidth();
  const isNarrowViewport = viewportWidth <= 320;
  const [isOpen, setIsOpen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Determine current page/route
  const currentPath = location.pathname;
  const isDocumentEditor = currentPath.startsWith('/document-editor') && currentPath !== '/document-editor/drafts';
  const isRequirements = currentPath.startsWith('/requirements');
  const isChat = currentPath.startsWith('/chat');
  const isDrafts = currentPath === '/document-editor/drafts';
  const isDashboard = currentPath.startsWith('/admin');

  // Get documentIdentifier from various sources
  const docId = documentIdentifier || params.documentIdentifier || searchParams.get('folder') || searchParams.get('nofo');

  // Handle chat navigation
  const handleChatNavigation = () => {
    const newSessionId = uuidv4();
    const queryParams = docId
      ? `?folder=${encodeURIComponent(docId)}`
      : "";
    navigate(`/chat/${newSessionId}${queryParams}`);
  };

  // Handle drafts navigation
  const handleDraftsNavigation = () => {
    if (docId) {
      navigate(`/document-editor/drafts?nofo=${encodeURIComponent(docId)}`);
    } else {
      navigate(`/document-editor/drafts`);
    }
  };

  // Handle requirements navigation
  const handleRequirementsNavigation = () => {
    if (docId) {
      addToRecentlyViewed({
        label: docId.replace("/", ""),
        value: docId,
      });
      navigate(
        `/requirements/${encodeURIComponent(docId)}?folder=${encodeURIComponent(docId)}`
      );
    } else {
      navigate("/home");
    }
  };

  // Handle document editor navigation
  const handleDocumentEditorNavigation = () => {
    if (docId) {
      navigate(`/document-editor?nofo=${encodeURIComponent(docId)}`);
    } else {
      navigate(`/document-editor`);
    }
  };

  // Handle chat sessions navigation
  const handleChatSessionsNavigation = () => {
    const queryParams = docId
      ? `?folder=${encodeURIComponent(docId)}`
      : "";
    navigate(`/chat/sessions${queryParams}`);
  };

  useEffect(() => {
    if (isNarrowViewport && isOpen) {
      setIsOpen(false);
    }
  }, [isNarrowViewport, isOpen]);

  // Check admin permissions on component mount
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        if (result && Object.keys(result).length > 0) {
          const adminRole =
            result?.signInUserSession?.idToken?.payload["custom:role"];
          if (adminRole && adminRole.includes("Admin")) {
            setIsAdmin(true);
          }
        }
      } catch (e) {
        // User not authenticated or error checking admin status
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, []);

  return (
    <>
      {isNarrowViewport && !isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            top: '8px',
            left: '8px',
            zIndex: 1001,
            background: '#1a202c',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          aria-label="Open navigation menu"
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "20px",
              height: "20px",
              stroke: "currentColor",
              fill: "none",
              strokeWidth: 2,
            }}
          >
            <path d="M9 18l6-6-6-6"></path>
          </svg>
        </button>
      )}

      {/* Overlay backdrop for mobile sidebar */}
      {isNarrowViewport && isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
          aria-hidden="true"
        />
      )}

      <div
        style={{
          width: isNarrowViewport 
            ? (isOpen ? "100%" : "0")
            : (isOpen ? "240px" : "60px"),
          background: "#1a202c",
          color: "white",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #23272f",
          transition: "width 0.3s ease, transform 0.3s ease",
          overflow: "hidden",
          ...(isNarrowViewport && {
            position: isOpen ? 'fixed' : 'relative',
            top: isOpen ? 0 : 'auto',
            left: isOpen ? 0 : 'auto',
            right: isOpen ? 0 : 'auto',
            bottom: isOpen ? 0 : 'auto',
            zIndex: isOpen ? 1001 : 'auto',
            maxWidth: isOpen ? '280px' : '0',
            height: isOpen ? '100vh' : '100%',
          }),
          ...(!isNarrowViewport && {
            position: 'sticky',
            top: 0,
            height: "100vh",
            alignSelf: "flex-start",
            overflowY: "auto",
          }),
          flexShrink: 0,
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
            <div style={{ fontWeight: "bold", fontSize: "1.2rem", fontFamily: "'Noto Sans', sans-serif" }}>
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
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#e2e8f0",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  fontFamily: "'Noto Sans', sans-serif",
                }}
              >
                Menu
              </div>
            )}

            {/* Home Button */}
            <button
              onClick={() => navigate("/home")}
              aria-label="Home"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "8px",
                background: "none",
                color: "#e2e8f0",
                border: "none",
                fontSize: "16px",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
                textAlign: "left",
                fontFamily: "'Noto Sans', sans-serif",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#2d3748")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "none")
              }
            >
              <Home size={20} />
              {isOpen && <span style={{ marginLeft: "12px" }}>Home</span>}
            </button>

            {/* Admin Dashboard - only visible to admins */}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/dashboard")}
                aria-label="Admin Dashboard"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background: isDashboard ? "#2563eb" : "none",
                  color: isDashboard ? "white" : "#e2e8f0",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                  fontFamily: "'Noto Sans', sans-serif",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    isDashboard ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    isDashboard ? "#2563eb" : "none")
                }
              >
                <LayoutDashboard size={20} />
                {isOpen && <span style={{ marginLeft: "12px" }}>Admin Dashboard</span>}
              </button>
            )}

            {/* Requirements */}
            {docId && (
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
                  background: isRequirements ? "#2563eb" : "none",
                  color: isRequirements ? "white" : "#e2e8f0",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                  fontFamily: "'Noto Sans', sans-serif",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    isRequirements ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    isRequirements ? "#2563eb" : "none")
                }
              >
                <CheckSquare size={20} />
                {isOpen && <span style={{ marginLeft: "12px" }}>Requirements</span>}
              </button>
            )}

            {/* Chat with AI */}
            <button
              onClick={handleChatNavigation}
              aria-label="Chat with AI"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "4px",
                background: isChat && !isDrafts && currentPath !== "/chat/sessions" ? "#2563eb" : "none",
                color: isChat && !isDrafts && currentPath !== "/chat/sessions" ? "white" : "#e2e8f0",
                border: "none",
                fontSize: "16px",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
                textAlign: "left",
                fontFamily: "'Noto Sans', sans-serif",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background =
                  isChat && !isDrafts && currentPath !== "/chat/sessions" ? "#2563eb" : "#2d3748")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background =
                  isChat && !isDrafts && currentPath !== "/chat/sessions" ? "#2563eb" : "none")
              }
            >
              <MessageSquare size={20} />
              {isOpen && <span style={{ marginLeft: "12px" }}>Chat with AI</span>}
            </button>

            {/* Chat Sessions - nested under Chat with AI */}
            {isOpen && (
              <button
                onClick={handleChatSessionsNavigation}
                aria-label="Chat Sessions"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 16px 8px 44px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background: currentPath === "/chat/sessions" ? "#2563eb" : "none",
                  color: currentPath === "/chat/sessions" ? "white" : "#e2e8f0",
                  border: "none",
                  fontSize: "15px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                  fontFamily: "'Noto Sans', sans-serif",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    currentPath === "/chat/sessions" ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    currentPath === "/chat/sessions" ? "#2563eb" : "none")
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  style={{
                    width: "18px",
                    height: "18px",
                    stroke: "currentColor",
                    fill: "none",
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
                <span style={{ marginLeft: "12px" }}>Chat Sessions</span>
              </button>
            )}

            {/* Write Application / Document Editor */}
            <button
              onClick={handleDocumentEditorNavigation}
              aria-label="Write Application"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "4px",
                marginTop: "8px",
                background: isDocumentEditor ? "#2563eb" : "none",
                color: isDocumentEditor ? "white" : "#e2e8f0",
                border: "none",
                fontSize: "16px",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
                textAlign: "left",
                fontFamily: "'Noto Sans', sans-serif",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background =
                  isDocumentEditor ? "#2563eb" : "#2d3748")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background =
                  isDocumentEditor ? "#2563eb" : "none")
              }
            >
              <Upload size={20} />
              {isOpen && <span style={{ marginLeft: "12px" }}>Write Application</span>}
            </button>

            {/* Drafts - nested under Write Application */}
            {isOpen && (
              <button
                onClick={handleDraftsNavigation}
                aria-label="Drafts"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 16px 8px 44px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  background: isDrafts ? "#2563eb" : "none",
                  color: isDrafts ? "white" : "#e2e8f0",
                  border: "none",
                  fontSize: "15px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                  fontFamily: "'Noto Sans', sans-serif",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    isDrafts ? "#2563eb" : "#2d3748")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    isDrafts ? "#2563eb" : "none")
                }
              >
                <FileText size={18} />
                <span style={{ marginLeft: "12px" }}>Drafts</span>
              </button>
            )}
          </div>

          {/* Document Editor specific steps */}
          {isDocumentEditor && currentStep && onNavigate && currentStep !== "drafts" && currentStep !== "welcome" && (
            <div style={{ marginTop: "24px" }}>
              {isOpen && (
                <div
                  style={{
                    padding: "0 16px 8px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#a0aec0",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontFamily: "'Noto Sans', sans-serif",
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
                  background: currentStep === "projectBasics" ? "#2563eb" : "none",
                  color: currentStep === "projectBasics" ? "white" : "#e2e8f0",
                  border: "none",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  textAlign: "left",
                  fontFamily: "'Noto Sans', sans-serif",
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
                {isOpen && <span style={{ marginLeft: "12px" }}>Project Basics</span>}
              </button>

              {["questionnaire", "uploadDocuments", "draftCreated", "sectionEditor", "reviewApplication"].includes(currentStep) && (
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
                    background: currentStep === "questionnaire" ? "#2563eb" : "none",
                    color: currentStep === "questionnaire" ? "white" : "#e2e8f0",
                    border: "none",
                    fontSize: "16px",
                    cursor: "pointer",
                    transition: "background 0.2s, color 0.2s",
                    textAlign: "left",
                    fontFamily: "'Noto Sans', sans-serif",
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
                  {isOpen && <span style={{ marginLeft: "12px" }}>Questionnaire</span>}
                </button>
              )}

              {["uploadDocuments", "draftCreated", "sectionEditor", "reviewApplication"].includes(currentStep) && (
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
                    background: currentStep === "uploadDocuments" ? "#2563eb" : "none",
                    color: currentStep === "uploadDocuments" ? "white" : "#cbd5e1",
                    border: "none",
                    fontSize: "16px",
                    cursor: "pointer",
                    transition: "background 0.2s, color 0.2s",
                    textAlign: "left",
                    fontFamily: "'Noto Sans', sans-serif",
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
                  {isOpen && <span style={{ marginLeft: "12px" }}>Upload Documents</span>}
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
                    background: currentStep === "sectionEditor" ? "#2563eb" : "none",
                    color: currentStep === "sectionEditor" ? "white" : "#e2e8f0",
                    border: "none",
                    fontSize: "16px",
                    cursor: "pointer",
                    transition: "background 0.2s, color 0.2s",
                    textAlign: "left",
                    fontFamily: "'Noto Sans', sans-serif",
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
                  {isOpen && <span style={{ marginLeft: "12px" }}>Section Editor</span>}
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
                    background: currentStep === "reviewApplication" ? "#2563eb" : "none",
                    color: currentStep === "reviewApplication" ? "white" : "#cbd5e1",
                    border: "none",
                    fontSize: "16px",
                    cursor: "pointer",
                    transition: "background 0.2s, color 0.2s",
                    textAlign: "left",
                    fontFamily: "'Noto Sans', sans-serif",
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
    </>
  );
};

export default UnifiedNavigation;

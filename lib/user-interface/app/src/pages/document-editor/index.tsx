// index.tsx
import React, { useState, useEffect, useCallback, useContext, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import UnifiedNavigation from "../../components/unified-navigation";
import ProjectBasics from "./ProjectBasics";
import QuickQuestionnaire from "./QuickQuestionnaire";
import DraftView from "./DraftView";
import SectionEditor from "./SectionsEditor";
import ReviewApplication from "./ReviewApplication";
import UploadDocuments from "./UploadDocuments";
import { Modal } from "../../components/common/Modal";
import "../../styles/document-editor.css";
import ProgressStepper from "../../components/document-editor/ProgressStepper";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { DraftsClient, DocumentDraft, DraftStatus } from "../../common/api-client/drafts-client";
import { Utils } from "../../common/utils";

// Types
interface DocumentData {
  id: string;
  nofoId: string;
  sections: Record<string, any>;
  projectBasics?: any;
  questionnaire?: any;
  lastModified: string;
}

interface ProjectBasics {
  title: string;
  description: string;
  // Add other project basic fields as needed
}

// Constants
const ERROR_MESSAGES = {
  LOAD_FAILED: "Failed to load document data",
  SAVE_FAILED: "Failed to save document data",
  NO_NOFO: "No NOFO selected",
  START_FAILED: "Failed to start new document",
} as const;

const stepToStatus = (step: string): string => {
  const stepMap: Record<string, string> = {
    'projectBasics': 'project_basics',
    'questionnaire': 'questionnaire',
    'uploadDocuments': 'questionnaire',
    'draftCreated': 'editing_sections',
    'sectionEditor': 'editing_sections',
    'reviewApplication': 'editing_sections'
  };
  return stepMap[step] || 'project_basics';
};

const statusToStep = (status: string): string => {
  const statusMap: Record<string, string> = {
    'project_basics': 'projectBasics',
    'questionnaire': 'questionnaire',
    'uploading_documents': 'uploadDocuments',
    'generating_draft': 'draftCreated',
    'editing_sections': 'sectionEditor',
    'reviewing': 'reviewApplication',
    'submitted': 'reviewApplication'
  };
  return statusMap[status] || 'projectBasics';
};

// Custom hooks
const useDocumentStorage = (nofoId: string | null, onStepRestore?: (step: string) => void) => {
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("Loading document editor...");
  const [error, setError] = useState<string | null>(null);
  const { sessionId } = useParams();
  const appContext = useContext(AppContext);

  const loadDocument = useCallback(async () => {
    if (!nofoId || !sessionId || !appContext) return;

    setIsLoading(true);
    setError(null);
    setLoadingMessage("Loading document editor...");

    // Focus management: Move focus to loading region for screen readers
    const loadingRegion = document.getElementById('document-loading-region');
    if (loadingRegion) {
      loadingRegion.focus();
    }

    try {
      // Load from database
      const draftsClient = new DraftsClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;
      
      if (username) {
        const draft = await draftsClient.getDraft({
          sessionId: sessionId,
          userId: username,
          onProgress: (message: string, attempt: number, maxAttempts: number) => {
            setLoadingMessage(message);
            // Show timeout warning after 30 seconds (15 attempts)
            if (attempt === 15) {
              setLoadingMessage("Draft generation is taking longer than expected. Please wait...");
            }
            // Show final warning after 1 minute (30 attempts)
            if (attempt === 30) {
              setLoadingMessage("Draft generation is still in progress. This may take up to 2 minutes...");
            }
          }
        });

        if (draft) {
          setDocumentData({
            id: draft.sessionId,
            nofoId: draft.documentIdentifier,
            sections: draft.sections || {},
            projectBasics: draft.projectBasics,
            questionnaire: draft.questionnaire,
            lastModified: draft.lastModified || new Date().toISOString(),
          });
          // Restore current step from draft status if available
          if (draft.status && onStepRestore) {
            const stepFromStatus = statusToStep(draft.status);
            onStepRestore(stepFromStatus);
          }
          setLoadingMessage("Document loaded successfully!");
        } else {
          setDocumentData({
            id: sessionId,
            nofoId: nofoId,
            sections: {},
            lastModified: new Date().toISOString(),
          });
          setLoadingMessage("Starting new document...");
        }
      }
    } catch (error) {
      console.error('Failed to load document:', error);
      setError(ERROR_MESSAGES.LOAD_FAILED);
      setLoadingMessage("Failed to load document");
    } finally {
      setIsLoading(false);
    }
  }, [nofoId, sessionId, appContext, onStepRestore]);

  const saveDocument = useCallback(
    async (data: Partial<DocumentData>) => {
      if (!nofoId || !sessionId || !documentData || !appContext) return false;

      try {
        const updatedData = {
          ...documentData,
          ...data,
          lastModified: new Date().toISOString(),
        };

        // Save to database
        const draftsClient = new DraftsClient(appContext);
        const username = (await Auth.currentAuthenticatedUser()).username;
        
        if (username) {
          await draftsClient.updateDraft({
            sessionId: sessionId,
            userId: username,
            title: `Application for ${nofoId}`,
            documentIdentifier: nofoId,
            sections: updatedData.sections,
            projectBasics: updatedData.projectBasics,
            questionnaire: updatedData.questionnaire,
            lastModified: updatedData.lastModified,
          });
        }

        setDocumentData(updatedData);
        return true;
      } catch (err) {
        setError(ERROR_MESSAGES.SAVE_FAILED);
        console.error(ERROR_MESSAGES.SAVE_FAILED, err);
        return false;
      }
    },
    [nofoId, sessionId, documentData, appContext]
  );

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  return { documentData, setDocumentData, isLoading, loadingMessage, error, setError };
};

// Main Component
// Function to get brand banner + MDS header height dynamically
// Note: Headers are now static, so this is only used for minHeight calculations
const getTopOffset = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  const mdsHeaderElement = document.querySelector(".ma__header_slim");
  
  let bannerHeight = 40; // Default fallback
  let mdsHeaderHeight = 60; // Default fallback (typical MDS header height)
  
  if (bannerElement) {
    bannerHeight = bannerElement.getBoundingClientRect().height;
  }
  
  if (mdsHeaderElement) {
    mdsHeaderHeight = mdsHeaderElement.getBoundingClientRect().height;
  }
  
  return bannerHeight + mdsHeaderHeight;
};

const DocumentEditor: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<string>("projectBasics");
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [nofoName, setNofoName] = useState<string>("");
  const [isNofoLoading, setIsNofoLoading] = useState(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const [topOffset, setTopOffset] = useState<number>(100); // Default: 40px banner + 60px MDS header
  const appContext = useContext(AppContext);
  const navigate = useNavigate();
  const { sessionId } = useParams();
  
  // Refs for buttons (used by modal for focus management)
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const draftsButtonRef = useRef<HTMLButtonElement>(null);

  const { documentData, setDocumentData, isLoading, loadingMessage, error, setError } = useDocumentStorage(selectedNofo, setCurrentStep);

  // Monitor brand banner + MDS header height changes (for minHeight calculations only)
  useEffect(() => {
    const updateTopOffset = () => {
      requestAnimationFrame(() => {
        const offset = getTopOffset();
        setTopOffset(offset);
      });
    };

    // Initial calculation with a small delay to ensure headers are rendered
    const timer = setTimeout(updateTopOffset, 100);
    updateTopOffset();

    // Watch for changes
    const observer = new MutationObserver(updateTopOffset);
    const bannerElement = document.querySelector(".ma__brand-banner");
    const mdsHeaderElement = document.querySelector(".ma__header_slim");
    
    if (bannerElement) {
      observer.observe(bannerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    if (mdsHeaderElement) {
      observer.observe(mdsHeaderElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    window.addEventListener("resize", updateTopOffset);
    window.addEventListener("scroll", updateTopOffset, { passive: true });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", updateTopOffset);
      window.removeEventListener("scroll", updateTopOffset);
    };
  }, []);


  // Extract NOFO and step from URL parameters and handle session
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const nofo = searchParams.get("nofo");
    const stepFromUrl = searchParams.get("step");
    
    if (nofo) {
      setSelectedNofo(decodeURIComponent(nofo));
    }

    // Set the current step if it's a valid step
    if (stepFromUrl && ["projectBasics", "questionnaire", "uploadDocuments", "draftCreated", "sectionEditor", "reviewApplication"].includes(stepFromUrl)) {
      setCurrentStep(stepFromUrl);
    } else {
      // Default to projectBasics
      setCurrentStep("projectBasics");
    }
  }, [window.location.search]);

  // Show welcome modal automatically only when starting a new document (no sessionId and no step parameter)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const stepFromUrl = searchParams.get("step");
    
    // Only show welcome modal if:
    // 1. Not loading
    // 2. No sessionId (new session)
    // 3. No step parameter in URL (not navigating to a specific step)
    if (!isLoading && !sessionId && !stepFromUrl) {
      setWelcomeModalOpen(true);
    } else {
      // If there's a sessionId or step parameter, don't show the welcome modal
      setWelcomeModalOpen(false);
    }
  }, [isLoading, sessionId]);


  // Create new document flow
  const startNewDocument = useCallback(async () => {
    if (!selectedNofo || !appContext) {
      return;
    }
    
    try {
      localStorage.removeItem('projectBasics');
      localStorage.removeItem('questionnaire');
      
      // Generate new session ID when starting a new document
      const newSessionId = uuidv4();
      
      // Create a new draft in the database
      const draftsClient = new DraftsClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;
      
      if (username) {
        await draftsClient.createDraft({
          sessionId: newSessionId,
          userId: username,
          title: `Application for ${selectedNofo}`,
          documentIdentifier: selectedNofo,
          sections: {},
          projectBasics: {}, // Initialize empty project basics
          questionnaire: {},
          status: 'project_basics', // Initial status when starting
          lastModified: Utils.getCurrentTimestamp(),
        });
      }

      // Navigate to project basics step with the new session ID and nofo
      setCurrentStep("projectBasics"); // Set the step in state
      navigate(`/document-editor/${newSessionId}?step=projectBasics&nofo=${encodeURIComponent(selectedNofo)}`);
    } catch (error) {
      console.error('Failed to start new document:', error);
      setError(ERROR_MESSAGES.START_FAILED);
    }
  }, [selectedNofo, appContext, navigate]);

  // Handle navigation through document creation flow
  const navigateToStep = async (step: string) => {
    if (!documentData || !appContext) {
      // If no document data, just navigate without saving
      const nofoParam = selectedNofo ? `&nofo=${encodeURIComponent(selectedNofo)}` : '';
      navigate(`/document-editor/${sessionId}?step=${step}${nofoParam}`);
      return;
    }

    try {
      // Only save if we have new data to save
      if (Object.keys(documentData).length > 0) {
        const draftsClient = new DraftsClient(appContext);
        const username = (await Auth.currentAuthenticatedUser()).username;
        
        if (username && sessionId) {
          // Get current draft to preserve existing sections
          const currentDraft = await draftsClient.getDraft({
            sessionId: sessionId,
            userId: username
          });

          await draftsClient.updateDraft({
            sessionId: sessionId,
            userId: username,
            title: `Application for ${selectedNofo}`,
            documentIdentifier: selectedNofo || '',
            sections: {
              ...currentDraft?.sections,  // Preserve existing sections
              ...documentData.sections    // Add any new sections
            },
            projectBasics: documentData.projectBasics || currentDraft?.projectBasics,
            questionnaire: documentData.questionnaire || currentDraft?.questionnaire,
            status: stepToStatus(step) as DraftStatus, // Save unified status based on step
            lastModified: Utils.getCurrentTimestamp(),
          });
        }
      }

      // Update current step in state
      setCurrentStep(step);

      // Navigate to the next step
      const nofoParam = selectedNofo ? `&nofo=${encodeURIComponent(selectedNofo)}` : '';
      navigate(`/document-editor/${sessionId}?step=${step}${nofoParam}`);
    } catch (error) {
      console.error('Failed to navigate to step:', error);
      setError(ERROR_MESSAGES.SAVE_FAILED);
    }
  };

  // Handle save progress
  const handleSaveProgress = useCallback(async () => {
    if (!documentData || !appContext) return;

    try {
      // Save to database
      const draftsClient = new DraftsClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;
      
        if (username && sessionId) {
          await draftsClient.updateDraft({
            sessionId: sessionId,
            userId: username,
            title: `Application for ${selectedNofo}`,
            documentIdentifier: selectedNofo || '',
            sections: documentData.sections,
            projectBasics: documentData.projectBasics,
            questionnaire: documentData.questionnaire,
            status: stepToStatus(currentStep) as DraftStatus, // Save unified status
          });
        }
    } catch (error) {
      console.error('Failed to save progress:', error);
      setError(ERROR_MESSAGES.SAVE_FAILED);
    }
  }, [documentData, appContext, sessionId, selectedNofo]);

  // Fetch NOFO details
  useEffect(() => {
    const fetchNofoName = async () => {
      if (!selectedNofo) return;
      setIsNofoLoading(true);

      try {
        // Use API client to fetch NOFO details
        if (appContext && selectedNofo) {
          const apiClient = new ApiClient(appContext);
          const documentId = selectedNofo;
          const result = await apiClient.landingPage.getNOFOSummary(documentId);

          // Set the name from the API response
          if (result && result.data && result.data.GrantName) {
            setNofoName(result.data.GrantName);
          } else {
            // Fallback if API doesn't return a name
            setNofoName("Grant Application");
          }
        } else {
          // Fallback if context or selectedNofo not available
          setNofoName("Grant Application");
        }

        setIsNofoLoading(false);
      } catch (error) {
        console.error("Error fetching NOFO details:", error);
        setNofoName("Grant Application");
        setIsNofoLoading(false);
      }
    };

    fetchNofoName();
  }, [selectedNofo, appContext]);

  // Render current step based on flow
  const renderCurrentStep = () => {
    switch (currentStep) {
      case "projectBasics":
        return (
          <ProjectBasics
            onContinue={() => navigateToStep("questionnaire")}
            selectedNofo={selectedNofo}
            documentData={documentData}
            onUpdateData={async (data) => {
              if (documentData) {
                const updatedData = {
                  ...documentData,
                  ...data
                };
                setDocumentData(updatedData);
                
                try {
                  const draftsClient = new DraftsClient(appContext);
                  const username = (await Auth.currentAuthenticatedUser()).username;
                  
                  if (username && sessionId && selectedNofo) {
                    await draftsClient.updateDraft({
                      sessionId: sessionId,
                      userId: username,
                      title: `Application for ${selectedNofo}`,
                      documentIdentifier: selectedNofo,
                      sections: updatedData.sections || {},
                      projectBasics: updatedData.projectBasics,
                      questionnaire: updatedData.questionnaire,
                      status: stepToStatus(currentStep) as DraftStatus, // Save unified status
                      lastModified: new Date().toISOString(),
                    });
                  }
                } catch (error) {
                  console.error('Failed to auto-save project basics:', error);
                }
              }
            }}
          />
        );
      case "questionnaire":
        return (
          <QuickQuestionnaire
            onContinue={() => navigateToStep("uploadDocuments")}
            selectedNofo={selectedNofo}
            onNavigate={navigateToStep}
            documentData={documentData}
            onUpdateData={async (data) => {
              if (documentData) {
                const updatedData = {
                  ...documentData,
                  ...data
                };
                setDocumentData(updatedData);
                
                // Auto-save to database
                try {
                  const draftsClient = new DraftsClient(appContext);
                  const username = (await Auth.currentAuthenticatedUser()).username;
                  
                  if (username && sessionId && selectedNofo) {
                    await draftsClient.updateDraft({
                      sessionId: sessionId,
                      userId: username,
                      title: `Application for ${selectedNofo}`,
                      documentIdentifier: selectedNofo,
                      sections: updatedData.sections || {},
                      projectBasics: updatedData.projectBasics,
                      questionnaire: updatedData.questionnaire,
                      status: stepToStatus(currentStep) as DraftStatus, // Save unified status
                      lastModified: new Date().toISOString(),
                    });
                  }
                } catch (error) {
                  console.error('Failed to auto-save questionnaire:', error);
                  // Don't show error to user for auto-save failures
                }
              }
            }}
          />
        );
      case "uploadDocuments":
        return (
          <UploadDocuments
            onContinue={() => navigateToStep("draftCreated")}
            selectedNofo={selectedNofo}
            onNavigate={navigateToStep}
            sessionId={sessionId || ''}
            documentData={documentData}
          />
        );
      case "draftCreated":
        return (
          <div style={{ minHeight: "60vh", background: "#f7fafc" }}>
            <DraftView
              onStartEditing={() => navigateToStep("sectionEditor")}
              selectedNofo={selectedNofo}
              sessionId={sessionId || ''}
            />
          </div>
        );
      case "sectionEditor":
        return (
          <SectionEditor
            onContinue={() => navigateToStep("reviewApplication")}
            selectedNofo={selectedNofo}
            sessionId={sessionId || ''}
            onNavigate={navigateToStep}
          />
        );
      case "reviewApplication":
        return (
          <ReviewApplication
            onExport={() => alert("Application exported!")}
            selectedNofo={selectedNofo}
            sessionId={sessionId || ''}
            onNavigate={navigateToStep}
          />
        );
      default:
        return <div>Welcome to GrantWell</div>;
    }
  };

  const steps = [
    {
      id: "projectBasics",
      label: "Project Basics",
      description: "Basic information",
      tooltip: "Enter your project name, organization details, requested amount, location, and contact information.",
    },
    {
      id: "questionnaire",
      label: "Questionnaire",
      description: "Answer questions",
      tooltip: "Answer NOFO-specific questions about your project. These responses will help generate your grant application.",
    },
    {
      id: "uploadDocuments",
      label: "Additional Information",
      description: "Additional context",
      tooltip: "Share any additional context or information that will help generate your grant application.",
    },
    {
      id: "sectionEditor",
      label: "Section Editor",
      description: "Edit sections",
      tooltip: "Review and edit AI-generated narrative sections. You can regenerate individual sections or edit them directly.",
    },
    {
      id: "reviewApplication",
      label: "Review",
      description: "Final review",
      tooltip: "Review your complete application, check compliance, and export as PDF when ready.",
    },
  ];
  const activeStep = (() => {
    switch (currentStep) {
      case "projectBasics":
        return 0;
      case "questionnaire":
        return 1;
      case "uploadDocuments":
        return 2;
      case "sectionEditor":
        return 3;
      case "reviewApplication":
        return 4;
      default:
        return 0;
    }
  })();

  if (error) {
    return (
      <div style={{ padding: "20px", color: "#e53e3e", textAlign: "center" }}>
        <p>Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            background: "#0088FF",
            color: "white",
            border: "none",
            borderRadius: "4px",
            marginTop: "12px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate header height for sticky positioning
  // Header has padding 16px top + 16px bottom = 32px, plus h1 height (~30px) = ~62px
  const headerHeight = 62; // Height of document-editor-header
  const stepperTop = headerHeight; // ProgressStepper sits right below header

  return (
    <div
      className="document-editor-root"
      style={{
        display: "flex",
        alignItems: "stretch",
        minHeight: `calc(100vh - ${topOffset}px)`,
        position: "static",
        width: "100%",
        margin: 0,
        padding: 0,
      }}
    >
      <nav aria-label="Document editor navigation" style={{ flexShrink: 0 }}>
        <UnifiedNavigation
          documentIdentifier={selectedNofo}
          currentStep={currentStep}
          onNavigate={navigateToStep}
        />
      </nav>

      <div
        className="document-content"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          margin: 0,
          padding: 0,
        }}
      >
        {/* Only show header, progress stepper and form content if welcome modal is closed */}
        {!welcomeModalOpen && (
          <>
            <div
              className="document-editor-header"
              style={{
                background: "#fff",
                borderBottom: "1px solid #e5e7eb",
                width: "100%",
                maxWidth: "100%",
                position: "sticky",
                top: 0,
                zIndex: 101,
                overflow: "hidden",
                boxSizing: "border-box",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              }}
            >
              <div
                className="document-editor-header-inner"
                style={{
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    marginBottom: "0",
                    minWidth: 0,
                  }}
                >
                  <h1
                    className="document-editor-nofo-title"
                    style={{
                      marginBottom: "0",
                      textAlign: "left",
                      fontSize: "22px",
                      fontWeight: "600",
                      width: "100%",
                      maxWidth: "100%",
                      wordWrap: "break-word",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                      lineHeight: "1.4",
                    }}
                  >
                    {isNofoLoading ? "Loading..." : nofoName || "Grant Application"}
                  </h1>
                </div>
              </div>
            </div>

            <ProgressStepper
              steps={steps}
              activeStep={activeStep}
              isStepClickable={(stepIndex) => {
                const hasSections = documentData?.sections && Object.keys(documentData.sections).length > 0;
                
                if (stepIndex <= activeStep) {
                  return true;
                } else if (stepIndex === activeStep + 1) {
                  if (stepIndex === 3 || stepIndex === 4) {
                    return hasSections;
                  } else {
                    return true;
                  }
                }
                return false;
              }}
              onStepClick={(stepIndex) => {
                const stepId = steps[stepIndex].id;
                navigateToStep(stepId);
              }}
              completedSteps={Array.from({ length: activeStep }, (_, i) => i)}
              showProgress={true}
            />

            <div
              className="document-editor-workspace"
              style={{ flex: 1, padding: "20px", paddingBottom: "20px" }}
            >
              {isLoading ? (
                <div
                  id="document-loading-region"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  aria-label="Loading document editor"
                  tabIndex={-1}
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "60vh",
                  }}
                >
                  <div style={{ textAlign: "center", maxWidth: "400px" }}>
                    <div
                      role="img"
                      aria-label="Loading spinner"
                      style={{
                        width: "40px",
                        height: "40px",
                        border: "4px solid #f3f4f6",
                        borderTopColor: "#0088FF",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                        margin: "0 auto 16px",
                      }}
                    ></div>
                    <p 
                      id="loading-message"
                      style={{ color: "#5a6169", fontSize: "16px", marginBottom: "8px" }}
                    >
                      {loadingMessage}
                    </p>
                    {loadingMessage.includes("generation") && (
                      <p 
                        id="loading-help-text"
                        style={{ color: "#9ca3af", fontSize: "14px", marginTop: "8px" }}
                      >
                        This may take 30-60 seconds. Please don't close this page.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                renderCurrentStep()
              )}
            </div>
          </>
        )}
      </div>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* Welcome Modal */}
      <Modal
        isOpen={welcomeModalOpen}
        onClose={() => {
          // Just close the modal - don't navigate away
          setWelcomeModalOpen(false);
        }}
        title="Welcome to GrantWell"
        maxWidth="900px"
        topOffset={topOffset}
        hideCloseButton={true}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <h3
            style={{
              color: "#14558F",
              fontSize: "20px",
              fontWeight: "600",
              margin: "0 0 12px",
            }}
          >
            AI-Powered Grant Writing Assistant
          </h3>
          <p
            style={{
              color: "#4b5563",
              fontSize: "15px",
              lineHeight: 1.6,
              margin: "0",
            }}
          >
            GrantWell uses AI to help you create grant applications. We'll guide you through
            three simple steps to get started.
          </p>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#14558F",
                color: "white",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              1
            </div>
            <div>
              <h4
                style={{
                  margin: "0 0 8px",
                  fontSize: "17px",
                  fontWeight: "600",
                  color: "#1f2937",
                }}
              >
                Answer Simple Questions
              </h4>
              <p
                style={{
                  margin: 0,
                  color: "#4b5563",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                We'll guide you through key questions about your project to gather the
                essential information needed for your grant application.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#14558F",
                color: "white",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              2
            </div>
            <div>
              <h4
                style={{
                  margin: "0 0 8px",
                  fontSize: "17px",
                  fontWeight: "600",
                  color: "#1f2937",
                }}
              >
                Provide Additional Information
              </h4>
              <p
                style={{
                  margin: 0,
                  color: "#4b5563",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                Share any additional context or information that will help our AI understand your project
                better and generate more accurate content.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                backgroundColor: "#14558F",
                color: "white",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              3
            </div>
            <div>
              <h4
                style={{
                  margin: "0 0 8px",
                  fontSize: "17px",
                  fontWeight: "600",
                  color: "#1f2937",
                }}
              >
                Review & Edit AI-Generated Content
              </h4>
              <p
                style={{
                  margin: 0,
                  color: "#4b5563",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                Our AI will generate high-quality content that you can review, refine, and
                perfect for your grant application. As you work, your progress will be saved.
              </p>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            ref={startButtonRef}
            onClick={() => {
              setWelcomeModalOpen(false);
              if (selectedNofo) {
                startNewDocument();
              } else {
                navigate("/");
              }
            }}
            style={{
              width: "100%",
              padding: "14px 24px",
              background: "linear-gradient(135deg, #14558F 0%, #0A2B48 100%)",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 2px 4px rgba(0, 115, 187, 0.2)",
              minHeight: "44px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 115, 187, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 115, 187, 0.2)";
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #0088FF";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          >
            Get Started
          </button>

          <button
            ref={draftsButtonRef}
            onClick={() => {
              setWelcomeModalOpen(false);
              if (selectedNofo) {
                navigate(`/document-editor/drafts?nofo=${encodeURIComponent(selectedNofo)}`);
              } else {
                navigate("/document-editor/drafts");
              }
            }}
            style={{
              width: "100%",
              padding: "14px 24px",
              backgroundColor: "white",
              color: "#14558F",
              border: "2px solid #14558F",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              minHeight: "44px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f7fc";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "white";
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #0088FF";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          >
            View Existing Drafts
          </button>
        </div>
      </Modal>
    </div>
  );
};


export default DocumentEditor;

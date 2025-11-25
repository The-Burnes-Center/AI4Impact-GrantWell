// index.tsx
import React, { useState, useEffect, useCallback, useContext, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import DocumentNavigation from "./document-navigation";
import ProjectBasics from "./ProjectBasics";
import QuickQuestionnaire from "./QuickQuestionnaire";
import DraftView from "./DraftView";
import SectionEditor from "./SectionsEditor";
import ReviewApplication from "./ReviewApplication";
import UploadDocuments from "./UploadDocuments";
import Modal from "../../components/common/Modal";
import "../../styles/document-editor.css";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { DraftsClient, DocumentDraft } from "../../common/api-client/drafts-client";
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

// Custom hooks
const useDocumentStorage = (nofoId: string | null) => {
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { sessionId } = useParams();
  const appContext = useContext(AppContext);

  const loadDocument = useCallback(async () => {
    if (!nofoId || !sessionId || !appContext) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load from database
      const draftsClient = new DraftsClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;
      
      if (username) {
        const draft = await draftsClient.getDraft({
          sessionId: sessionId,
          userId: username,
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
        } else {
          setDocumentData({
            id: sessionId,
            nofoId: nofoId,
            sections: {},
            lastModified: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      console.error('Failed to load document:', error);
      setError(ERROR_MESSAGES.LOAD_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, [nofoId, sessionId, appContext]);

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

  return { documentData, setDocumentData, isLoading, error, setError };
};

// Main Component
const DocumentEditor: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<string>("projectBasics");
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [nofoName, setNofoName] = useState<string>("");
  const [isNofoLoading, setIsNofoLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const appContext = useContext(AppContext);
  const navigate = useNavigate();
  const { sessionId } = useParams();
  
  // Refs for buttons (used by modal for focus management)
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const draftsButtonRef = useRef<HTMLButtonElement>(null);

  const { documentData, setDocumentData, isLoading, error, setError } = useDocumentStorage(selectedNofo);

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

  // Show welcome modal automatically every time user lands on document editor
  useEffect(() => {
    if (!isLoading && !sessionId) {
      setWelcomeModalOpen(true);
    }
  }, [isLoading, sessionId]);

  // Create new document flow
  const startNewDocument = useCallback(async () => {
    if (!selectedNofo || !appContext) {
      return;
    }
    
    try {
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
            lastModified: Utils.getCurrentTimestamp(),
          });
        }
      }

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
            onUpdateData={(data) => {
              if (documentData) {
                setDocumentData({
                  ...documentData,
                  ...data
                });
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
            onUpdateData={(data) => {
              if (documentData) {
                setDocumentData({
                  ...documentData,
                  ...data
                });
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
    "Project Basics",
    "Questionnaire",
    "Upload Documents",
    "Section Editor",
    "Review",
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
            background: "#2c4fdb",
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

  return (
    <div
      className="document-editor-root"
      style={{ display: "flex", minHeight: "100vh" }}
    >
      <nav aria-label="Document editor navigation">
        <DocumentNavigation
          documentIdentifier={selectedNofo}
          currentStep={currentStep}
          onNavigate={navigateToStep}
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
        />
      </nav>

      <main
        className="document-content"
        style={{
          marginLeft: sidebarOpen ? "240px" : "60px",
          transition: "margin-left 0.3s ease",
          width: `calc(100% - ${sidebarOpen ? "240px" : "60px"})`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="document-editor-header"
          style={{
            background: "#fff",
            borderBottom: "0",
            width: "100%",
            position: "sticky",
            top: 0,
            zIndex: 10,
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
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                marginBottom: "0",
              }}
            >
              <h1
                className="document-editor-nofo-title"
                style={{
                  marginBottom: "0",
                  textAlign: "left",
                  fontSize: "22px",
                  fontWeight: "600",
                }}
              >
                {isNofoLoading ? "Loading..." : nofoName || "Grant Application"}
              </h1>
            </div>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            background: "#f1f5fb",
            borderRadius: "0",
            padding: "20px 0",
            marginTop: "0",
            marginBottom: "0",
            boxShadow: "0px 1px 2px rgba(0,0,0,0.05)",
            position: "sticky",
            top: "60px",
            zIndex: 9,
          }}
        >
          <Stepper
            activeStep={activeStep}
            alternativeLabel
            sx={{
              "& .MuiStepConnector-line": {
                borderTopWidth: "2px",
                borderColor: "#e2e8f0",
              },
              "& .MuiStepLabel-label": {
                marginTop: "8px",
                fontSize: "14px",
                fontWeight: 500,
              },
              "& .MuiStepLabel-iconContainer": {
                "& .MuiStepIcon-root": {
                  width: "32px",
                  height: "32px",
                  color: "#e2e8f0",
                  "&.Mui-active": {
                    color: "#2c4fdb",
                  },
                  "&.Mui-completed": {
                    color: "#2c4fdb",
                  },
                },
              },
            }}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </div>

        <div
          className="document-editor-workspace"
          style={{ flex: 1, padding: "20px" }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "60vh",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    border: "4px solid #f3f4f6",
                    borderTopColor: "#2c4fdb",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                    margin: "0 auto 16px",
                  }}
                ></div>
                <p style={{ color: "#5a6169" }}>Loading document editor...</p>
              </div>
            </div>
          ) : (
            renderCurrentStep()
          )}
        </div>
      </main>

      {/* Welcome Modal */}
      <Modal
        isOpen={welcomeModalOpen}
        onClose={() => {
          setWelcomeModalOpen(false);
          // Navigate back to checklists when closing the modal
          if (selectedNofo) {
            navigate(`/landing-page/basePage/checklists/${selectedNofo}`);
          }
        }}
        title="Welcome to GrantWell"
        maxWidth="700px"
      >
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h3
            style={{
              color: "#0073bb",
              fontSize: "20px",
              fontWeight: "600",
              margin: "0 0 16px",
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
            The GrantWell grant writing tool uses generative AI to guide you through the
            application process. The last grant you searched is pre-loaded. Want to work
            on a different grant? Return to the home page to find the grant of interest.
          </p>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: "32px" }}>
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
                backgroundColor: "#0073bb",
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
                backgroundColor: "#0073bb",
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
                Upload Supporting Documents
              </h4>
              <p
                style={{
                  margin: 0,
                  color: "#4b5563",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                Add any supporting documents that will help our AI understand your project
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
                backgroundColor: "#0073bb",
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
              background: "linear-gradient(135deg, #0073bb 0%, #005d96 100%)",
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
              e.currentTarget.style.outline = "2px solid #2c4fdb";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          >
            Start New Application
          </button>

          <button
            ref={draftsButtonRef}
            onClick={() => {
              setWelcomeModalOpen(false);
              navigate("/document-editor/drafts");
            }}
            style={{
              width: "100%",
              padding: "14px 24px",
              backgroundColor: "white",
              color: "#0073bb",
              border: "2px solid #0073bb",
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
              e.currentTarget.style.outline = "2px solid #2c4fdb";
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

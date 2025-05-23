// index.tsx
import React, { useState, useEffect, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AppContext } from "../../common/app-context";
import DocumentNavigation from "./document-navigation";
import ProjectBasics from "./ProjectBasics";
import QuickQuestionnaire from "./QuickQuestionnaire";
import DraftView from "./DraftView";
import SectionEditor from "./SectionsEditor";
import ReviewApplication from "./ReviewApplication";
import WelcomeModal from "./WelcomeModal";
import UploadDocuments from "./UploadDocuments";
import "../../styles/document-editor.css";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import { ApiClient } from "../../common/api-client/api-client";

// Types
interface DocumentData {
  id?: string;
  nofoId: string;
  sections: Record<string, any>;
  projectBasics?: ProjectBasics;
  lastModified: string;
}

interface ProjectBasics {
  title: string;
  description: string;
  // Add other project basic fields as needed
}

// Constants
const STORAGE_PREFIX = "document_";
const ERROR_MESSAGES = {
  LOAD_FAILED: "Failed to load document data",
  SAVE_FAILED: "Failed to save document data",
  NO_NOFO: "No NOFO selected",
} as const;

// Custom hooks
const useDocumentStorage = (nofoId: string | null) => {
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    if (!nofoId) return;

    setIsLoading(true);
    setError(null);

    try {
      const savedData = localStorage.getItem(`${STORAGE_PREFIX}${nofoId}`);
      if (savedData) {
        setDocumentData(JSON.parse(savedData));
      } else {
        setDocumentData({
          nofoId,
          sections: {},
          lastModified: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError(ERROR_MESSAGES.LOAD_FAILED);
      console.error(ERROR_MESSAGES.LOAD_FAILED, err);
    } finally {
      setIsLoading(false);
    }
  }, [nofoId]);

  const saveDocument = useCallback(
    async (data: Partial<DocumentData>) => {
      if (!nofoId || !documentData) return;

      try {
        const updatedData = {
          ...documentData,
          ...data,
          lastModified: new Date().toISOString(),
        };
        localStorage.setItem(
          `${STORAGE_PREFIX}${nofoId}`,
          JSON.stringify(updatedData)
        );
        setDocumentData(updatedData);
        return true;
      } catch (err) {
        setError(ERROR_MESSAGES.SAVE_FAILED);
        console.error(ERROR_MESSAGES.SAVE_FAILED, err);
        return false;
      }
    },
    [nofoId, documentData]
  );

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  return { documentData, isLoading, error, saveDocument };
};

// Main Component
const DocumentEditor: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<string>("welcome");
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [nofoName, setNofoName] = useState<string>("");
  const [isNofoLoading, setIsNofoLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const appContext = useContext(AppContext);
  const navigate = useNavigate();

  const { documentData, isLoading, error, saveDocument } =
    useDocumentStorage(selectedNofo);

  // Extract NOFO from URL parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const nofo = searchParams.get("nofo");
    if (nofo) {
      setSelectedNofo(decodeURIComponent(nofo));
    }
  }, []);

  // Show welcome modal when no NOFO is selected
  useEffect(() => {
    if (!selectedNofo) {
      setShowWelcomeModal(true);
    }
  }, [selectedNofo]);

  // Handle navigation through document creation flow
  const navigateToStep = (step: string) => {
    setCurrentStep(step);
  };

  // Handle back navigation based on current step
  const handleBackNavigation = () => {
    switch (currentStep) {
      case "projectBasics":
        navigate("/"); // Go back to landing page from first step
        break;
      case "questionnaire":
        navigateToStep("projectBasics");
        break;
      case "uploadDocuments":
        navigateToStep("questionnaire");
        break;
      case "draftCreated":
        navigateToStep("uploadDocuments");
        break;
      case "sectionEditor":
        navigateToStep("draftCreated");
        break;
      case "reviewApplication":
        navigateToStep("sectionEditor");
        break;
      default:
        // If on welcome or another page, go back to landing
        navigate("/");
        break;
    }
  };

  // Create new document flow
  const startNewDocument = useCallback(() => {
    if (!selectedNofo) {
      setShowWelcomeModal(true);
      return;
    }
    setShowWelcomeModal(false); // Close the modal
    setCurrentStep("projectBasics");
  }, [selectedNofo]);

  // Handle welcome modal close
  const handleWelcomeModalClose = () => {
    setShowWelcomeModal(false);
    if (selectedNofo) {
      setCurrentStep("projectBasics");
    }
  };

  // Handle save progress
  const handleSaveProgress = useCallback(async () => {
    if (!documentData) return;
    await saveDocument(documentData);
  }, [documentData, saveDocument]);

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
      case "welcome":
        return (
          <div
            style={{
              minHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <h2
              style={{
                fontSize: "24px",
                marginBottom: "16px",
                color: "#2d3748",
              }}
            >
              Welcome to GrantWell
            </h2>
            <p
              style={{
                fontSize: "16px",
                color: "#4a5568",
                maxWidth: "600px",
                lineHeight: "1.6",
                marginBottom: "24px",
              }}
            >
              Get started with your grant application by clicking the button
              below.
            </p>
            <button
              onClick={() => setShowWelcomeModal(true)}
              style={{
                padding: "12px 24px",
                background: "#4361ee",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "16px",
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(67, 97, 238, 0.3)",
                fontWeight: "500",
              }}
            >
              Start New Application
            </button>
          </div>
        );
      case "projectBasics":
        return (
          <ProjectBasics
            onContinue={() => navigateToStep("questionnaire")}
            selectedNofo={selectedNofo}
          />
        );
      case "questionnaire":
        return (
          <QuickQuestionnaire
            onContinue={() => navigateToStep("uploadDocuments")}
            selectedNofo={selectedNofo}
            onNavigate={navigateToStep}
          />
        );
      case "uploadDocuments":
        return (
          <UploadDocuments
            onContinue={() => navigateToStep("draftCreated")}
            selectedNofo={selectedNofo}
            onNavigate={navigateToStep}
          />
        );
      case "draftCreated":
        return (
          <div style={{ minHeight: "60vh", background: "#f7fafc" }}>
            <DraftView
              onStartEditing={() => navigateToStep("sectionEditor")}
              selectedNofo={selectedNofo}
            />
          </div>
        );
      case "sectionEditor":
        return (
          <SectionEditor
            onContinue={() => navigateToStep("reviewApplication")}
            selectedNofo={selectedNofo}
          />
        );
      case "reviewApplication":
        return (
          <ReviewApplication
            onExport={() => alert("Application exported!")}
            selectedNofo={selectedNofo}
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
            background: "#4361ee",
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
      <DocumentNavigation
        documentIdentifier={selectedNofo}
        currentStep={currentStep}
        onNavigate={navigateToStep}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      <div
        className="document-content"
        style={{
          marginLeft: sidebarOpen ? "240px" : "60px",
          transition: "margin-left 0.3s ease",
          width: "calc(100% - " + (sidebarOpen ? "240px" : "60px") + ")",
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
              padding: "16px 16px 16px 16px",
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
                {isNofoLoading ? "Loading..." : nofoName}
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
                    color: "#4361ee",
                  },
                  "&.Mui-completed": {
                    color: "#4361ee",
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
                    borderTopColor: "#4361ee",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                    margin: "0 auto 16px",
                  }}
                ></div>
                <p style={{ color: "#6b7280" }}>Loading document editor...</p>
              </div>
            </div>
          ) : (
            renderCurrentStep()
          )}
        </div>
      </div>

      {showWelcomeModal && (
        <WelcomeModal
          isOpen={showWelcomeModal}
          onClose={handleWelcomeModalClose}
          onStart={startNewDocument}
        />
      )}
    </div>
  );
};

export default DocumentEditor;

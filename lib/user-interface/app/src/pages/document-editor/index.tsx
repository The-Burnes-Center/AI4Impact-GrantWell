// index.tsx
import React, { useState, useEffect, useCallback, useContext } from "react";
import { AppContext } from "../../common/app-context";
import DocumentNavigation from "./document-navigation";
import ProjectBasics from "./ProjectBasics";
import QuickQuestionnaire from "./QuickQuestionnaire";
import DraftView from "./DraftView";
import SectionEditor from "./SectionsEditor";
import ReviewApplication from "./ReviewApplication";
import WelcomeModal from "./WelcomeModal";
import "../../styles/document-editor.css";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";

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
  const appContext = useContext(AppContext);

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

  // Create new document flow
  const startNewDocument = useCallback(() => {
    if (!selectedNofo) {
      setShowWelcomeModal(true);
      return;
    }
    setCurrentStep("projectBasics");
  }, [selectedNofo]);

  // Handle welcome modal close
  const handleWelcomeModalClose = () => {
    setShowWelcomeModal(false);
  };

  // Handle save progress
  const handleSaveProgress = useCallback(async () => {
    if (!documentData) return;
    await saveDocument(documentData);
  }, [documentData, saveDocument]);

  // Fetch NOFO details
  useEffect(() => {
    const fetchNofoName = async () => {
      if (!selectedNofo || !appContext) return;
      setIsNofoLoading(true);
      try {
        // Mock API call
        setTimeout(() => {
          setNofoName("Downtown Revitalization Program");
          setIsNofoLoading(false);
        }, 500);
      } catch (error) {
        const folderName = selectedNofo.split("/").pop();
        setNofoName(folderName || "NOFO");
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
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <button
              onClick={startNewDocument}
              style={{
                padding: "12px 24px",
                background: "#4361ee",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "16px",
                cursor: "pointer",
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
            onContinue={() => navigateToStep("draftCreated")}
            selectedNofo={selectedNofo}
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

  const steps = ["Project Basics", "Questionnaire", "Section Editor", "Review"];
  const activeStep = (() => {
    switch (currentStep) {
      case "projectBasics":
        return 0;
      case "questionnaire":
        return 1;
      case "sectionEditor":
        return 2;
      case "reviewApplication":
        return 3;
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
    <div className="document-editor-root">
      <DocumentNavigation
        documentIdentifier={selectedNofo}
        currentStep={currentStep}
        onNavigate={navigateToStep}
      />

      <div
        className="document-editor-header"
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          className="document-editor-header-inner"
          style={{
            padding: "16px 10px 0 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <h1
            className="document-editor-nofo-title"
            style={{
              marginBottom: "8px",
              textAlign: "left",
              width: "100%",
              paddingLeft: "16px",
            }}
          >
            {isNofoLoading ? "Loading..." : nofoName}
          </h1>
          <div
            style={{
              width: "100%",
              background: "#f5f8ff",
              borderRadius: "8px",
              padding: "16px 0",
              marginBottom: "8px",
            }}
          >
            <Stepper activeStep={activeStep} alternativeLabel>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </div>
        </div>

        <div className="document-editor-workspace">
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

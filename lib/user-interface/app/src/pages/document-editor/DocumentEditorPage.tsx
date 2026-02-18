import React, { useState, useEffect, useCallback, useContext, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { useApiClient } from "../../hooks/use-api-client";
import { useDraftsClient } from "../../hooks/use-drafts-client";
import { useHeaderOffset } from "../../hooks/use-header-offset";
import { stepToStatus, statusToStep, EDITOR_STEPS, stepToIndex } from "../../common/helpers/document-editor-utils";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import ProjectBasics from "./ProjectBasics";
import QuickQuestionnaire from "./QuickQuestionnaire";
import DraftView from "./DraftView";
import SectionEditor from "./SectionsEditor";
import ReviewApplication from "./ReviewApplication";
import UploadDocuments from "./UploadDocuments";
import WelcomeModal from "./components/WelcomeModal";
import ProgressStepper from "../../components/document-editor/ProgressStepper";
import { Auth } from "aws-amplify";
import type { DraftStatus } from "../../common/api-client/drafts-client";
import { Utils } from "../../common/utils";
import "../../styles/document-editor.css";

interface DocumentData {
  id: string;
  nofoId: string;
  sections: Record<string, any>;
  projectBasics?: any;
  questionnaire?: any;
  lastModified: string;
}

const ERROR_MESSAGES = {
  LOAD_FAILED: "Failed to load document data",
  SAVE_FAILED: "Failed to save document data",
  START_FAILED: "Failed to start new document",
} as const;

/** Custom hook: loads/saves document via DraftsClient */
const useDocumentStorage = (nofoId: string | null, onStepRestore?: (step: string) => void) => {
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading document editor...");
  const [error, setError] = useState<string | null>(null);
  const { sessionId } = useParams();
  const draftsClient = useDraftsClient();

  const loadDocument = useCallback(async () => {
    if (!nofoId || !sessionId) return;
    setIsLoading(true);
    setError(null);
    setLoadingMessage("Loading document editor...");

    try {
      const username = (await Auth.currentAuthenticatedUser()).username;
      if (username) {
        const draft = await draftsClient.getDraft({
          sessionId,
          userId: username,
          onProgress: (message: string, attempt: number) => {
            setLoadingMessage(message);
            if (attempt === 15) setLoadingMessage("Draft generation is taking longer than expected. Please wait...");
            if (attempt === 30) setLoadingMessage("Draft generation is still in progress. This may take up to 2 minutes...");
          },
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
          if (draft.status && onStepRestore) onStepRestore(statusToStep(draft.status));
        } else {
          setDocumentData({ id: sessionId, nofoId, sections: {}, lastModified: new Date().toISOString() });
        }
      }
    } catch (err) {
      console.error("Failed to load document:", err);
      setError(ERROR_MESSAGES.LOAD_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, [nofoId, sessionId, draftsClient, onStepRestore]);

  useEffect(() => { loadDocument(); }, [loadDocument]);

  return { documentData, setDocumentData, isLoading, loadingMessage, error, setError };
};

const DocumentEditor: React.FC = () => {
  const [currentStep, setCurrentStep] = useState("projectBasics");
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [nofoName, setNofoName] = useState("");
  const [isNofoLoading, setIsNofoLoading] = useState(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const appContext = useContext(AppContext);
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();

  const apiClient = useApiClient();
  const draftsClient = useDraftsClient();
  const topOffset = useHeaderOffset();

  const { documentData, setDocumentData, isLoading, loadingMessage, error, setError } = useDocumentStorage(selectedNofo, setCurrentStep);

  // Extract NOFO and step from URL
  useEffect(() => {
    const nofo = searchParams.get("nofo");
    const stepFromUrl = searchParams.get("step");
    if (nofo) setSelectedNofo(decodeURIComponent(nofo));
    if (stepFromUrl && EDITOR_STEPS.some((s) => s.id === stepFromUrl)) {
      setCurrentStep(stepFromUrl);
    }
  }, [searchParams]);

  // Show welcome modal only for new sessions
  useEffect(() => {
    if (!isLoading && !sessionId && !searchParams.get("step")) {
      setWelcomeModalOpen(true);
    } else {
      setWelcomeModalOpen(false);
    }
  }, [isLoading, sessionId, searchParams]);

  // Fetch NOFO name
  useEffect(() => {
    if (!selectedNofo) return;
    setIsNofoLoading(true);
    apiClient.landingPage
      .getNOFOSummary(selectedNofo)
      .then((result) => setNofoName(result?.data?.GrantName || "Grant Application"))
      .catch(() => setNofoName("Grant Application"))
      .finally(() => setIsNofoLoading(false));
  }, [selectedNofo, apiClient]);

  const startNewDocument = useCallback(async () => {
    if (!selectedNofo) return;
    try {
      localStorage.removeItem("projectBasics");
      localStorage.removeItem("questionnaire");
      const newSessionId = uuidv4();
      const username = (await Auth.currentAuthenticatedUser()).username;
      if (username) {
        await draftsClient.createDraft({
          sessionId: newSessionId, userId: username,
          title: `Application for ${selectedNofo}`, documentIdentifier: selectedNofo,
          sections: {}, projectBasics: {}, questionnaire: {},
          status: "project_basics", lastModified: Utils.getCurrentTimestamp(),
        });
      }
      setCurrentStep("projectBasics");
      navigate(`/document-editor/${newSessionId}?step=projectBasics&nofo=${encodeURIComponent(selectedNofo)}`);
    } catch (err) {
      console.error("Failed to start new document:", err);
      setError(ERROR_MESSAGES.START_FAILED);
    }
  }, [selectedNofo, draftsClient, navigate, setError]);

  const navigateToStep = useCallback(async (step: string) => {
    if (!documentData) {
      const nofoParam = selectedNofo ? `&nofo=${encodeURIComponent(selectedNofo)}` : "";
      navigate(`/document-editor/${sessionId}?step=${step}${nofoParam}`);
      return;
    }
    try {
      const username = (await Auth.currentAuthenticatedUser()).username;
      if (username && sessionId) {
        const currentDraft = await draftsClient.getDraft({ sessionId, userId: username });
        await draftsClient.updateDraft({
          sessionId, userId: username,
          title: `Application for ${selectedNofo}`, documentIdentifier: selectedNofo || "",
          sections: { ...currentDraft?.sections, ...documentData.sections },
          projectBasics: documentData.projectBasics || currentDraft?.projectBasics,
          questionnaire: documentData.questionnaire || currentDraft?.questionnaire,
          status: stepToStatus(step) as DraftStatus,
          lastModified: Utils.getCurrentTimestamp(),
        });
      }
      setCurrentStep(step);
      const nofoParam = selectedNofo ? `&nofo=${encodeURIComponent(selectedNofo)}` : "";
      navigate(`/document-editor/${sessionId}?step=${step}${nofoParam}`);
    } catch (err) {
      console.error("Failed to navigate to step:", err);
      setError(ERROR_MESSAGES.SAVE_FAILED);
    }
  }, [documentData, selectedNofo, sessionId, draftsClient, navigate, setError]);

  const handleUpdateData = useCallback(async (data: Partial<DocumentData>) => {
    if (!documentData) return;
    const updatedData = { ...documentData, ...data };
    setDocumentData(updatedData);
    try {
      const username = (await Auth.currentAuthenticatedUser()).username;
      if (username && sessionId && selectedNofo) {
        await draftsClient.updateDraft({
          sessionId, userId: username,
          title: `Application for ${selectedNofo}`, documentIdentifier: selectedNofo,
          sections: updatedData.sections || {}, projectBasics: updatedData.projectBasics,
          questionnaire: updatedData.questionnaire,
          status: stepToStatus(currentStep) as DraftStatus,
          lastModified: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Failed to auto-save:", err);
    }
  }, [documentData, sessionId, selectedNofo, currentStep, draftsClient, setDocumentData]);

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "projectBasics":
        return <ProjectBasics onContinue={() => navigateToStep("questionnaire")} selectedNofo={selectedNofo} documentData={documentData} onUpdateData={handleUpdateData} />;
      case "questionnaire":
        return <QuickQuestionnaire onContinue={() => navigateToStep("uploadDocuments")} selectedNofo={selectedNofo} onNavigate={navigateToStep} documentData={documentData} onUpdateData={handleUpdateData} />;
      case "uploadDocuments":
        return <UploadDocuments onContinue={() => navigateToStep("draftCreated")} selectedNofo={selectedNofo} onNavigate={navigateToStep} sessionId={sessionId || ""} documentData={documentData} />;
      case "draftCreated":
        return <div style={{ minHeight: "60vh", background: "#f7fafc" }}><DraftView onStartEditing={() => navigateToStep("sectionEditor")} selectedNofo={selectedNofo} sessionId={sessionId || ""} /></div>;
      case "sectionEditor":
        return <SectionEditor onContinue={() => navigateToStep("reviewApplication")} selectedNofo={selectedNofo} sessionId={sessionId || ""} onNavigate={navigateToStep} />;
      case "reviewApplication":
        return <ReviewApplication onExport={() => {}} selectedNofo={selectedNofo} sessionId={sessionId || ""} onNavigate={navigateToStep} />;
      default:
        return <div>Welcome to GrantWell</div>;
    }
  };

  const activeStep = stepToIndex(currentStep);

  if (error) {
    return (
      <div className="checklist-error" style={{ padding: 40 }}>
        <h2 className="checklist-error__title">Error</h2>
        <p className="checklist-error__text">{error}</p>
        <button className="checklist-error__btn" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="document-editor-root" style={{ display: "flex", alignItems: "stretch", minHeight: `calc(100vh - ${topOffset}px)`, width: "100%", margin: 0, padding: 0 }}>
      <nav aria-label="Document editor navigation" style={{ flexShrink: 0 }}>
        <UnifiedNavigation documentIdentifier={selectedNofo} currentStep={currentStep} onNavigate={navigateToStep} />
      </nav>

      <div className="document-content" style={{ flex: 1, display: "flex", flexDirection: "column", margin: 0, padding: 0 }}>
        {!welcomeModalOpen && (
          <>
            <div className="document-editor-header" style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 101, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ padding: 16 }}>
                <h1 className="document-editor-nofo-title" style={{ margin: 0, fontSize: "22px", fontWeight: 600, lineHeight: 1.4, wordBreak: "break-word" }}>
                  {isNofoLoading ? "Loading..." : nofoName || "Grant Application"}
                </h1>
              </div>
            </div>

            <ProgressStepper
              steps={[...EDITOR_STEPS]}
              activeStep={activeStep}
              isStepClickable={(idx) => {
                const hasSections = documentData?.sections && Object.keys(documentData.sections).length > 0;
                if (idx <= activeStep) return true;
                if (idx === activeStep + 1) return idx < 3 || !!hasSections;
                return false;
              }}
              onStepClick={(idx) => navigateToStep(EDITOR_STEPS[idx].id)}
              completedSteps={Array.from({ length: activeStep }, (_, i) => i)}
              showProgress
            />

            <div className="document-editor-workspace" style={{ flex: 1, padding: 20 }}>
              {isLoading ? (
                <div id="document-loading-region" role="status" aria-live="polite" aria-busy="true" tabIndex={-1} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                  <div style={{ textAlign: "center", maxWidth: 400 }}>
                    <div className="loading-spinner" style={{ margin: "0 auto 16px" }} />
                    <p style={{ color: "#5a6169", fontSize: 16, marginBottom: 8 }}>{loadingMessage}</p>
                    {loadingMessage.includes("generation") && (
                      <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 8 }}>This may take 30-60 seconds. Please don&apos;t close this page.</p>
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

      <WelcomeModal
        isOpen={welcomeModalOpen}
        onClose={() => setWelcomeModalOpen(false)}
        topOffset={topOffset}
        onGetStarted={() => {
          setWelcomeModalOpen(false);
          if (selectedNofo) startNewDocument();
          else navigate("/");
        }}
        onViewDrafts={() => {
          setWelcomeModalOpen(false);
          navigate(selectedNofo ? `/document-editor/drafts?nofo=${encodeURIComponent(selectedNofo)}` : "/document-editor/drafts");
        }}
      />
    </div>
  );
};

export default DocumentEditor;

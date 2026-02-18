import React, { useState, useEffect, useCallback } from "react";
import BaseAppLayout from "../../../layouts/ChatLayout";
import Chat from "../../../components/chat/Chat";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { HelpCircle, Upload } from "lucide-react";
import { useApiClient } from "../../../hooks/use-api-client";
import { useFocusTrap } from "../../../hooks/use-focus-trap";
import UploadModal from "../../../components/chat/UploadModal";
import "../../../styles/playground.css";

export default function Playground() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");
  const [nofoName, setNofoName] = useState("New NOFO");
  const [isLoading, setIsLoading] = useState(false);
  const apiClient = useApiClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [nofoSelectionDialogOpen, setNofoSelectionDialogOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const helpButtonRef = React.useRef<HTMLButtonElement>(null);

  const handleCloseModal = useCallback(() => {
    if (dontShowAgain) {
      localStorage.setItem("playgroundHelpSeen", "true");
    } else {
      localStorage.removeItem("playgroundHelpSeen");
    }
    setHelpOpen(false);
    setTimeout(() => helpButtonRef.current?.focus(), 100);
  }, [dontShowAgain]);

  const modalRef = useFocusTrap<HTMLDivElement>({
    isOpen: helpOpen,
    onEscape: handleCloseModal,
  });

  useEffect(() => {
    const fetchNofoName = async () => {
      if (!documentIdentifier) return;
      setIsLoading(true);
      try {
        const summaryResult = await apiClient.landingPage.getNOFOSummary(
          documentIdentifier
        );
        if (summaryResult?.data?.GrantName) {
          setNofoName(summaryResult.data.GrantName);
        } else {
          setNofoName(documentIdentifier.split("/").pop() || "NOFO");
        }
      } catch (error) {
        console.error("Error fetching NOFO name:", error);
        setNofoName(documentIdentifier.split("/").pop() || "NOFO");
      } finally {
        setIsLoading(false);
      }
    };
    fetchNofoName();
  }, [documentIdentifier, apiClient]);

  useEffect(() => {
    if (!isLoading && !documentIdentifier && !helpOpen) {
      setNofoSelectionDialogOpen(true);
    } else {
      setNofoSelectionDialogOpen(false);
    }
  }, [isLoading, documentIdentifier, helpOpen]);

  useEffect(() => {
    const hasSeenPlaygroundHelp = localStorage.getItem("playgroundHelpSeen");
    if (!hasSeenPlaygroundHelp && !isLoading) {
      setHelpOpen(true);
    }
  }, [isLoading]);

  useEffect(() => {
    if (helpOpen) {
      const hasSeenPlaygroundHelp = localStorage.getItem("playgroundHelpSeen");
      setDontShowAgain(hasSeenPlaygroundHelp === "true");
    }
  }, [helpOpen]);

  return (
    <>
      <BaseAppLayout
        header={
          <div className="pg-header">
            <h1 className="pg-header-title">
              {isLoading ? "Loading..." : nofoName}
            </h1>
            <div className="pg-header-actions">
              {/* Upload Data button — TEMPORARILY HIDDEN */}
              {false && documentIdentifier && (
                <button
                  className="pg-upload-btn"
                  onClick={() => setUploadModalOpen(true)}
                  aria-label="Upload supporting documents"
                >
                  <Upload size={16} /> Upload Data
                </button>
              )}
              <button
                ref={helpButtonRef}
                className="pg-help-btn"
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
          <div className="pg-content" aria-hidden={helpOpen}>
            <Chat sessionId={sessionId} documentIdentifier={documentIdentifier} />
            {/* Upload Modal — TEMPORARILY HIDDEN */}
            {false && documentIdentifier && (
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
        <div className="pg-modal-overlay">
          <div
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            aria-describedby="help-modal-description"
            className="pg-modal"
          >
            {/* Header */}
            <div className="pg-modal-header">
              <h2 id="help-modal-title" className="pg-modal-title">
                Welcome to GrantWell Chatbot!
              </h2>
              <button
                onClick={handleCloseModal}
                className="pg-modal-close-btn"
                aria-label="Close help dialog"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div id="help-modal-description" className="pg-modal-body">
              <p className="pg-modal-intro">
                This AI-powered assistant is your expert guide for understanding
                a grant. Ask questions about any aspect of the grant application
                and get instant answers.
              </p>

              <div className="pg-highlight-box">
                <p className="pg-highlight-title">You can ask GrantWell to:</p>
                <ul className="pg-highlight-list">
                  <li>
                    Explain specific grant requirements, eligibility criteria,
                    and NOFO sections
                  </li>
                  <li>
                    Review your draft grant narratives and applications for
                    completeness based on evaluation criteria
                  </li>
                  <li>
                    Assess your organization's eligibility for specific funding
                    opportunities
                  </li>
                  <li>
                    Explain deadlines, submission requirements, budget rules, and
                    compliance requirements
                  </li>
                </ul>
              </div>

              <div className="pg-info-section">
                <p className="pg-info-heading">Sources</p>
                <p className="pg-info-text">
                  If the chatbot references any files from the knowledge base,
                  they will show up underneath the relevant message.
                </p>
              </div>

              <div className="pg-info-section">
                <p className="pg-info-heading">Session History</p>
                <p className="pg-info-text">
                  All conversations are saved and can be accessed later via the{" "}
                  <Link to="/chat/sessions" className="pg-info-link">
                    Sessions
                  </Link>{" "}
                  page.
                </p>
              </div>

              <div className="pg-checkbox-row">
                <input
                  type="checkbox"
                  id="dont-show-again-playground"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="pg-checkbox"
                  aria-label="Do not show this again"
                />
                <label
                  htmlFor="dont-show-again-playground"
                  className="pg-checkbox-label"
                >
                  Do not show this again
                </label>
              </div>

              <button
                onClick={handleCloseModal}
                className="pg-got-it-btn"
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

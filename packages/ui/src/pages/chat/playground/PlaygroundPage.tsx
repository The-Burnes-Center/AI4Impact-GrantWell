import React, { useState, useEffect, useCallback, useId } from "react";
import BaseAppLayout from "../../../layouts/ChatLayout";
import Chat from "../../../components/chat/Chat";
import { Link, useParams, useSearchParams } from "react-router";
import { LuCircleHelp, LuUpload, LuFileText } from "react-icons/lu";
import { useApiClient } from "../../../hooks/use-api-client";
import { Modal } from "../../../components/common/Modal";
import { useInert } from "../../../hooks/use-inert";
import DocumentManager from "../../../components/chat/DocumentManager";
import "../../../styles/playground.css";

export default function Playground() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("grant") ?? searchParams.get("folder") ?? searchParams.get("nofo");
  const [nofoName, setNofoName] = useState("New grant");
  const [isLoading, setIsLoading] = useState(false);
  const apiClient = useApiClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [, setNofoSelectionDialogOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadedFileCount, setUploadedFileCount] = useState(0);
  const helpButtonRef = React.useRef<HTMLButtonElement>(null);
  const inertContentRef = useInert<HTMLDivElement>(helpOpen);
  const descriptionId = useId();

  const handleCloseModal = useCallback(() => {
    if (dontShowAgain) {
      localStorage.setItem("playgroundHelpSeen", "true");
    } else {
      localStorage.removeItem("playgroundHelpSeen");
    }
    setHelpOpen(false);
    setTimeout(() => helpButtonRef.current?.focus(), 100);
  }, [dontShowAgain]);

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
          setNofoName(documentIdentifier.split("/").pop() || "Grant");
        }
      } catch (error) {
        console.error("Error fetching NOFO name:", error);
        setNofoName(documentIdentifier.split("/").pop() || "Grant");
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
              <span className="pg-header-eyebrow">Chat with AI</span>
              {isLoading ? "Loading..." : nofoName}
            </h1>
            <div className="pg-header-actions">
              {documentIdentifier && (
                <button
                  className="gw-btn gw-btn--primary pg-upload-btn"
                  onClick={() => setUploadModalOpen(true)}
                  aria-label={`Supporting documents — choose what the AI reads in this chat${uploadedFileCount > 0 ? `. ${uploadedFileCount} selected.` : ""}`}
                >
                  <LuUpload size={16} aria-hidden="true" /> Supporting documents
                  {uploadedFileCount > 0 && (
                    <span className="pg-upload-badge" aria-hidden="true">
                      <LuFileText size={11} aria-hidden="true" />
                      {uploadedFileCount}
                    </span>
                  )}
                </button>
              )}
              <button
                ref={helpButtonRef}
                className="gw-btn gw-btn--secondary pg-help-btn"
                onClick={() => setHelpOpen(!helpOpen)}
                aria-label={helpOpen ? "Close help dialog" : "Open help dialog"}
                aria-expanded={helpOpen}
              >
                <LuCircleHelp size={16} aria-hidden="true" /> Help
              </button>
            </div>
          </div>
        }
        documentIdentifier={documentIdentifier}
        sessionId={sessionId}
        modalOpen={helpOpen}
        content={
          <div ref={inertContentRef} className="pg-content" aria-hidden={helpOpen}>
            <Chat sessionId={sessionId} documentIdentifier={documentIdentifier} />
            {documentIdentifier && (
              <DocumentManager
                isOpen={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
                documentIdentifier={documentIdentifier}
                sessionId={sessionId}
                onFileCountChange={setUploadedFileCount}
              />
            )}
          </div>
        }
      />

      <Modal
        isOpen={helpOpen}
        onClose={handleCloseModal}
        title="Welcome to Chat with AI"
        maxWidth="650px"
        describedBy={descriptionId}
        closeLabel="Close help dialog"
      >
        <p id={descriptionId} className="pg-modal-intro">
          This AI-powered assistant is your expert guide for understanding
          a grant. Ask questions about any aspect of the grant application
          and get instant answers.
        </p>

        <div className="pg-highlight-box">
          <h3 className="pg-highlight-title">You can ask GrantWell to:</h3>
          <ul className="pg-highlight-list">
            <li>
              Explain specific grant requirements, eligibility criteria,
              and grant sections
            </li>
            <li>
              Review your applications for completeness based on
              evaluation criteria
            </li>
            <li>
              Assess your organization's eligibility for specific grants
            </li>
            <li>
              Explain deadlines, submission requirements, budget rules, and
              compliance requirements
            </li>
          </ul>
        </div>

        <div className="pg-info-section">
          <h3 className="pg-info-heading">Sources</h3>
          <p className="pg-info-text">
            If the assistant references the grant or your supporting
            documents, they will show up underneath the relevant message.
          </p>
        </div>

        <div className="pg-info-section">
          <h3 className="pg-info-heading">My chats</h3>
          <p className="pg-info-text">
            All chats are saved and can be accessed later via the{" "}
            <Link to="/chat/sessions" className="pg-info-link">
              My chats
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
          />
          <label
            htmlFor="dont-show-again-playground"
            className="pg-checkbox-label"
          >
            Do not show this again
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={handleCloseModal} className="gw-btn gw-btn--primary">
            Got it
          </button>
        </div>
      </Modal>
    </>
  );
}

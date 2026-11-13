import React, { useState, useEffect, useCallback, useId, useMemo } from "react";
import BaseAppLayout from "../../../layouts/ChatLayout";
import Chat from "../../../components/chat/Chat";
import { Link, useParams, useSearchParams } from "react-router";
import { LuCircleHelp, LuPanelRightClose, LuPanelRightOpen } from "react-icons/lu";
import { useApiClient } from "../../../hooks/use-api-client";
import { Modal } from "../../../components/common/Modal";
import { useInert } from "../../../hooks/use-inert";
import { useChatDocuments } from "../../../hooks/use-chat-documents";
import IconButton from "../../../components/ui/IconButton";
import GrantPanel, { type PanelTab, type SourceFocus } from "../../../components/chat/GrantPanel";
import { ChatPanelContext, type ChatPanelApi, type PanelAnswer } from "../../../components/chat/chat-panel-context";
import type { GrantSummaryData } from "../../../components/chat/grant-facts";
import { grantNameOf } from "../../../common/grant-pdf";
import "../../../styles/playground.css";

const PANEL_KEY = "grantwell:chat-grant-panel";
const PHONE_QUERY = "(max-width: 767px)";

function storedPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function usePhone(): boolean {
  const query = useMemo(() => (typeof window.matchMedia === "function" ? window.matchMedia(PHONE_QUERY) : null), []);
  const [phone, setPhone] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const onChange = () => setPhone(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, [query]);
  return phone;
}

export default function Playground() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("grant") ?? searchParams.get("folder") ?? searchParams.get("nofo");
  const grant = grantNameOf(documentIdentifier);
  const [nofoName, setNofoName] = useState("New grant");
  const [summary, setSummary] = useState<GrantSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const apiClient = useApiClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const helpButtonRef = React.useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const phone = usePhone();
  const [panelOpen, setPanelOpen] = useState(storedPanelOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("facts");
  const [answers, setAnswers] = useState<PanelAnswer[]>([]);
  const [selectedReply, setSelectedReply] = useState<number | null>(null);
  const [focus, setFocus] = useState<SourceFocus | null>(null);
  const documents = useChatDocuments(sessionId, documentIdentifier);
  const modalOpen = helpOpen || sheetOpen;
  const inertContentRef = useInert<HTMLDivElement>(modalOpen);
  const panelShown = !phone && panelOpen;

  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    try {
      localStorage.setItem(PANEL_KEY, next ? "shown" : "hidden");
    } catch {
      // A per-browser convenience only.
    }
  };

  useEffect(() => {
    if (!phone) setSheetOpen(false);
  }, [phone]);

  const panelApi = useMemo<ChatPanelApi>(
    () => ({
      citationsInPanel: panelShown,
      setAnswers,
      showSource: (reply, citation) => {
        setSelectedReply(reply);
        setTab("sources");
        setFocus((prev) => ({ reply, citation, token: (prev?.token ?? 0) + 1 }));
      },
    }),
    [panelShown]
  );

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
        const summaryResult = await apiClient.landingPage.getNOFOSummary(documentIdentifier);
        setSummary(summaryResult?.data ?? null);
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
    if (helpOpen) {
      const hasSeenPlaygroundHelp = localStorage.getItem("playgroundHelpSeen");
      setDontShowAgain(hasSeenPlaygroundHelp === "true");
    }
  }, [helpOpen]);

  useEffect(() => {
    const hasSeenPlaygroundHelp = localStorage.getItem("playgroundHelpSeen");
    if (!hasSeenPlaygroundHelp && !isLoading) {
      setHelpOpen(true);
    }
  }, [isLoading]);

  const panelProps = {
    grant,
    summary,
    answers,
    selectedReply,
    focus,
    tab,
    onTab: setTab,
    documents,
  };

  return (
    <>
      <BaseAppLayout
        header={null}
        documentIdentifier={documentIdentifier ?? undefined}
        sessionId={sessionId}
        modalOpen={modalOpen}
        content={
          <ChatPanelContext.Provider value={panelApi}>
            <div ref={inertContentRef} className="pg-layout" aria-hidden={modalOpen || undefined}>
              <div className={`pg-layout__inner${panelShown ? " pg-layout__inner--panel" : ""}`}>
                <div className="pg-chat">
                  <div className="pg-chat-header">
                    <div className="pg-chat-heading">
                      <p className="pg-eyebrow">Chat</p>
                      <h1 className="pg-header-title">{isLoading ? "Loading..." : nofoName}</h1>
                    </div>
                    <div className="pg-chat-actions">
                      <button
                        ref={helpButtonRef}
                        type="button"
                        className="gw-btn gw-btn--secondary gw-btn--slim pg-help-btn"
                        onClick={() => setHelpOpen(!helpOpen)}
                        aria-label={helpOpen ? "Close help dialog" : "Open help dialog"}
                        aria-expanded={helpOpen}
                      >
                        <LuCircleHelp size={16} aria-hidden="true" /> Help
                      </button>
                      {documentIdentifier &&
                        (phone ? (
                          <button
                            type="button"
                            className="gw-btn gw-btn--secondary gw-btn--slim"
                            aria-haspopup="dialog"
                            onClick={() => setSheetOpen(true)}
                          >
                            Grant info
                          </button>
                        ) : (
                          <IconButton
                            label={panelOpen ? "Hide grant panel" : "Show grant panel"}
                            aria-expanded={panelOpen}
                            aria-controls="pg-grant-panel"
                            tipAlign="end"
                            onClick={togglePanel}
                          >
                            {panelOpen ? <LuPanelRightClose size={20} aria-hidden="true" /> : <LuPanelRightOpen size={20} aria-hidden="true" />}
                          </IconButton>
                        ))}
                    </div>
                  </div>
                  <Chat sessionId={sessionId} documentIdentifier={documentIdentifier ?? undefined} />
                </div>
                {documentIdentifier && !phone && (
                  <aside id="pg-grant-panel" aria-label="Grant panel" className="pg-panel" hidden={!panelOpen}>
                    <h2 className="visually-hidden">Grant panel</h2>
                    <GrantPanel idPrefix="panel" label="Grant panel" {...panelProps} />
                  </aside>
                )}
              </div>
            </div>
          </ChatPanelContext.Provider>
        }
      />

      {documentIdentifier && phone && (
        <Modal
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Grant info"
          closeLabel="Close grant info"
          variant="sheet"
        >
          <GrantPanel idPrefix="sheet" label="Grant info" {...panelProps} />
        </Modal>
      )}

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
              Assess your organization&apos;s eligibility for specific grants
            </li>
            <li>
              Explain deadlines, submission requirements, budget rules, and
              compliance requirements
            </li>
          </ul>
        </div>

        <div className="pg-info-section">
          <h3 className="pg-info-heading">Grant panel</h3>
          <p className="pg-info-text">
            Key facts, the sources an answer used and the documents the AI reads are in the Grant
            panel beside the chat (Grant info on a phone). Select a numbered source in an answer to
            see the passage it came from.
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
          <label htmlFor="dont-show-again-playground" className="pg-checkbox-label">
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

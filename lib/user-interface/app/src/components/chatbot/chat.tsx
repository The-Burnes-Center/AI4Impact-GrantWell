import React, { useContext, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChatBotHistoryItem, ChatBotMessageType, FeedbackData } from "./types";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./chat-message";
import ChatInputPanel, { ChatScrollState } from "./chat-input-panel";
import { CHATBOT_NAME } from "../../common/constants";
import { useNotifications } from "../notif-manager";
// Import icons
import {
  FileText,
  HelpCircle,
  Loader as FaSpinner,
  X as FaTimes,
} from "lucide-react";

// Styles for components
const styles: Record<string, React.CSSProperties> = {
  chatContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    position: "relative",
    paddingBottom: "100px",
    backgroundColor: "#fbfbfd",
  },
  messageArea: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
    paddingBottom: "100px",
    backgroundColor: "#fbfbfd",
  },
  messageList: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  infoAlert: {
    backgroundColor: "#f0f4f8",
    border: "1px solid #d0e0f0",
    borderRadius: "6px",
    padding: "12px 16px",
    marginBottom: "16px",
    display: "flex",
    alignItems: "flex-start",
    color: "#2c5282",
    fontSize: "14px",
  },
  infoIcon: {
    marginRight: "10px",
    marginTop: "2px",
    flexShrink: 0,
    color: "#3182ce",
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "30px 0",
    color: "#718096",
  },
  spinner: {
    display: "inline-block",
    width: "20px",
    height: "20px",
    border: "3px solid rgba(0, 0, 0, 0.1)",
    borderRadius: "50%",
    borderTopColor: "#3182ce",
    animation: "spin 1s linear infinite",
    marginRight: "8px",
  },
  welcomeText: {
    textAlign: "center",
    color: "#718096",
    fontStyle: "italic",
    padding: "20px",
  },
  inputContainer: {
    border: "none",
    backgroundColor: "#f8fafc",
    padding: "10px",
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "70%",
    maxWidth: "800px",
    zIndex: 100,
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
    borderRadius: "12px",
    borderTop: "3px solid #0073bb",
  },
  // Modal Styles
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
    width: "800px",
    maxWidth: "90%",
    maxHeight: "85vh",
    overflowY: "auto",
    padding: "32px",
    position: "relative",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "24px",
    fontWeight: 600,
    marginBottom: "20px",
    paddingBottom: "16px",
    borderBottom: "1px solid #e1e4e8",
    color: "#1a73e8",
  },
  modalContent: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    fontSize: "16px",
    lineHeight: "1.4",
  },
  closeButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "18px",
    color: "#718096",
    padding: "6px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.2s",
  },
  checkboxContainer: {
    marginTop: "0px",
    marginBottom: "0px",
    display: "flex",
    alignItems: "center",
    fontWeight: 500,
  },
  checkbox: {
    marginRight: "10px",
    width: "16px",
    height: "16px",
    accentColor: "#1a73e8",
  },
  listItem: {
    marginBottom: "5px",
    paddingLeft: "5px",
  },
};

export default function Chat(props: {
  sessionId?: string;
  documentIdentifier?: string;
}) {
  const appContext = useContext(AppContext);
  const navigate = useNavigate();
  const [running, setRunning] = useState<boolean>(true);
  const [session, setSession] = useState<{ id: string; loading: boolean }>({
    id: props.sessionId ?? uuidv4(),
    loading: typeof props.sessionId !== "undefined",
  });

  const { notifications, addNotification } = useNotifications();
  const [messageHistory, setMessageHistory] = useState<ChatBotHistoryItem[]>(
    []
  );
  const [showPopup, setShowPopup] = useState<boolean>(true);
  const [doNotShowAgain, setDoNotShowAgain] = useState<boolean>(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Check localStorage on component mount
  useEffect(() => {
    const shouldShowPopup = localStorage.getItem("showGrantWellPopup");
    if (shouldShowPopup === "false") {
      setShowPopup(false);
    }
  }, []);

  // Handle checkbox change
  const handleDoNotShowAgainChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setDoNotShowAgain(e.target.checked);
  };

  // Handle modal dismiss
  const handleModalDismiss = () => {
    if (doNotShowAgain) {
      localStorage.setItem("showGrantWellPopup", "false");
    }
    setShowPopup(false);
  };

  // Handle click outside modal
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        handleModalDismiss();
      }
    }

    if (showPopup) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPopup]);

  /** Loads session history */
  useEffect(() => {
    if (!appContext) return;
    setMessageHistory([]);

    (async () => {
      if (!props.sessionId) {
        const newSessionId = uuidv4();
        setSession({ id: newSessionId, loading: false });
        return;
      }

      setSession({ id: props.sessionId, loading: true });

      const apiClient = new ApiClient(appContext);
      try {
        const username = await Auth.currentAuthenticatedUser().then(
          (value) => value.username
        );
        if (!username) return;
        const hist = await apiClient.sessions.getSession(
          props.sessionId,
          username
        );

        if (hist && hist.length > 0) {
          setMessageHistory(hist);
          window.scrollTo({
            top: 0,
            behavior: "instant",
          });
        } else if (hist.length == 0) {
          const summaryResult = await apiClient.landingPage.getNOFOSummary(
            props.documentIdentifier
          );
          const grantName = summaryResult.data.GrantName;

          const initialMessage = {
            type: ChatBotMessageType.AI,
            content: `Hello! I see that you are working on the ${grantName} grant. Could you please tell me which agency, municipality, or tribe we are building this narrative for?`,
            metadata: {},
          };
          setMessageHistory([initialMessage]);
        }
        setSession({ id: props.sessionId, loading: false });
        setRunning(false);
      } catch (error) {
        console.log(error);
        addNotification("error", error.message);
        addNotification("info", "Please refresh the page");
      }
    })();
  }, [appContext, props.sessionId, props.documentIdentifier]);

  /** Adds some metadata to the user's feedback */
  const handleFeedback = (
    feedbackType: 1 | 0,
    idx: number,
    message: ChatBotHistoryItem,
    feedbackTopic?: string,
    feedbackProblem?: string,
    feedbackMessage?: string
  ) => {
    if (props.sessionId) {
      const prompt = messageHistory[idx - 1].content;
      const completion = message.content;

      const feedbackData = {
        sessionId: props.sessionId,
        feedback: feedbackType,
        prompt: prompt,
        completion: completion,
        topic: feedbackTopic,
        problem: feedbackProblem,
        comment: feedbackMessage,
        sources: JSON.stringify(message.metadata.Sources),
        documentIdentifier: props.documentIdentifier,
      };
      addUserFeedback(feedbackData);
    }
  };

  /** Makes the API call via the ApiClient to submit the feedback */
  const addUserFeedback = async (feedbackData: FeedbackData) => {
    if (!appContext) return;
    const apiClient = new ApiClient(appContext);
    await apiClient.userFeedback.sendUserFeedback(feedbackData);
  };

  return (
    <div style={styles.chatContainer}>
      {/* Welcome Modal */}
      {showPopup && (
        <div style={styles.modalOverlay}>
          <div ref={modalRef} style={styles.modal}>
            <div style={styles.modalHeader}>
              <span>Welcome to GrantWell!</span>
              <button
                style={styles.closeButton}
                onClick={handleModalDismiss}
                aria-label="Close"
              >
                <FaTimes size={20} />
              </button>
            </div>

            <div style={styles.modalContent}>
              <p>
                Welcome to the GrantWell chatbot interface! The purpose of this
                chatbot is to prompt you through the project narrative section
                of your grant. The chatbot will begin by prompting you for some
                basic information.
                <br></br>
                For GrantWell to work best, upload supplementary data through
                the "upload data" link to best help us craft a narrative that
                reflects your organization.
                <br></br>
                <br></br>
                Examples of data could include:
                <ul
                  style={{
                    paddingLeft: "24px",
                    marginBottom: "16px",
                    marginTop: "4px",
                  }}
                >
                  <li style={styles.listItem}>Last year's annual report</li>
                  <li style={styles.listItem}>Latest accomplishments</li>
                  <li style={styles.listItem}>
                    Previously submitted proposals for this grant
                  </li>
                  <li style={styles.listItem}>Project narrative template</li>
                </ul>
              </p>
              <p
                style={{
                  fontWeight: 500,
                  color: "#1a73e8",
                }}
              >
                Ensure you upload as much as supplementary data before beginning
                conversation with the chatbot.
              </p>
              <p style={{ fontSize: "14px", color: "#666", marginTop: "4px" }}>
                Click the "View Help" Button in the upper right corner to access
                this information again.
              </p>
              <div style={styles.checkboxContainer}>
                <input
                  type="checkbox"
                  id="doNotShowAgain"
                  checked={doNotShowAgain}
                  onChange={handleDoNotShowAgainChange}
                  style={styles.checkbox}
                />
                <label htmlFor="doNotShowAgain">
                  Do not show this message again
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat content area */}
      <div style={styles.messageArea}>
        <div style={styles.messageList}>
          {messageHistory.length === 0 && !session?.loading && (
            <div style={styles.infoAlert}>
              <HelpCircle size={20} style={styles.infoIcon} />
              <span>
                AI Models can make mistakes. Be mindful in validating important
                information.
              </span>
            </div>
          )}

          {messageHistory.map((message, idx) => (
            <ChatMessage
              key={idx}
              message={message}
              onThumbsUp={() => handleFeedback(1, idx, message)}
              onThumbsDown={(
                feedbackTopic: string,
                feedbackType: string,
                feedbackMessage: string
              ) =>
                handleFeedback(
                  0,
                  idx,
                  message,
                  feedbackTopic,
                  feedbackType,
                  feedbackMessage
                )
              }
            />
          ))}

          {messageHistory.length === 0 && !session?.loading && (
            <div style={styles.welcomeText}>{CHATBOT_NAME}</div>
          )}

          {session?.loading && (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <span>Loading session</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat input area */}
      <div style={styles.inputContainer}>
        <ChatInputPanel
          session={session}
          running={running}
          setRunning={setRunning}
          messageHistory={messageHistory}
          setMessageHistory={(history) => setMessageHistory(history)}
          documentIdentifier={props.documentIdentifier}
        />
      </div>
    </div>
  );
}

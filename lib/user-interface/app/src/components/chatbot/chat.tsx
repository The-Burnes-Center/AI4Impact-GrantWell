import { useContext, useEffect, useState, useRef } from "react";
import { ChatBotHistoryItem, ChatBotMessageType, FeedbackData } from "./types";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./chat-message";
import ChatInputPanel, { ChatScrollState } from "./chat-input-panel";
import styles from "../../styles/chat.module.scss";
import { CHATBOT_NAME } from "../../common/constants";
import { useNotifications } from "../notif-manager";
// Import icons
import { FaInfoCircle, FaSpinner, FaTimes } from "react-icons/fa";

export default function Chat(props: {
  sessionId?: string;
  documentIdentifier?: string;
}) {
  const appContext = useContext(AppContext);
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

  // Styles for components
  const containerStyle = {
    height: "calc(100vh - 100px)",
    display: "flex",
    flexDirection: "column" as const,
  };

  const messagesContainerStyle = {
    flex: 1,
    overflowY: "auto" as const,
    paddingBottom: "20px",
  };

  const messageSpacingStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  };

  const alertStyle = {
    backgroundColor: "#f5f8fa",
    border: "1px solid #d1d5da",
    borderRadius: "4px",
    padding: "16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "14px",
    color: "#24292e",
  };

  const alertIconStyle = {
    color: "#0366d6",
    fontSize: "18px",
  };

  const welcomeTextStyle = {
    textAlign: "center" as const,
    padding: "20px",
    color: "#6a737d",
    fontStyle: "italic",
  };

  const loadingStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "#6a737d",
  };

  const spinnerStyle = {
    animation: "spin 1s linear infinite",
    display: "inline-block",
    color: "#0366d6",
  };

  const inputContainerStyle = {
    position: "sticky" as const,
    bottom: 0,
    backgroundColor: "white",
    paddingTop: "10px",
    borderTop: "1px solid #e1e4e8",
  };

  const modalOverlayStyle = {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: showPopup ? "flex" : "none",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  };

  const modalStyle = {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    width: "600px",
    maxWidth: "90%",
    maxHeight: "80vh",
    overflowY: "auto" as const,
    padding: "24px",
    position: "relative" as const,
  };

  const modalHeaderStyle = {
    fontSize: "20px",
    fontWeight: 600,
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e1e4e8",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const modalContentStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  };

  const closeButtonStyle = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "18px",
    padding: "4px",
    color: "#6a737d",
  };

  const checkboxContainerStyle = {
    marginTop: "16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const checkboxStyle = {
    marginRight: "8px",
  };

  const listItemStyle = {
    marginLeft: "20px",
    marginBottom: "8px",
  };

  // Add keyframes for spinner animation
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

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
    <div className={styles.chat_container} style={containerStyle}>
      {/* Custom Modal */}
      <div style={modalOverlayStyle}>
        <div ref={modalRef} style={modalStyle}>
          <div style={modalHeaderStyle}>
            <div>Welcome to GrantWell!</div>
            <button
              style={closeButtonStyle}
              onClick={handleModalDismiss}
              aria-label="Close"
            >
              <FaTimes />
            </button>
          </div>
          <div style={modalContentStyle}>
            <p>
              Welcome to the GrantWell chatbot interface! The purpose of this
              chatbot is to prompt you through the project narrative section of
              your grant.
            </p>
            <p>
              The chatbot will begin by prompting you for some basic
              information.
            </p>
            <p>
              For GrantWell to work best, upload supplementary data through the
              "upload data' link to best help us craft a narrative that reflects
              your organization.
            </p>
            <p>Examples of data could include:</p>
            <ul>
              <li style={listItemStyle}>Last year's annual report</li>
              <li style={listItemStyle}>Latest accomplishments</li>
              <li style={listItemStyle}>
                Previously submitted proposals for this grant
              </li>
              <li style={listItemStyle}>Project narrative template</li>
            </ul>
            <p>
              Ensure you upload all supplementary data before beginning
              conversation with the chatbot.
            </p>
            <p>
              Click the "i" icon in the upper right corner to access this
              information again.
            </p>
            <div style={checkboxContainerStyle}>
              <input
                type="checkbox"
                id="doNotShowAgain"
                checked={doNotShowAgain}
                onChange={handleDoNotShowAgainChange}
                style={checkboxStyle}
              />
              <label htmlFor="doNotShowAgain">
                Do not show this message again
              </label>
            </div>
          </div>
        </div>
      </div>

      <div style={messagesContainerStyle}>
        <div style={messageSpacingStyle}>
          {messageHistory.length == 0 && !session?.loading && (
            <div style={alertStyle}>
              <FaInfoCircle style={alertIconStyle} aria-label="Info" />
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
        </div>

        <div className={styles.welcome_text} style={welcomeTextStyle}>
          {messageHistory.length == 0 && !session?.loading && (
            <div>{CHATBOT_NAME}</div>
          )}
          {session?.loading && (
            <div style={loadingStyle}>
              <FaSpinner style={spinnerStyle} />
              <span>Loading session</span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.input_container} style={inputContainerStyle}>
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

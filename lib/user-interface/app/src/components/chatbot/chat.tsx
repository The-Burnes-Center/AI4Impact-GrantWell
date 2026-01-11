import React, { useContext, useEffect, useState } from "react";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./chat-message";
import ChatInputPanel from "./chat-input-panel";
import { CHATBOT_NAME } from "../../common/constants";
import { useNotifications } from "../notif-manager";
import { HelpCircle } from "lucide-react";

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
    color: "#5a6876",
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
    color: "#5a6876",
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
    minWidth: "280px",
    zIndex: 100,
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
    borderRadius: "12px",
    borderTop: "3px solid #14558F",
  },
};

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
        const hist = await apiClient.sessions.getSession({
          sessionId: props.sessionId,
          userId: username,
        });

        if (hist?.chatHistory && hist.chatHistory.length > 0) {
          setMessageHistory(hist.chatHistory);
          window.scrollTo({
            top: 0,
            behavior: "instant",
          });
        } else if (!hist?.chatHistory || hist.chatHistory.length === 0) {
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

  return (
    <section aria-label="GrantWell assistant chat" style={styles.chatContainer}>
      {/* Chat content area */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
        tabIndex={0}
        style={styles.messageArea}
      >
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
            <ChatMessage key={idx} message={message} />
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

      {/* Loading state announcement for screen readers */}
      <div role="status" aria-live="polite" className="sr-only">
        {session?.loading ? "Loading chat session" : ""}
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
    </section>
  );
}

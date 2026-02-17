import React, { useContext, useEffect, useState, useRef } from "react";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import ChatMessage from "./ChatMessage";
import ChatInputPanel from "./ChatInputPanel";
import { CHATBOT_NAME } from "../../common/constants";
import { useNotifications } from "../notifications/NotificationManager";
import { HelpCircle, ChevronDown } from "lucide-react";
import { parseChatHistory } from "./utils";

// Styles for components
const styles: Record<string, React.CSSProperties> = {
  chatContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#fbfbfd",
    minHeight: 0,
    flex: 1,
  },
  messageArea: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "20px",
    paddingBottom: "20px",
    backgroundColor: "#fbfbfd",
    minHeight: 0,
    scrollBehavior: "smooth",
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
    padding: "20px",
    width: "100%",
    maxWidth: "100%",
    zIndex: 100,
    boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.1)",
    borderTop: "3px solid #14558F",
    flexShrink: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollToBottomButton: {
    position: "absolute",
    bottom: "140px", // Increased from 100px to position it higher above the input container
    right: "20px",
    backgroundColor: "#14558F",
    color: "white",
    border: "none",
    borderRadius: "50%",
    width: "44px",
    height: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
    zIndex: 60, // Increased z-index to ensure it's above the input container
    transition: "all 0.2s ease",
    opacity: 0,
    pointerEvents: "none",
    outline: "none", // Remove default browser outline
    WebkitAppearance: "none", // Remove webkit default styling
    MozAppearance: "none", // Remove Firefox default styling
  },
  scrollToBottomButtonVisible: {
    opacity: 1,
    pointerEvents: "auto",
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
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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
        
        let hist;
        try {
          hist = await apiClient.sessions.getSession({
            sessionId: props.sessionId,
            userId: username,
          });
        } catch (error: any) {
          // If session doesn't exist (404), create it with initial greeting
          // Otherwise, rethrow the error
          if (error.message && error.message.includes("No record found")) {
            hist = null; // Session doesn't exist, will create it below
          } else {
            throw error; // Re-throw other errors
          }
        }

        if (hist?.chatHistory && hist.chatHistory.length > 0) {
          // Convert backend format to frontend format
          const parsedHistory = parseChatHistory(hist.chatHistory);
          setMessageHistory(parsedHistory);
          // Scroll to bottom of message area to show latest messages
          setTimeout(() => {
            if (messageAreaRef.current) {
              messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
            }
          }, 100);
        } else {
          // Session doesn't exist or has no history - create initial greeting
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
          
          // Save the initial greeting to DynamoDB so it persists on refresh
          try {
            await apiClient.sessions.createSession({
              sessionId: props.sessionId,
              userId: username,
              title: `Chat about ${grantName}`,
              documentIdentifier: props.documentIdentifier || "",
              chatHistory: [{ user: "", chatbot: initialMessage.content, metadata: "" }],
            });
          } catch (error) {
            console.warn("Failed to save initial greeting:", error);
            // Don't show error to user, just log it - the message is still displayed
          }
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

  // Check if user has scrolled up to show scroll-to-bottom button
  useEffect(() => {
    const messageArea = messageAreaRef.current;
    if (!messageArea) return;

    const checkScrollPosition = () => {
      const isNearBottom =
        messageArea.scrollHeight -
          messageArea.scrollTop -
          messageArea.clientHeight <
        100;
      setShowScrollToBottom(!isNearBottom && messageHistory.length > 0);
    };

    messageArea.addEventListener("scroll", checkScrollPosition);
    checkScrollPosition(); // Initial check

    return () => {
      messageArea.removeEventListener("scroll", checkScrollPosition);
    };
  }, [messageHistory]);

  // Scroll to bottom when typing finishes (running changes from true to false)
  useEffect(() => {
    if (!running && messageHistory.length > 0) {
      // Small delay to ensure DOM has updated with final message content
      setTimeout(() => {
        if (messageAreaRef.current) {
          messageAreaRef.current.scrollTo({
            top: messageAreaRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 100);
    }
  }, [running, messageHistory.length]);

  const scrollToBottom = () => {
    if (messageAreaRef.current) {
      messageAreaRef.current.scrollTo({
        top: messageAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  return (
    <section aria-label="GrantWell assistant chat" style={styles.chatContainer}>
      {/* Chat content area */}
      <div
        ref={messageAreaRef}
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
            <ChatMessage key={idx} message={message} documentIdentifier={props.documentIdentifier} />
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

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          style={{
            ...styles.scrollToBottomButton,
            ...styles.scrollToBottomButtonVisible,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#104472";
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#14558F";
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
          }}
        >
          <ChevronDown size={20} />
        </button>
      )}

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
          messageAreaRef={messageAreaRef}
        />
      </div>
    </section>
  );
}

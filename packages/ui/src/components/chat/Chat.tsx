import React, { useCallback, useContext, useEffect, useLayoutEffect, useState, useRef } from "react";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";
import { getCurrentUser } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import type { ChatSession } from "../../common/api-client/sessions-client";
import { Link } from "react-router";
import ChatMessage from "./ChatMessage";
import ChatInputPanel from "./ChatInputPanel";
import { useBranding } from "../../common/branding";
import { useNotifications } from "../notifications/NotificationManager";
import { LuCircleHelp, LuChevronDown, LuLoader } from "react-icons/lu";
import { parseChatHistory } from "./utils";
import { KB_SYNC_UNKNOWN_MESSAGE, type KbSyncStatus } from "../../hooks/use-kb-sync-poll";
import chatStyles from "../../styles/chat.module.scss";

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
    borderTop: "3px solid var(--gw-color-primary)",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollToBottomButton: {
    position: "absolute",
    bottom: "140px", // Increased from 100px to position it higher above the input container
    right: "20px",
    backgroundColor: "var(--gw-color-primary)",
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
    WebkitAppearance: "none", // Remove webkit default styling
    MozAppearance: "none", // Remove Firefox default styling
  },
  scrollToBottomButtonVisible: {
    opacity: 1,
    pointerEvents: "auto",
  },
  unavailable: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "12px",
    maxWidth: "560px",
    margin: "24px auto",
    padding: "16px 20px",
    border: "1px solid var(--gw-color-border)",
    borderRadius: "8px",
    backgroundColor: "var(--gw-color-white)",
    color: "var(--gw-color-text)",
    fontSize: "15px",
  },
  unavailableLink: {
    color: "var(--gw-color-primary)",
    fontWeight: 600,
  },
  earlierRow: {
    display: "flex",
    justifyContent: "center",
  },
  earlierButton: {
    backgroundColor: "white",
    border: "1px solid var(--gw-color-border, #cbd5e0)",
    borderRadius: "6px",
    padding: "8px 16px",
    color: "var(--gw-color-primary)",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
  },
};

/** Scrolling up to within this distance of the top loads the next older page. */
const EARLIER_SCROLL_THRESHOLD_PX = 200;

export default function Chat(props: {
  sessionId?: string;
  documentIdentifier?: string;
  kbSyncStatus?: KbSyncStatus;
}) {
  const appContext = useContext(AppContext);
  const branding = useBranding();
  const [running, setRunning] = useState<boolean>(true);
  const [session, setSession] = useState<{ id: string; loading: boolean }>({
    id: props.sessionId ?? uuidv4(),
    loading: typeof props.sessionId !== "undefined",
  });

  const { addNotification } = useNotifications();
  const [messageHistory, setMessageHistory] = useState<ChatBotHistoryItem[]>(
    []
  );
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [replyStatus, setReplyStatus] = useState<string>("");
  const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);
  const prevRunningRef = useRef<boolean>(running);
  const awaitingReplyRef = useRef<boolean>(false);
  // Older pages live apart from messageHistory, which ChatInputPanel rewrites while a reply streams.
  const [olderMessages, setOlderMessages] = useState<ChatBotHistoryItem[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [earlierStatus, setEarlierStatus] = useState("");
  const sessionIdRef = useRef(props.sessionId);
  const earlierButtonRef = useRef<HTMLButtonElement>(null);
  const scrollRestoreRef = useRef<{ height: number; top: number; focusTranscript: boolean } | null>(null);
  const loadOlderRef = useRef<() => Promise<void>>(async () => {});

  const pendingSessionRef = useRef<ChatSession | null>(null);
  const savingSessionRef = useRef<Promise<void> | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const ensureSession = useCallback((): Promise<void> => {
    const pending = pendingSessionRef.current;
    if (pending && appContext) {
      pendingSessionRef.current = null;
      savingSessionRef.current = new ApiClient(appContext).sessions
        .createSession(pending)
        .then((): void => undefined)
        .catch((error: unknown): void => console.warn("Failed to save initial greeting:", error));
    }
    return savingSessionRef.current ?? Promise.resolve();
  }, [appContext]);

  /** Loads session history */
  useEffect(() => {
    if (!appContext) return;
    sessionIdRef.current = props.sessionId;
    pendingSessionRef.current = null;
    savingSessionRef.current = null;
    setUnavailable(false);
    setMessageHistory([]);
    setOlderMessages([]);
    setOlderCursor(null);
    setLoadingOlder(false);
    setEarlierStatus("");

    (async () => {
      if (!props.sessionId) {
        const newSessionId = uuidv4();
        setSession({ id: newSessionId, loading: false });
        return;
      }

      setSession({ id: props.sessionId, loading: true });

      const sessionId = props.sessionId;
      const showUnavailable = () => {
        setUnavailable(true);
        setSession({ id: sessionId, loading: false });
        setRunning(false);
      };
      const apiClient = new ApiClient(appContext);
      try {
        const username = await getCurrentUser().then(
          (value) => value.username
        );
        if (!username) return;
        
        let hist;
        try {
          hist = await apiClient.sessions.getSession({
            sessionId: props.sessionId,
            userId: username,
          });
        } catch (error: unknown) {
          // If session doesn't exist (404), create it with initial greeting
          // Otherwise, rethrow the error
          if (error instanceof Error && error.message.includes("No record found")) {
            hist = null; // Session doesn't exist, will create it below
          } else {
            throw error; // Re-throw other errors
          }
        }

        if (hist?.chatHistory && hist.chatHistory.length > 0) {
          // Convert backend format to frontend format
          const parsedHistory = parseChatHistory(hist.chatHistory as unknown as Array<Record<string, unknown>>);
          setMessageHistory(parsedHistory);
          setOlderCursor(hist.olderCursor);
          // Scroll to bottom of message area to show latest messages
          setTimeout(() => {
            if (messageAreaRef.current) {
              messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
            }
          }, 100);
        } else {
          if (!props.documentIdentifier) {
            showUnavailable();
            return;
          }
          let grantName: string;
          try {
            const summaryResult = await apiClient.landingPage.getNOFOSummary(
              props.documentIdentifier
            );
            grantName = summaryResult.data.GrantName;
          } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 403 || status === 404) {
              showUnavailable();
              return;
            }
            throw error;
          }

          const initialMessage = {
            type: ChatBotMessageType.AI,
            content: `Hello! I see that you are working on the ${grantName} grant. Could you please tell me which agency, municipality, or tribe we are preparing this application for?`,
            metadata: {},
          };
          setMessageHistory([initialMessage]);
          // Saved with the first message, so opening a chat and leaving adds nothing to My Chats.
          pendingSessionRef.current = {
            sessionId: props.sessionId,
            userId: username,
            title: `Chat about ${grantName}`,
            documentIdentifier: props.documentIdentifier,
            chatHistory: [{ user: "", chatbot: initialMessage.content, metadata: "" }],
          };
        }
        setSession({ id: props.sessionId, loading: false });
        setRunning(false);
      } catch (error) {
        console.warn("Could not load the chat:", error);
        setSession({ id: props.sessionId, loading: false });
        addNotification("error", "We couldn't load this chat. Refresh the page to try again.");
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

  useEffect(() => {
    messageHistoryRef.current = messageHistory;
  }, [messageHistory]);

  /** The transcript is deliberately not a live region, so nothing announces the
   * end of a reply — an empty status region is silent. Report the outcome once,
   * on the running true -> false edge. */
  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = running;

    if (running) {
      // True on mount as well as while replying, so only a false -> true edge
      // counts as a reply the user actually asked for.
      awaitingReplyRef.current = !wasRunning;
      return;
    }
    if (!wasRunning || !awaitingReplyRef.current) return;
    awaitingReplyRef.current = false;

    const history = messageHistoryRef.current;
    const last = history[history.length - 1];
    if (last?.type !== ChatBotMessageType.AI || last.metadata?.stopped) {
      setReplyStatus("Response stopped");
    } else if (last.metadata?.timedOut) {
      setReplyStatus("Response timed out. Send your message again to retry.");
    } else if (last.metadata?.limitReached) {
      setReplyStatus(last.content);
    } else {
      setReplyStatus(last.content ? "Assistant replied" : "No response received");
    }
  }, [running]);

  const loadOlder = async () => {
    const sessionId = props.sessionId;
    if (!appContext || !sessionId || !olderCursor || loadingOlder) return;
    const focusWasOnButton = document.activeElement === earlierButtonRef.current;
    setLoadingOlder(true);
    setEarlierStatus("Loading earlier messages…");
    try {
      const { username } = await getCurrentUser();
      const page = await new ApiClient(appContext).sessions.getSession({
        sessionId,
        userId: username,
        cursor: olderCursor,
      });
      if (sessionIdRef.current !== sessionId) return;
      const older = parseChatHistory((page?.chatHistory ?? []) as unknown as Array<Record<string, unknown>>);
      const nextCursor = page?.olderCursor ?? null;
      const area = messageAreaRef.current;
      if (area) {
        scrollRestoreRef.current = {
          height: area.scrollHeight,
          top: area.scrollTop,
          focusTranscript: focusWasOnButton && !nextCursor,
        };
      }
      setOlderMessages((current) => [...older, ...current]);
      setOlderCursor(nextCursor);
      setEarlierStatus("Earlier messages loaded");
    } catch (error) {
      if (sessionIdRef.current !== sessionId) return;
      console.warn("Could not load earlier messages:", error);
      setEarlierStatus("");
      addNotification("error", "Could not load earlier messages.");
    } finally {
      if (sessionIdRef.current === sessionId) setLoadingOlder(false);
    }
  };
  loadOlderRef.current = loadOlder;

  /** Keeps the messages the user was reading in place when older ones are inserted above them. */
  useLayoutEffect(() => {
    const restore = scrollRestoreRef.current;
    const area = messageAreaRef.current;
    if (!restore || !area) return;
    scrollRestoreRef.current = null;
    const behavior = area.style.scrollBehavior;
    area.style.scrollBehavior = "auto";
    area.scrollTop = restore.top + (area.scrollHeight - restore.height);
    area.style.scrollBehavior = behavior;
    if (restore.focusTranscript) area.focus({ preventScroll: true });
  }, [olderMessages]);

  useEffect(() => {
    const area = messageAreaRef.current;
    if (!area) return;
    let lastTop = area.scrollTop;
    const onScroll = () => {
      const movingUp = area.scrollTop < lastTop;
      lastTop = area.scrollTop;
      if (movingUp && area.scrollTop < EARLIER_SCROLL_THRESHOLD_PX) void loadOlderRef.current();
    };
    area.addEventListener("scroll", onScroll);
    return () => area.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = () => {
    if (messageAreaRef.current) {
      messageAreaRef.current.scrollTo({
        top: messageAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  let replyCount = 0;
  const replyNumber = (message: ChatBotHistoryItem) =>
    message.type === ChatBotMessageType.AI ? ++replyCount : undefined;

  return (
    <section aria-label="GrantWell assistant chat" style={styles.chatContainer}>
      {/* Not role="log": every streamed chunk rewrites the last turn, so a live
          transcript re-announces the whole growing reply. Completion is
          announced by the status region below instead. */}
      <div
        ref={messageAreaRef}
        role="group"
        aria-label="Chat transcript"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region needs keyboard access (WCAG 2.1.1)
        tabIndex={0}
        className={chatStyles.transcript}
        style={styles.messageArea}
      >
        <ul style={{ ...styles.messageList, listStyle: "none", padding: 0, margin: 0 }}>
          {messageHistory.length === 0 && !session?.loading && !unavailable && (
            <li style={styles.infoAlert}>
              <LuCircleHelp size={20} style={styles.infoIcon} aria-hidden="true" />
              <span>
                AI Models can make mistakes. Be mindful in validating important
                information.
              </span>
            </li>
          )}

          {olderCursor && (
            <li style={styles.earlierRow}>
              <button
                ref={earlierButtonRef}
                type="button"
                onClick={() => void loadOlder()}
                aria-disabled={loadingOlder}
                style={styles.earlierButton}
              >
                {loadingOlder ? "Loading earlier messages…" : "Show earlier messages"}
              </button>
            </li>
          )}

          {olderMessages.map((message, idx) => (
            <li key={`older-${olderMessages.length - idx}`}>
              <ChatMessage message={message} documentIdentifier={props.documentIdentifier} replyNumber={replyNumber(message)} />
            </li>
          ))}

          {messageHistory.map((message, idx) => (
            <li key={idx}>
              <ChatMessage message={message} documentIdentifier={props.documentIdentifier} replyNumber={replyNumber(message)} />
            </li>
          ))}

          {messageHistory.length === 0 && !session?.loading && !unavailable && (
            <li style={styles.welcomeText}>{branding.appName}</li>
          )}

          {session?.loading && (
            <li style={styles.loadingContainer}>
              <div style={styles.spinner} aria-hidden="true"></div>
              <span>Loading chat</span>
            </li>
          )}

          {unavailable && (
            <li style={styles.unavailable}>
              <p style={{ margin: 0 }}>
                This chat isn&apos;t available. It may have been deleted, or the link is wrong.
              </p>
              <Link to="/chat/sessions" style={styles.unavailableLink}>
                Go to My Chats
              </Link>
            </li>
          )}
        </ul>
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
            e.currentTarget.style.backgroundColor = "var(--gw-color-primary-hover)";
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--gw-color-primary)";
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
          }}
        >
          <LuChevronDown size={20} aria-hidden="true" />
        </button>
      )}

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {session?.loading
          ? "Loading chat"
          : unavailable
          ? "This chat isn't available."
          : running
          ? "Assistant is replying"
          : replyStatus}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {earlierStatus}
      </div>

      <div role="status" aria-live="polite" className="visually-hidden">
        {props.kbSyncStatus === "indexing"
          ? "Indexing your supporting documents. You can keep chatting."
          : props.kbSyncStatus === "unknown"
          ? KB_SYNC_UNKNOWN_MESSAGE
          : ""}
      </div>

      {/* KB indexing banner */}
      {(props.kbSyncStatus === "indexing" || props.kbSyncStatus === "unknown") && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            backgroundColor: "var(--gw-color-primary-light, #DFECE0)",
            borderTop: "1px solid var(--gw-color-border, #e2e8f0)",
            color: "var(--gw-color-primary-hover, #195C53)",
            fontSize: "13px",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {props.kbSyncStatus === "indexing" ? (
            <>
              <LuLoader
                size={14}
                aria-hidden="true"
                style={{ animation: "spin 1s linear infinite" }}
              />
              Your supporting documents are being indexed. Newly added documents will
              appear in results once indexing completes — you can keep chatting in the
              meantime.
            </>
          ) : (
            KB_SYNC_UNKNOWN_MESSAGE
          )}
        </div>
      )}

      {!unavailable && (
        <div style={styles.inputContainer}>
          <ChatInputPanel
            session={session}
            running={running}
            setRunning={setRunning}
            messageHistory={messageHistory}
            setMessageHistory={(history) => setMessageHistory(history)}
            documentIdentifier={props.documentIdentifier}
            messageAreaRef={messageAreaRef}
            ensureSession={ensureSession}
          />
        </div>
      )}
    </section>
  );
}

import React, {
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { Auth } from "aws-amplify";
import TextareaAutosize from "react-textarea-autosize";
import { ReadyState } from "react-use-websocket";
import { AppContext } from "../../common/app-context";
import {
  ChatBotHistoryItem,
  ChatBotMessageType,
  ChatInputState,
} from "./types";

import { assembleHistory } from "./utils";

import { Utils } from "../../common/utils";
import { SessionRefreshContext } from "../../common/session-refresh-context";
import { useNotifications } from "../notifications/NotificationManager";
import { Mic, MicOff, Send, Loader, AlertCircle } from "lucide-react";

// Styles for the components
const styles = {
  inputContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  inputBorder: {
    border: "2px solid #e5e7eb",
    borderRadius: "16px",
    overflow: "hidden",
    backgroundColor: "white",
    display: "flex",
    alignItems: "flex-end",
    width: "100%",
    maxWidth: "800px",
    minWidth: "280px",
    margin: "0 auto",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    padding: "8px 12px",
  },
  inputBorderFocused: {
    borderColor: "#14558F",
    boxShadow: "0 0 0 3px rgba(0, 115, 187, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.05)",
  },
  micButton: {
    padding: "10px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#6b7280",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "44px",
    minHeight: "44px",
    borderRadius: "12px",
    margin: "0 4px 0 0",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  micActive: {
    color: "#ef4444",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  micDisabled: {
    color: "#9ca3af",
    cursor: "not-allowed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "44px",
    minHeight: "44px",
    margin: "0 4px 0 0",
  },
  inputTextarea: {
    flex: 1,
    resize: "none",
    padding: "12px",
    border: "none",
    outline: "none",
    fontFamily: "inherit",
    fontSize: "14px",
    backgroundColor: "transparent",
  },
  uploadButton: {
    padding: "10px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#5a6169",
  },
  sendButton: {
    padding: "12px",
    background: "linear-gradient(135deg, #14558F 0%, #0A2B48 100%)",
    border: "none",
    cursor: "pointer",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    outline: "none",
    borderRadius: "12px",
    minWidth: "44px",
    minHeight: "44px",
  },
  sendButtonDisabled: {
    background: "#e5e7eb",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
  spinner: {
    animation: "spin 1s linear infinite",
  },
};

export interface ChatInputPanelProps {
  running: boolean;
  setRunning: Dispatch<SetStateAction<boolean>>;
  session: { id: string; loading: boolean };
  messageHistory: ChatBotHistoryItem[];
  setMessageHistory: (history: ChatBotHistoryItem[]) => void;
  documentIdentifier: string;
  messageAreaRef?: React.RefObject<HTMLDivElement>;
  kbSyncing?: boolean;
}

export abstract class ChatScrollState {
  static userHasScrolled = false;
  static skipNextScrollEvent = false;
  static skipNextHistoryUpdate = false;
}

function ChatInputPanel(props: ChatInputPanelProps) {
  const appContext = useContext(AppContext);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [micListeningTimeout, setMicListeningTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const { notifications, addNotification } = useNotifications();
  
  // Ref for chat input to enable auto-focus
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Enhanced speech recognition config
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition({
    clearTranscriptOnListen: true,
    commands: [],
  });

  const [state, setState] = useState<ChatInputState>({
    value: "",
  });
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.OPEN);
  const messageHistoryRef = useRef<ChatBotHistoryItem[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const [micHovered, setMicHovered] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Handle microphone permission check with enhanced error handling
  const handleMicrophoneToggle = async () => {
    if (listening) {
      SpeechRecognition.stopListening();
      if (micListeningTimeout) {
        clearTimeout(micListeningTimeout);
        setMicListeningTimeout(null);
      }
      return;
    }

    try {
      // Request microphone permission explicitly
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop()); // Stop the tracks after permission check

      // Start listening with enhanced settings
      await SpeechRecognition.startListening({
        continuous: true,
        language: "en-US",
      });

      // Set a timeout to automatically stop listening after 30 seconds
      const timeout = setTimeout(() => {
        if (listening) {
          SpeechRecognition.stopListening();
          addNotification(
            "info",
            "Speech recognition stopped after 30 seconds. Click the microphone button to start again."
          );
        }
      }, 30000);

      setMicListeningTimeout(timeout);
      setMicPermissionDenied(false);
    } catch (error) {
      console.error("Microphone permission error:", error);
      setMicPermissionDenied(true);
      addNotification(
        "error",
        "Microphone access denied. Please enable microphone access in your browser settings."
      );
    }
  };

  useEffect(() => {
    messageHistoryRef.current = props.messageHistory;
  }, [props.messageHistory]);

  // Auto-focus chat input on component mount for keyboard accessibility
  useEffect(() => {
    // Small delay to ensure component is fully rendered
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    
    return () => clearTimeout(timer);
  }, []);

  /** Speech recognition */
  useEffect(() => {
    if (transcript) {
      setState((state) => ({ ...state, value: transcript }));
    }
  }, [transcript]);

  // Clear any permission errors and timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (listening) {
        SpeechRecognition.stopListening();
      }
      if (micListeningTimeout) {
        clearTimeout(micListeningTimeout);
      }
    };
  }, [listening, micListeningTimeout]);

  useEffect(() => {
    const messageArea = props.messageAreaRef?.current;
    if (!messageArea) return;

    const onMessageAreaScroll = () => {
      if (ChatScrollState.skipNextScrollEvent) {
        ChatScrollState.skipNextScrollEvent = false;
        return;
      }

      const isScrollToTheEnd =
        Math.abs(
          messageArea.scrollHeight -
            messageArea.scrollTop -
            messageArea.clientHeight
        ) <= 10;

      if (!isScrollToTheEnd) {
        ChatScrollState.userHasScrolled = true;
      } else {
        ChatScrollState.userHasScrolled = false;
      }
    };

    messageArea.addEventListener("scroll", onMessageAreaScroll);

    return () => {
      messageArea.removeEventListener("scroll", onMessageAreaScroll);
    };
  }, [props.messageAreaRef]);

  useLayoutEffect(() => {
    if (ChatScrollState.skipNextHistoryUpdate) {
      ChatScrollState.skipNextHistoryUpdate = false;
      return;
    }

    const messageArea = props.messageAreaRef?.current;
    if (!messageArea) return;

    if (!ChatScrollState.userHasScrolled && props.messageHistory.length > 0) {
      ChatScrollState.skipNextScrollEvent = true;
      // Scroll to bottom of message area with smooth behavior
      messageArea.scrollTo({
        top: messageArea.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [props.messageHistory, props.messageAreaRef]);

  /**Sends a message to the chat API */
  const handleSendMessage = async () => {
    if (!props.documentIdentifier) {
      addNotification(
        "error",
        "No Document selected. Please select a document to proceed."
      );
      return;
    }
    if (props.running) return;
    if (readyState !== ReadyState.OPEN) return;
    ChatScrollState.userHasScrolled = false;

    let username: string | undefined;
    await Auth.currentAuthenticatedUser().then(
      (value: any) => {
        username = value.username;
      }
    );
    if (!username) return;

    const messageToSend = state.value.trim();
    if (messageToSend.length === 0) {
      addNotification("error", "Please do not submit blank text!");
      return;
    }
    setState({ value: "" });

    try {
      props.setRunning(true);
      let receivedData = "";

      let newChatEntry = [];

      const isFirstMessage = messageHistoryRef.current.length === 1;

      if (isFirstMessage) {
        newChatEntry = [
          messageHistoryRef.current[0],
          {
            type: ChatBotMessageType.Human,
            content: messageToSend,
            metadata: {},
          },
        ];
      } else {
        newChatEntry = [
          {
            type: ChatBotMessageType.Human,
            content: messageToSend,
            metadata: {},
          },
        ];
      }

      /**Add the user's query to the message history and a blank dummy message
       * for the chatbot as the response loads
       */
      messageHistoryRef.current = [
        ...messageHistoryRef.current,
        ...newChatEntry.slice(isFirstMessage ? 1 : 0),

        {
          type: ChatBotMessageType.AI,
          content: receivedData,
          metadata: {},
        },
      ];
      props.setMessageHistory(messageHistoryRef.current);

      let firstTime = false;
      if (messageHistoryRef.current.length < 3) {
        firstTime = true;
      }

      const TEST_URL = appContext.wsEndpoint + "/";

      // Get a JWT token for the API to authenticate on
      const TOKEN = await Utils.authenticate();

      const wsUrl = TEST_URL + "?Authorization=" + TOKEN;
      const ws = new WebSocket(wsUrl);

      let incomingMetadata: boolean = false;
      let sources: Record<string, Array<{ title: string; uri: string }>> = {};

      /**If there is no response after a minute, time out the response to try again. */
      setTimeout(() => {
        if (receivedData == "") {
          ws.close();
          messageHistoryRef.current.pop();
          messageHistoryRef.current.push({
            type: ChatBotMessageType.AI,
            content: "Response timed out!",
            metadata: {},
          });
        }
      }, 60000);

      // Event listener for when the connection is open
      ws.addEventListener("open", function open() {
        const message = JSON.stringify({
          action: "getChatbotResponse",
          data: {
            userMessage: messageToSend,
            chatHistory: assembleHistory(
              messageHistoryRef.current.slice(0, -2)
            ),
            projectId: "apck1608",
            user_id: username,
            session_id: props.session.id,
            documentIdentifier: props.documentIdentifier,
          },
        });

        ws.send(message);
      });
      // Event listener for incoming messages
      ws.addEventListener("message", async function incoming(data) {
        /**This is a custom tag from the API that denotes that an error occured
         * and the next chunk will be an error message. */
        if (data.data.includes("<!ERROR!>:")) {
          addNotification("error", data.data);
          ws.close();
          return;
        }
        /**This is a custom tag from the API that denotes when the model response
         * ends and when the sources are coming in
         */
        if (data.data == "!<|EOF_STREAM|>!") {
          incomingMetadata = true;
          return;
        }
        if (!incomingMetadata) {
          receivedData += data.data;
        } else {
          const parsed: Array<{ title: string; uri: string }> = JSON.parse(data.data);
          const sourceData = parsed.map((item: { title: string; uri: string }) => {
            if (item.title == "") {
              return {
                title: item.uri.slice(
                  item.uri.lastIndexOf("/") + 1
                ),
                uri: item.uri,
              };
            } else {
              return item;
            }
          });
          sources = { Sources: sourceData };
        }

        // Update the chat history state with the new message
        messageHistoryRef.current = [
          ...messageHistoryRef.current.slice(0, -2),

          {
            type: ChatBotMessageType.Human,
            content: messageToSend,
            metadata: {},
          },
          {
            type: ChatBotMessageType.AI,
            content: receivedData,
            metadata: sources,
          },
        ];
        props.setMessageHistory(messageHistoryRef.current);
      });
      // Handle possible errors
      ws.addEventListener("error", function error(err) {
        console.error("WebSocket error:", err);
      });
      // Handle WebSocket closure
      ws.addEventListener("close", async function close() {
        // if this is a new session, the backend will update the session list, so
        // we need to refresh
        if (firstTime) {
          Utils.delay(1500).then(() => setNeedsRefresh(true));
        }
        props.setRunning(false);
        
        // Ensure final scroll to bottom after message is complete
        // Small delay to ensure DOM has updated with final content
        setTimeout(() => {
          const messageArea = props.messageAreaRef?.current;
          if (messageArea && !ChatScrollState.userHasScrolled) {
            ChatScrollState.skipNextScrollEvent = true;
            messageArea.scrollTo({
              top: messageArea.scrollHeight,
              behavior: "smooth",
            });
          }
        }, 150);
      });
    } catch (error) {
      console.error("Error sending message:", error);
      alert(
        "Sorry, something has gone horribly wrong! Please try again or refresh the page."
      );
      props.setRunning(false);
    }
  };

  return (
    <div
      style={{
        ...styles.inputBorder,
        ...(isInputFocused ? styles.inputBorderFocused : {}),
      }}
    >
      <label htmlFor="chat-input" className="sr-only">
        {props.kbSyncing
          ? "Chat is disabled while documents are being indexed"
          : "Message the GrantWell assistant"}
      </label>
      {/* Microphone button with enhanced feedback */}
      {browserSupportsSpeechRecognition ? (
        <button
          style={{
            ...styles.micButton,
            ...(listening ? styles.micActive : {}),
            ...(micHovered && !listening ? { backgroundColor: "#f3f4f6", color: "#14558F" } : {}),
            ...(micPermissionDenied ? { color: "#ef4444" } : {}),
          }}
          aria-label={
            micPermissionDenied
              ? "Microphone access denied. Click to try again."
              : listening
              ? "Stop voice input"
              : "Start voice input"
          }
          aria-pressed={listening}
          onClick={handleMicrophoneToggle}
          onMouseEnter={() => setMicHovered(true)}
          onMouseLeave={() => setMicHovered(false)}
          title={
            micPermissionDenied
              ? "Microphone access denied. Click to try again."
              : listening
              ? "Click to stop speech recognition"
              : "Click to start speech recognition"
          }
        >
          {micPermissionDenied ? (
            <AlertCircle size={20} aria-hidden="true" />
          ) : listening ? (
            <MicOff size={20} aria-hidden="true" />
          ) : (
            <Mic size={20} aria-hidden="true" />
          )}
        </button>
      ) : (
        <span
          style={styles.micDisabled}
          title="Your browser doesn't support speech recognition"
          aria-label="Speech recognition not supported"
        >
          <MicOff size={20} aria-hidden="true" />
        </span>
      )}

      {/* Add visual feedback for speech recognition */}
      {listening && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#1f2937",
            color: "white",
            padding: "10px 18px",
            borderRadius: "12px",
            fontSize: "14px",
            marginBottom: "12px",
            whiteSpace: "nowrap",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#ef4444",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
          Listening... Click to stop
        </div>
      )}

      {/* Text input */}
      <TextareaAutosize
        ref={inputRef}
        id="chat-input"
        aria-label="Message the GrantWell assistant"
        aria-describedby="chat-input-help"
        style={{
          flex: 1,
          resize: "none",
          padding: "12px 8px",
          border: "none",
          outline: "none",
          fontFamily: "inherit",
          fontSize: "15px",
          lineHeight: "1.5",
          backgroundColor: "transparent",
          color: "#1f2937",
        }}
        maxRows={5}
        minRows={1}
        spellCheck={true}
        onChange={(e) =>
          setState((state) => ({ ...state, value: e.target.value }))
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
          }
        }}
        onFocus={() => setIsInputFocused(true)}
        onBlur={() => setIsInputFocused(false)}
        value={state.value}
        placeholder={props.kbSyncing ? "Waiting for document indexing..." : "Type your message..."}
        disabled={props.kbSyncing}
      />
      <span id="chat-input-help" className="sr-only">
        Press Enter to send, Shift+Enter for new line
      </span>

      {/* Send button */}
      <button
        style={{
          ...(readyState !== ReadyState.OPEN ||
          props.running ||
          state.value.trim().length === 0 ||
          props.session.loading ||
          props.kbSyncing
            ? { ...styles.sendButton, ...styles.sendButtonDisabled }
            : {
                ...styles.sendButton,
                ...(isHovered
                  ? {
                      transform: "scale(1.05)",
                      boxShadow: "0 4px 12px rgba(0, 115, 187, 0.3)",
                    }
                  : {}),
              }),
        }}
        disabled={
          readyState !== ReadyState.OPEN ||
          props.running ||
          state.value.trim().length === 0 ||
          props.session.loading ||
          props.kbSyncing
        }
        onClick={handleSendMessage}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Send message"
        title="Send message"
      >
        {props.running ? (
          <Loader size={20} style={{ ...styles.spinner, color: "white" }} />
        ) : (
          <Send size={20} />
        )}
      </button>
    </div>
  );
}

export default React.memo(ChatInputPanel);

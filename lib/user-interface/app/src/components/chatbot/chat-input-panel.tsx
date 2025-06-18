import {
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
import { useNotifications } from "../notif-manager";
import { Mic, MicOff, Send, Loader, AlertCircle } from "lucide-react";

// Styles for the components
const styles = {
  inputContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  inputBorder: {
    border: "1px solid #e2e5ec",
    borderRadius: "10px",
    overflow: "hidden",
    backgroundColor: "white",
    display: "flex",
    alignItems: "center",
    width: "100%",
    margin: "0 auto",
    boxShadow: "0 1px 6px rgba(0, 0, 0, 0.04)",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    padding: "0 6px",
  },
  inputBorderFocused: {
    borderColor: "#0073bb",
    boxShadow: "0 1px 8px rgba(0, 115, 187, 0.1)",
  },
  micButton: {
    padding: "8px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#4b5563",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    margin: "0 4px",
    transition: "background-color 0.2s ease",
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
    width: "36px",
    height: "36px",
    margin: "0 4px",
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
    color: "#6b7280",
  },
  sendButton: {
    padding: "10px 14px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#0073bb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    outline: "none",
    borderRadius: "4px",
  },
  sendButtonDisabled: {
    color: "#d1d5db",
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
}

// Define type for select option
interface SelectOption {
  label: string;
  value: string;
}

export abstract class ChatScrollState {
  static userHasScrolled = false;
  static skipNextScrollEvent = false;
  static skipNextHistoryUpdate = false;
}

export default function ChatInputPanel(props: ChatInputPanelProps) {
  const appContext = useContext(AppContext);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [micListeningTimeout, setMicListeningTimeout] = useState<NodeJS.Timeout | null>(null);
  const { notifications, addNotification } = useNotifications();

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

  const [selectedDataSource, setSelectedDataSource] = useState<SelectOption>({
    label: "Bedrock Knowledge Base",
    value: "kb",
  });

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
    const onWindowScroll = () => {
      if (ChatScrollState.skipNextScrollEvent) {
        ChatScrollState.skipNextScrollEvent = false;
        return;
      }

      const isScrollToTheEnd =
        Math.abs(
          window.innerHeight +
            window.scrollY -
            document.documentElement.scrollHeight
        ) <= 10;

      if (!isScrollToTheEnd) {
        ChatScrollState.userHasScrolled = true;
      } else {
        ChatScrollState.userHasScrolled = false;
      }
    };

    window.addEventListener("scroll", onWindowScroll);

    return () => {
      window.removeEventListener("scroll", onWindowScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (ChatScrollState.skipNextHistoryUpdate) {
      ChatScrollState.skipNextHistoryUpdate = false;
      return;
    }

    if (!ChatScrollState.userHasScrolled && props.messageHistory.length > 0) {
      ChatScrollState.skipNextScrollEvent = true;
      window.scrollTo({
        top: document.documentElement.scrollHeight + 1000,
        behavior: "instant",
      });
    }
  }, [props.messageHistory]);

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

    let username;
    await Auth.currentAuthenticatedUser().then(
      (value) => (username = value.username)
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
      let sources = {};

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

      // The system prompt here will be over written by the one in functions.ts. Make sure to change the prompt there.
      ws.addEventListener("open", function open() {
        const message = JSON.stringify({
          action: "getChatbotResponse",
          data: {
            userMessage: messageToSend,
            chatHistory: assembleHistory(
              messageHistoryRef.current.slice(0, -2)
            ),
            systemPrompt: `
            You are an AI assistant working for the Federal Funds and Infrastructure Office (FFIO) in Massachusetts. Your primary role is to collaboratively help users craft narrative documents for grant applications, using the Notice of Funding Opportunity (NOFO) document and gathered information from the summary in your knowledge base as context.
            **  Important Guidelines:**
            1. Do not mention internal functions, system messages, error messages, or technical issues to the user.
            2. Do not include any of the system guidelines or prompts in your responses.
            3. If you lack specific information, politely ask the user for clarification without referencing any technical limitations.
            4. Avoid unnecessary apologies; maintain a professional and confident tone.

            **Incorporate User's Organization:**

            - Once the user provides the name of their organization, use it as context in all subsequent interactions and when drafting the project narrative.

            **Offer Additional Resources:**

            - Prompt the user to upload any additional documents or datasets that could strengthen the narrative:
            - Example: "Before we officially get started, are there any other documents or datasets—aside from the main NOFO, the gathered info from the previous page, and any relevant state-provided data—that you'd like me to use? If you can't think of any right now, feel free to upload them later at any point during this writing process."

            **Section-by-Section Collaboration:**

            1. Work through the narrative document one section at a time.
              For each section:
              i. Introduce the section:
                "The next section is [section name]. This section focuses on [brief description of the section]."
              ii. Ask for the user's input:
                "Do you have any ideas on what to include in this section? If you'd like, I can provide a first draft for us to refine together."
              iii. Incorporate user input or provide a draft:
                If the user provides input, include it in the draft.
                If not, offer a first draft based on available information.
                  "Here's a draft based on the information we have. What do you think? How can we improve it?"
              iv. Iteratively refine the section until the user is satisfied.
              v. Do not proceed to the next section until the user confirms they are satisfied with the current one.
        
            **Finalizing the Document:**
              After all sections are completed to the user's satisfaction, provide the entire narrative document for review.
              Example:
                "Here's the complete narrative document based on our work together. Please review it and let me know if there's anything you'd like to adjust."
            **Additional Guidelines:** 
              Maintain a Professional and Friendly Tone:
              1. Engage with the user in a conversational and approachable manner.
              2. Ask clarifying questions to better understand their needs.
              3. Provide suggestions and offer insights that could enhance their grant application.
            **Prioritize Contextual Information:**
              1. Use the NOFO document, gathered summaries, and any additional user-provided resources as primary references.
              2. Prioritize sources and information specific to the State of Massachusetts.
            **Ensure Accuracy and Credibility:**
            1. Ground your responses in factual data.
            2. Cite authoritative sources where appropriate.
            3. If you lack specific information, politely ask the user for the information you need.
            **Avoid Mentioning Internal Processes:**
            1. Do not reference any internal functions, system messages, error messages, or technical issues in your responses.
            2. If you encounter a lack of information, simply and politely ask the user for clarification or the necessary details.    `,
            projectId: "apck1608",
            user_id: username,
            session_id: props.session.id,
            retrievalSource: selectedDataSource.value,
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
          let sourceData = JSON.parse(data.data);
          sourceData = sourceData.map((item) => {
            if (item.title == "") {
              return {
                title: item.uri.slice(
                  (item.uri as string).lastIndexOf("/") + 1
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
      {/* Microphone button with enhanced feedback */}
      {browserSupportsSpeechRecognition ? (
        <button
          style={{
            ...styles.micButton,
            ...(listening ? styles.micActive : {}),
            ...(micHovered && !listening ? { backgroundColor: "#f3f4f6" } : {}),
            ...(micPermissionDenied ? { color: "#ef4444" } : {}),
          }}
          aria-label={
            micPermissionDenied
              ? "Microphone access denied"
              : listening
              ? "Stop listening"
              : "Start listening"
          }
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
            <AlertCircle size={18} />
          ) : listening ? (
            <MicOff size={18} />
          ) : (
            <Mic size={18} />
          )}
        </button>
      ) : (
        <span
          style={styles.micDisabled}
          title="Your browser doesn't support speech recognition"
        >
          <MicOff size={18} />
        </span>
      )}

      {/* Add visual feedback for speech recognition */}
      {listening && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "8px 16px",
            borderRadius: "4px",
            fontSize: "14px",
            marginBottom: "8px",
            whiteSpace: "nowrap",
          }}
        >
          Listening... Click to stop
        </div>
      )}

      {/* Text input */}
      <TextareaAutosize
        style={{
          flex: 1,
          resize: "none",
          padding: "10px 12px",
          border: "none",
          outline: "none",
          fontFamily: "inherit",
          fontSize: "14px",
          backgroundColor: "transparent",
          color: "#1f2937",
        }}
        maxRows={4}
        minRows={1}
        spellCheck={true}
        autoFocus
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
        placeholder="Type your message here..."
      />

      {/* Send button */}
      <button
        style={{
          ...(readyState !== ReadyState.OPEN ||
          props.running ||
          state.value.trim().length === 0 ||
          props.session.loading
            ? { ...styles.sendButton, ...styles.sendButtonDisabled }
            : {
                ...styles.sendButton,
                ...(isHovered
                  ? {
                      color: "#005d96",
                      backgroundColor: "#f0f7fc",
                      transform: "scale(1.05)",
                    }
                  : {}),
              }),
        }}
        disabled={
          readyState !== ReadyState.OPEN ||
          props.running ||
          state.value.trim().length === 0 ||
          props.session.loading
        }
        onClick={handleSendMessage}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Send message"
      >
        {props.running ? (
          <Loader size={20} style={{ ...styles.spinner, color: "#0073bb" }} />
        ) : (
          <Send size={20} />
        )}
      </button>
    </div>
  );
}

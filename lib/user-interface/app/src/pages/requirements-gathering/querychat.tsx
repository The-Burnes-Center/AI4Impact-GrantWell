import React, { useEffect, useRef, useState, useContext } from "react";
import { v4 as uuidv4 } from "uuid";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { useParams, useSearchParams } from "react-router-dom";
import { ChatBotHistoryItem, ChatBotMessageType } from "../../components/chatbot/types";
import { Auth } from "aws-amplify";
import { ReadyState } from "react-use-websocket";
import { Utils } from "../../common/utils";

interface Message {
  role: "user" | "bot";
  content: string;
  metadata?: any;
}

export default function QueryChat() {
  const appContext = useContext(AppContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const { documentIdentifier } = useParams();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder") || documentIdentifier;
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.UNINSTANTIATED);
  const [webSocket, setWebSocket] = useState<WebSocket | null>(null);

  // Keep a ref to the messages for WebSocket callbacks
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // Initialize a new session when component mounts
    if (appContext) {
      initializeSession();
    }
  }, [appContext]);

  useEffect(() => {
    // Get username from Auth
    const getUserName = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        if (user && user.username) {
          setUsername(user.username);
        }
      } catch (error) {
        console.error("Error getting authenticated user:", error);
      }
    };
    
    getUserName();
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (webSocket) {
        webSocket.close();
      }
    };
  }, [webSocket]);

  const initializeSession = async () => {
    const newSessionId = uuidv4();
    setSessionId(newSessionId);
    
    try {
      const apiClient = new ApiClient(appContext);
      // Load initial message or welcome message
      setMessages([
        {
          role: "bot",
          content: "Hello! I can help answer questions about this grant opportunity. What would you like to know?",
        },
      ]);
    } catch (error) {
      console.error("Error initializing chat session:", error);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !appContext) return;
    if (isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Get username from Auth if not already available
      let currentUsername = username;
      if (!currentUsername) {
        const user = await Auth.currentAuthenticatedUser();
        currentUsername = user.username;
        setUsername(currentUsername);
      }

      // Add temporary loading message
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: "Thinking...", metadata: { isLoading: true } },
      ]);

      // Create WebSocket connection
      const token = await Utils.authenticate();
      const wsUrl = `${appContext.wsEndpoint}/?Authorization=${token}`;
      const ws = new WebSocket(wsUrl);
      setWebSocket(ws);

      let receivedData = '';
      let incomingMetadata = false;
      let sources = {};

      ws.addEventListener('open', function open() {
        setReadyState(ReadyState.OPEN);
        
        // Prepare the message to send
        const message = JSON.stringify({
          action: "getChatbotResponse",
          message: trimmed,
          projectId: 'rsrs111111',
          user_id: currentUsername,
          session_id: sessionId,
          retrievalSource: "nofo-retrieval",
          documentIdentifier: folderParam,
        });

        ws.send(message);
      });

      // Event listener for incoming messages
      ws.addEventListener('message', function incoming(data) {
        if (data.data.includes("<!ERROR!>:")) {
          // Handle error
          const errorMsg = data.data.replace("<!ERROR!>:", "");
          console.error("WebSocket error:", errorMsg);
          
          // Update messages to show error
          setMessages((prev) => {
            const filtered = prev.filter(msg => !(msg.role === "bot" && msg.metadata?.isLoading));
            return [
              ...filtered,
              {
                role: "bot",
                content: "Sorry, I couldn't process your request right now. Please try again.",
                metadata: { error: true }
              }
            ];
          });
          
          ws.close();
          setIsLoading(false);
          return;
        }

        // Handle end of response marker
        if (data.data === '!<|EOF_STREAM|>!') {
          incomingMetadata = true;
          return;
        }

        if (!incomingMetadata) {
          // Handle normal response content
          receivedData += data.data;
          
          // Update UI with incremental response
          setMessages((prev) => {
            const filtered = prev.filter(msg => !(msg.role === "bot" && msg.metadata?.isLoading));
            return [
              ...filtered,
              {
                role: "bot",
                content: receivedData,
                metadata: sources
              }
            ];
          });
        } else {
          // Handle metadata (sources)
          try {
            let sourceData = JSON.parse(data.data);
            sourceData = sourceData.map((item) => {
              if (item.title === "") {
                return { 
                  title: item.uri.slice((item.uri as string).lastIndexOf("/") + 1), 
                  uri: item.uri 
                };
              } else {
                return item;
              }
            });
            sources = { "Sources": sourceData };
            
            // Update UI with sources
            setMessages((prev) => {
              const filtered = prev.filter(msg => !(msg.role === "bot" && msg.metadata?.isLoading));
              const lastMsg = filtered[filtered.length - 1];
              if (lastMsg && lastMsg.role === "bot") {
                return [
                  ...filtered.slice(0, -1),
                  {
                    ...lastMsg,
                    metadata: sources
                  }
                ];
              }
              return filtered;
            });
          } catch (error) {
            console.error("Error parsing sources:", error);
          }
        }
      });

      // Handle WebSocket close event
      ws.addEventListener('close', function close() {
        setReadyState(ReadyState.CLOSED);
        setIsLoading(false);
        
        // If we got no data, show an error
        if (!receivedData) {
          setMessages((prev) => {
            const filtered = prev.filter(msg => !(msg.role === "bot" && msg.metadata?.isLoading));
            return [
              ...filtered,
              {
                role: "bot",
                content: "Sorry, I couldn't connect to the server. Please try again later.",
                metadata: { error: true }
              }
            ];
          });
        }
      });

      // Handle WebSocket errors
      ws.addEventListener('error', function error(err) {
        console.error("WebSocket error:", err);
        setReadyState(ReadyState.CLOSED);
        setIsLoading(false);
        
        setMessages((prev) => {
          const filtered = prev.filter(msg => !(msg.role === "bot" && msg.metadata?.isLoading));
          return [
            ...filtered,
            {
              role: "bot",
              content: "An error occurred while connecting to the server. Please try again.",
              metadata: { error: true }
            }
          ];
        });
      });
    } catch (e) {
      console.error("Chat error:", e);
      // Remove loading message and add error message
      setMessages((prev) =>
        prev.filter((msg) => !(msg.role === "bot" && msg.metadata?.isLoading))
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content:
            "Sorry, I couldn't process your request right now. Please try again.",
        },
      ]);
      setIsLoading(false);
    }
  };

  // Clear chat functionality
  const handleClearChat = () => {
    setMessages([
      {
        role: "bot",
        content: "Hello! I can help answer questions about this grant opportunity. What would you like to know?",
      },
    ]);
  };

  const TypingIndicator = () => (
    <div
      style={{
        display: "flex",
        gap: "0.3rem",
        padding: "0.5rem",
        alignItems: "center",
      }}
    >
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
    </div>
  );

  // Add message timestamps
  const MessageTimestamp = ({ timestamp }: { timestamp: number }) => (
    <small style={{ color: "#666", fontSize: "0.8rem" }}>
      {new Date(timestamp).toLocaleTimeString()}
    </small>
  );

  // Add copy message functionality
  const CopyButton = ({ content }: { content: string }) => (
    <button
      onClick={() => navigator.clipboard.writeText(content)}
      style={{
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "4px",
      }}
    >
      📋
    </button>
  );

  // Add suggested questions/quick replies
  const QuickReplies = () => (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        margin: "1rem 0",
      }}
    >
      {[
        "What are the requirements?",
        "Tell me about deadlines",
        "How to apply?",
      ].map((q) => (
        <button
          key={q}
          onClick={() => setInput(q)}
          style={{
            border: "1px solid #ddd",
            borderRadius: "15px",
            padding: "0.5rem 1rem",
            background: "white",
            cursor: "pointer",
          }}
        >
          {q}
        </button>
      ))}
    </div>
  );

  return (
    <div
      style={{
        height: "100vh",
        width: "300px",
        backgroundColor: "#f2f2f2",
        borderLeft: "1px solid #ddd",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          padding: "0.75rem 1rem",
          backgroundColor: "#9e8e89",
          borderBottom: "1px solid #8d7e79",
          color: "#000",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        NOFO Assistance
      </div>

      <div 
        style={{ 
          flex: 1, 
          padding: "1rem", 
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: "0.5rem",
              textAlign: msg.role === "user" ? "right" : "left",
              color: msg.role === "user" ? "#006499" : "#333",
            }}
          >
            <div
              style={{
                display: "inline-block",
                backgroundColor: msg.role === "user" ? "#e3f2fd" : "#fff",
                padding: "0.5rem 0.75rem",
                borderRadius: "10px",
                maxWidth: "85%",
                boxShadow: "0px 1px 2px rgba(0,0,0,0.1)",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
              {msg.metadata?.Sources && (
                <div
                  style={{
                    fontSize: "12px",
                    marginTop: "4px",
                    color: "#666",
                  }}
                >
                  {msg.metadata.Sources.length > 0 && (
                    <details>
                      <summary>Sources ({msg.metadata.Sources.length})</summary>
                      <ul style={{ paddingLeft: "20px", margin: "4px 0" }}>
                        {msg.metadata.Sources.map((source, idx) => (
                          <li key={idx}>
                            <a
                              href={source.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#006499" }}
                            >
                              {source.title || "Document"}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messageEndRef} />
      </div>

      {/* Quick Reply Buttons */}
      <div style={{ padding: "0.5rem 1rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          <button
            onClick={() => setInput("What are the eligibility requirements?")}
            style={{
              border: "1px solid #ddd",
              borderRadius: "15px",
              padding: "0.4rem 0.8rem",
              background: "white",
              cursor: "pointer",
              fontSize: "12px",
              whiteSpace: "nowrap",
            }}
          >
            Eligibility
          </button>
          <button
            onClick={() => setInput("What documents are required?")}
            style={{
              border: "1px solid #ddd",
              borderRadius: "15px",
              padding: "0.4rem 0.8rem",
              background: "white",
              cursor: "pointer",
              fontSize: "12px",
              whiteSpace: "nowrap",
            }}
          >
            Required Docs
          </button>
          <button
            onClick={() => setInput("What are the key deadlines?")}
            style={{
              border: "1px solid #ddd",
              borderRadius: "15px",
              padding: "0.4rem 0.8rem",
              background: "white",
              cursor: "pointer",
              fontSize: "12px",
              whiteSpace: "nowrap",
            }}
          >
            Deadlines
          </button>
        </div>
      </div>

      {/* Input Bar */}
      <div
        style={{
          padding: "1rem",
          borderTop: "1px solid #ccc",
          backgroundColor: "#f2f2f2",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "#fff",
            borderRadius: "50px",
            padding: "0.5rem 1rem",
            boxShadow: "0 0 4px rgba(0,0,0,0.1)",
          }}
        >
          <input
            type="text"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "14px",
              color: "#333",
            }}
          />
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginLeft: "0.75rem",
              color: "#006499",
            }}
            onClick={handleSend}
            disabled={isLoading}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 12h14M12 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>
      <style>{`
        .typing-dot {
          width: 8px;
          height: 8px;
          background: #9e8e89;
          border-radius: 50%;
          animation: typing 1s infinite ease-in-out;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
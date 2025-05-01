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

// Custom system prompt for the NOFO assistance bot
const NOFO_SYSTEM_PROMPT = `
You are an AI assistant specializing in helping users understand Notice of Funding Opportunity (NOFO) documents. Your goal is to explain the requirements, eligibility criteria, deadlines, and other important information contained in grant documents.

Your primary responsibilities:
1. Answer questions about the specific grant opportunity documents the user is viewing
2. Explain complex grant terminology in simple terms
3. Highlight key requirements and deadlines
4. Provide clear, accurate information about the application process
5. Direct users to relevant sections of the NOFO document when appropriate

Guidelines:
- Be concise and direct in your responses
- Use bullet points for clarity when listing multiple items
- When citing specific requirements, clearly indicate which sections of the NOFO they come from
- Acknowledge when you're uncertain about specific details rather than making assumptions
- Focus on being helpful for grant seekers who need to understand funding requirements

Remember, users rely on your guidance to navigate complex funding opportunities, so accuracy and clarity are paramount.
`;

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
        
        // Prepare the message to send - updating to match the main chatbot format
        const message = JSON.stringify({
          "action": "getChatbotResponse",
          "data": {
            userMessage: trimmed,
            chatHistory: messagesRef.current
              .filter((msg, index) => {
                // Only include complete pairs of user and bot messages (excluding the loading message)
                if (msg.role === "user" && index < messagesRef.current.length - 1 && 
                    messagesRef.current[index + 1].role === "bot" && 
                    !messagesRef.current[index + 1].metadata?.isLoading) {
                  return true;
                }
                return false;
              })
              .reduce((acc, msg, index, filteredArr) => {
                // Convert to pairs of {user, chatbot, metadata}
                if (msg.role === "user" && index % 2 === 0 && index + 1 < filteredArr.length) {
                  acc.push({
                    "user": msg.content,
                    "chatbot": filteredArr[index + 1].content,
                    "metadata": JSON.stringify(filteredArr[index + 1].metadata || {})
                  });
                }
                return acc;
              }, []),
            systemPrompt: NOFO_SYSTEM_PROMPT,
            projectId: 'rsrs111111',
            user_id: currentUsername,
            session_id: sessionId,
            retrievalSource: "nofo-retrieval",
            documentIdentifier: folderParam,
          }
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
          // Collect response content without updating UI
          receivedData += data.data;
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
            
            // Update UI with complete response and sources at the end
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
          } catch (error) {
            console.error("Error parsing sources:", error);
          }
        }
      });

      // Handle WebSocket close event
      ws.addEventListener('close', function close() {
        setReadyState(ReadyState.CLOSED);
        setIsLoading(false);
        
        // If we got sources metadata and response but connection closed before metadata
        if (receivedData && !incomingMetadata) {
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
        } else if (!receivedData) {
          // If we got no data at all, show an error
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
        backgroundColor: "var(--color-background-container-content-3s0o0o, #ffffff)",
        borderLeft: "1px solid var(--color-border-divider-default-cx07f2, #e9ebed)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-family-base-eynpfp, 'Open Sans', sans-serif)",
      }}
    >
      <div
        style={{
          fontWeight: "700",
          fontSize: "var(--font-panel-header-size-edjz3l, 18px)",
          lineHeight: "var(--font-panel-header-line-height-kxi4u2, 22px)",
          padding: "var(--space-scaled-m-mo5yse, 16px) var(--space-l-t419sm, 20px)",
          backgroundColor: "var(--color-background-container-header-24raev, #f2f3f3)",
          borderBottom: "1px solid var(--color-border-divider-default-cx07f2, #e9ebed)",
          color: "var(--color-text-heading-default-jen9ei, #0f141a)",
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>NOFO Assistance</span>
        <button
          onClick={handleClearChat}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-accent-aohct8, #0972d3)",
            padding: "4px",
            fontSize: "var(--font-size-body-s-asqx2i, 12px)",
            display: "flex",
            alignItems: "center",
          }}
          title="Clear chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div 
        style={{ 
          flex: 1, 
          padding: "var(--space-l-t419sm, 20px)", 
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--color-background-layout-main-2jp88g, #ffffff)",
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: "var(--space-s-34lx8l, 12px)",
              textAlign: msg.role === "user" ? "right" : "left",
            }}
          >
            <div
              style={{
                display: "inline-block",
                backgroundColor: msg.role === "user" 
                  ? "var(--color-background-item-selected-y5t3ei, #f2f8fd)" 
                  : "var(--color-background-container-content-3s0o0o, #ffffff)",
                padding: "var(--space-scaled-s-aqzyko, 12px)",
                borderRadius: "var(--border-radius-item-jdts9w, 8px)",
                maxWidth: "85%",
                boxShadow: "var(--shadow-container-qx99xg, 0px 1px 2px rgba(0,7,22,0.1))",
                wordBreak: "break-word",
                color: msg.role === "user" 
                  ? "var(--color-text-accent-aohct8, #0972d3)" 
                  : "var(--color-text-body-default-7v1jfn, #0f141a)",
                fontSize: "var(--font-size-body-m-x4okxb, 14px)",
                lineHeight: "var(--line-height-body-m-30ar75, 20px)",
                border: msg.role === "user" 
                  ? "none" 
                  : "1px solid var(--color-border-divider-default-cx07f2, #e9ebed)",
              }}
            >
              {msg.content}
              {msg.metadata?.Sources && (
                <div
                  style={{
                    fontSize: "var(--font-size-body-s-asqx2i, 12px)",
                    marginTop: "var(--space-xs-zb16t3, 8px)",
                    color: "var(--color-text-accent-aohct8, #0972d3)",
                  }}
                >
                  {msg.metadata.Sources.length > 0 && (
                    <details>
                      <summary style={{ cursor: "pointer", fontWeight: "700" }}>Sources ({msg.metadata.Sources.length})</summary>
                      <ul style={{ paddingLeft: "20px", margin: "4px 0" }}>
                        {msg.metadata.Sources.map((source, idx) => (
                          <li key={idx}>
                            <a
                              href={source.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "var(--color-text-link-default-enwvrt, #0972d3)" }}
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
      <div style={{ 
        padding: "var(--space-s-34lx8l, 12px) var(--space-l-t419sm, 20px)",
        borderTop: "1px solid var(--color-border-divider-default-cx07f2, #e9ebed)",
        backgroundColor: "var(--color-background-container-content-3s0o0o, #ffffff)"
      }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-xs-zb16t3, 8px)",
            marginBottom: "var(--space-xs-zb16t3, 8px)",
          }}
        >
          <button
            onClick={() => setInput("What are the eligibility requirements?")}
            style={{
              border: "1px solid var(--color-border-button-normal-o8q8gf, #7d8998)",
              borderRadius: "var(--border-radius-button-hbwkej, 8px)",
              padding: "var(--space-scaled-xxs-7597g1, 4px) var(--space-s-34lx8l, 12px)",
              background: "var(--color-background-button-normal-default-57rzys, #ffffff)",
              cursor: "pointer",
              fontSize: "var(--font-size-body-s-asqx2i, 12px)",
              whiteSpace: "nowrap",
              color: "var(--color-text-body-secondary-cwla8d, #414d5c)",
              fontWeight: "400",
              transition: "background-color 0.1s ease",
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--color-background-button-normal-hover-gxfnpo, #f2f8fd)"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "var(--color-background-button-normal-default-57rzys, #ffffff)"}
          >
            Eligibility
          </button>
          <button
            onClick={() => setInput("What documents are required?")}
            style={{
              border: "1px solid var(--color-border-button-normal-o8q8gf, #7d8998)",
              borderRadius: "var(--border-radius-button-hbwkej, 8px)",
              padding: "var(--space-scaled-xxs-7597g1, 4px) var(--space-s-34lx8l, 12px)",
              background: "var(--color-background-button-normal-default-57rzys, #ffffff)",
              cursor: "pointer",
              fontSize: "var(--font-size-body-s-asqx2i, 12px)",
              whiteSpace: "nowrap",
              color: "var(--color-text-body-secondary-cwla8d, #414d5c)",
              fontWeight: "400",
              transition: "background-color 0.1s ease",
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--color-background-button-normal-hover-gxfnpo, #f2f8fd)"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "var(--color-background-button-normal-default-57rzys, #ffffff)"}
          >
            Required Docs
          </button>
          <button
            onClick={() => setInput("What are the key deadlines?")}
            style={{
              border: "1px solid var(--color-border-button-normal-o8q8gf, #7d8998)",
              borderRadius: "var(--border-radius-button-hbwkej, 8px)",
              padding: "var(--space-scaled-xxs-7597g1, 4px) var(--space-s-34lx8l, 12px)",
              background: "var(--color-background-button-normal-default-57rzys, #ffffff)",
              cursor: "pointer",
              fontSize: "var(--font-size-body-s-asqx2i, 12px)",
              whiteSpace: "nowrap",
              color: "var(--color-text-body-secondary-cwla8d, #414d5c)",
              fontWeight: "400",
              transition: "background-color 0.1s ease",
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--color-background-button-normal-hover-gxfnpo, #f2f8fd)"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "var(--color-background-button-normal-default-57rzys, #ffffff)"}
          >
            Deadlines
          </button>
        </div>
      </div>

      {/* Input Bar */}
      <div
        style={{
          padding: "var(--space-m-udix3p, 16px)",
          borderTop: "1px solid var(--color-border-divider-default-cx07f2, #e9ebed)",
          backgroundColor: "var(--color-background-container-content-3s0o0o, #ffffff)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "var(--color-background-input-default-u56ls1, #ffffff)",
            borderRadius: "var(--border-radius-input-plgbrq, 8px)",
            padding: "var(--space-scaled-xxs-7597g1, 4px) var(--space-field-horizontal-gg19kw, 12px)",
            boxShadow: "none",
            border: isLoading 
              ? `var(--border-width-field-h1g7tw, 2px) solid var(--color-border-input-disabled-zrbm8o, #d1d5db)` 
              : `var(--border-width-field-h1g7tw, 2px) solid var(--color-border-input-default-l7v83d, #8c8c94)`,
            transition: "border-color 0.1s ease",
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
            disabled={isLoading}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "var(--font-size-body-m-x4okxb, 14px)",
              color: isLoading 
                ? "var(--color-text-input-disabled-8m1y8u, #9ba7b6)" 
                : "var(--color-text-body-default-7v1jfn, #0f141a)",
              backgroundColor: "transparent",
              padding: "var(--space-scaled-xxs-7597g1, 4px) 0",
              cursor: isLoading ? "not-allowed" : "text",
            }}
          />
          <button
            style={{
              background: "none",
              border: "none",
              cursor: isLoading ? "not-allowed" : "pointer",
              padding: 0,
              marginLeft: "var(--space-xs-zb16t3, 8px)",
              color: isLoading 
                ? "var(--color-text-button-primary-disabled-1opvt6, #9ba7b6)" 
                : "var(--color-text-accent-aohct8, #0972d3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              transition: "color 0.1s ease",
            }}
            onClick={handleSend}
            disabled={isLoading}
            onMouseOver={(e) => {
              if (!isLoading) e.currentTarget.style.color = "var(--color-text-accent-hover-0jcwbj, #033160)";
            }}
            onMouseOut={(e) => {
              if (!isLoading) e.currentTarget.style.color = "var(--color-text-accent-aohct8, #0972d3)";
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" />
            </svg>
          </button>
        </div>
      </div>
      <style>{`
        .typing-dot {
          width: 8px;
          height: 8px;
          background: var(--color-text-accent-aohct8, #0972d3);
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
import * as React from "react";
import { useState, useEffect, useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../../styles/chat.module.scss";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";

// Import icons
import {
  FaCopy,
  FaFileAlt,
  FaCheck,
} from "react-icons/fa";

import "react-json-view-lite/dist/index.css";
import "../../styles/app.scss";
import { useNotifications } from "../notif-manager";
import { Utils } from "../../common/utils";

export interface ChatMessageProps {
  message: ChatBotHistoryItem;
  documentIdentifier?: string;
}

export default function ChatMessage(props: ChatMessageProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const { addNotification, removeNotification } = useNotifications();
  // State for copy icon feedback
  const [copied, setCopied] = useState<boolean>(false);
  const [grantName, setGrantName] = useState<string>("");
  const appContext = useContext(AppContext);



  // Styles for the components
  const containerStyle: React.CSSProperties = {
    padding: "4px 16px",
    borderRadius: "8px",
    backgroundColor: "transparent",
    marginBottom: "4px",
    position: "relative",
    display: "flex",
    flexDirection:
      props.message?.type === ChatBotMessageType.Human ? "row-reverse" : "row",
    alignItems: "flex-end",
    gap: "12px",
  };

  const avatarStyle: React.CSSProperties = {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "600",
    flexShrink: 0,
    backgroundColor:
      props.message?.type === ChatBotMessageType.Human ? "#0A2B48" : "#14558F",
    color: "white",
  };

  const aiContainerStyle = {
    display: "flex",
    flexDirection: "row" as const,
    flex: 1,
    alignItems: "flex-end",
    gap: "8px",
  };

  const messageWrapperStyle = {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
  };

  const copyButtonContainerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    paddingBottom: "4px",
    position: "relative",
  };

  const copyButtonStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "6px",
    minWidth: "32px",
    minHeight: "32px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    borderRadius: "4px",
    transition: "all 0.2s ease",
  };

  const messageBubbleStyle = {
    padding: "12px 16px",
    borderRadius:
      props.message?.type === ChatBotMessageType.Human
        ? "18px 18px 4px 18px"
        : "18px 18px 18px 4px",
    backgroundColor:
      props.message?.type === ChatBotMessageType.Human ? "#14558F" : "#e8eef1",
    color:
      props.message?.type === ChatBotMessageType.Human ? "white" : "#2d3748",
    wordWrap: "break-word" as const,
    boxShadow:
      props.message?.type === ChatBotMessageType.Human
        ? "0 1px 3px rgba(0, 0, 0, 0.1)"
        : "0 2px 4px rgba(0, 0, 0, 0.15)",
    position: "relative" as const,
  };

  const messageContentStyle = {
    wordBreak: "break-word" as const,
    overflowWrap: "break-word" as const,
    width: "100%",
    lineHeight:
      props.message?.type === ChatBotMessageType.AI ? "1.6" : "inherit",
    fontSize:
      props.message?.type === ChatBotMessageType.AI ? "15px" : "inherit",
  };

  const aiActionsStyle = {
    display: "flex",
    marginTop: "8px",
    gap: "8px",
    alignItems: "center",
  };

  const footerStyle = {
    marginTop: "12px",
    display: "flex",
    justifyContent: "flex-start",
    gap: "8px",
  };

  const dropdownButtonStyle = {
    padding: "8px 12px",
    backgroundColor: "#14558F",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    minHeight: "44px",
  };

  const dropdownMenuStyle = {
    position: "absolute" as const,
    bottom: "40px",
    left: "16px",
    backgroundColor: "white",
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
    borderRadius: "4px",
    zIndex: 100,
    minWidth: "200px",
    maxHeight: "300px",
    overflowY: "auto" as const,
  };

  const dropdownItemStyle = {
    padding: "8px 12px",
    display: "block",
    color: "#333",
    textDecoration: "none",
    fontSize: "14px",
    cursor: "pointer",
    width: "100%",
    textAlign: "left" as const,
    border: "none",
    backgroundColor: "transparent",
    borderBottom: "1px solid #eee",
  };

  const buttonStyle = {
    padding: "8px 12px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
  };

  const iconButtonStyle = {
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "8px",
    minWidth: "44px",
    minHeight: "44px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const spinnerStyle = {
    display: "inline-block",
    width: "20px",
    height: "20px",
    border: "3px solid rgba(0, 0, 0, 0.1)",
    borderRadius: "50%",
    borderTopColor: "#14558F",
    animation: "spin 1s linear infinite",
  };

  const successIndicatorStyle = {
    backgroundColor: "#eafbea",
    color: "#067306",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap" as const,
    fontWeight: 500,
  };

  const popoverStyle = {
    position: "absolute" as const,
    right: "40px",
    top: "0px",
    zIndex: 100,
  };

  const popoverContentStyle = {
    padding: "4px",
    backgroundColor: "white",
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
    border: "1px solid #e0e0e0",
  };

  // Keyframes for spinner animation
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

  if (props.message.content === "undefined") {
    return null;
  }

  const content =
    typeof props.message.content === "string" &&
    props.message.content.length > 0
      ? props.message.content
      : "";

  const showSources =
    Array.isArray(props.message.metadata?.Sources) &&
    props.message.metadata.Sources.length > 0;

  // Fetch grant name if documentIdentifier is provided
  useEffect(() => {
    const fetchGrantName = async () => {
      if (!props.documentIdentifier || !appContext || !showSources) return;
      
      try {
        const apiClient = new ApiClient(appContext);
        const summaryResult = await apiClient.landingPage.getNOFOSummary(
          props.documentIdentifier
        );
        if (summaryResult?.data?.GrantName) {
          setGrantName(summaryResult.data.GrantName);
        }
      } catch (error) {
        console.error("Error fetching grant name:", error);
        // Fallback to documentIdentifier name
        const folderName = props.documentIdentifier.split("/").pop();
        setGrantName(folderName || "Grant");
      }
    };

    fetchGrantName();
  }, [props.documentIdentifier, appContext, showSources]);

  // Separate sources into grant sources (NOFO) and uploaded files (userDocuments)
  const sources = showSources ? (props.message.metadata.Sources as any[]) : [];
  const grantSources = sources.filter((source) => 
    source.uri && !source.uri.includes("userDocuments")
  );
  const uploadedFiles = sources.filter((source) => 
    source.uri && source.uri.includes("userDocuments")
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(props.message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article
      aria-label={
        props.message?.type === ChatBotMessageType.AI
          ? "Assistant message"
          : "Your message"
      }
    >
      <div style={containerStyle}>
        {props.message?.type === ChatBotMessageType.AI ? (
          <>
            {/* Avatar for AI */}
            <div style={avatarStyle} aria-label="GrantWell assistant">
              G
            </div>
            {/* Wrapper for message and copy button */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "8px",
                flex: 1,
                maxWidth: "80%",
              }}
            >
              <div style={aiContainerStyle}>
                <div style={messageWrapperStyle}>
                  <div style={messageBubbleStyle}>
                    <span className="sr-only">Assistant replied: </span>
                    <div style={messageContentStyle}>
                      {content?.length === 0 ? (
                        <div style={spinnerStyle}></div>
                      ) : null}

                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1(props) {
                            const { children, ...rest } = props;
                            return <h2 {...rest}>{children}</h2>;
                          },
                          h2(props) {
                            const { children, ...rest } = props;
                            return <h2 {...rest}>{children}</h2>;
                          },
                          h3(props) {
                            const { children, ...rest } = props;
                            return <h2 {...rest}>{children}</h2>;
                          },
                          h4(props) {
                            const { children, ...rest } = props;
                            return <h2 {...rest}>{children}</h2>;
                          },
                          h5(props) {
                            const { children, ...rest } = props;
                            return <h2 {...rest}>{children}</h2>;
                          },
                          h6(props) {
                            const { children, ...rest } = props;
                            return <h2 {...rest}>{children}</h2>;
                          },
                          pre(props) {
                            const { children, ...rest } = props;
                            return (
                              <pre {...rest} className={styles.codeMarkdown}>
                                {children}
                              </pre>
                            );
                          },
                          table(props) {
                            const { children, ...rest } = props;
                            return (
                              <table {...rest} className={styles.markdownTable}>
                                {children}
                              </table>
                            );
                          },
                          th(props) {
                            const { children, ...rest } = props;
                            return (
                              <th
                                {...rest}
                                className={styles.markdownTableCell}
                              >
                                {children}
                              </th>
                            );
                          },
                          td(props) {
                            const { children, ...rest } = props;
                            return (
                              <td
                                {...rest}
                                className={styles.markdownTableCell}
                              >
                                {children}
                              </td>
                            );
                          },
                        }}
                      >
                        {content}
                      </ReactMarkdown>
                    </div>

                    {/* Sources section inside the bubble */}
                    {showSources && (
                      <>
                        {/* Separator line */}
                        <div
                          style={{
                            borderTop: "1px solid #e0e0e0",
                            marginTop: "12px",
                            paddingTop: "12px",
                          }}
                        >
                          <div>
                            {/* Show grant name if available, otherwise show sources count */}
                            {(grantName || grantSources.length > 0) && (
                              <div
                                style={{
                                  fontSize: "14px",
                                  color: "#374151",
                                  fontWeight: 500,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  marginBottom: uploadedFiles.length > 0 ? "8px" : "0",
                                }}
                              >
                                <FaFileAlt size={12} aria-hidden="true" />
                                {grantName || "Grant Document"}
                              </div>
                            )}
                            
                            {/* Show uploaded file names if any */}
                            {uploadedFiles.length > 0 && (
                              <div style={{ marginTop: grantName || grantSources.length > 0 ? "8px" : "0" }}>
                                {uploadedFiles.map((file, index) => (
                                  <div
                                    key={index}
                                    style={{
                                      fontSize: "14px",
                                      color: "#374151",
                                      fontWeight: 500,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      marginBottom: index < uploadedFiles.length - 1 ? "4px" : "0",
                                    }}
                                  >
                                    <FaFileAlt size={12} aria-hidden="true" />
                                    {file.title}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Copy button - now next to the bubble */}
              {props.message.content.length > 0 && (
                <div style={copyButtonContainerStyle}>
                  <button
                    style={copyButtonStyle}
                    onClick={handleCopy}
                    onMouseEnter={(e) => {
                      if (!copied) {
                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                        e.currentTarget.style.color = "#14558F";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!copied) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "#6b7280";
                      }
                    }}
                    onFocus={(e) => {
                      if (!copied) {
                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                        e.currentTarget.style.color = "#14558F";
                      }
                      e.currentTarget.style.outline = "2px solid #0088FF";
                      e.currentTarget.style.outlineOffset = "2px";
                    }}
                    onBlur={(e) => {
                      if (!copied) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "#6b7280";
                      }
                      e.currentTarget.style.outline = "none";
                      e.currentTarget.style.outlineOffset = "0";
                    }}
                    aria-label={copied ? "Copied to clipboard" : "Copy message to clipboard"}
                  >
                    {copied ? (
                      <FaCheck size={14} aria-hidden="true" style={{ color: "#059669" }} />
                    ) : (
                      <FaCopy size={14} aria-hidden="true" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Avatar for User */}
            <div style={avatarStyle} aria-label="User">
              U
            </div>
            <div style={messageBubbleStyle}>
              <span className="sr-only">You said: </span>
              <div style={messageContentStyle}>{props.message.content}</div>
            </div>
          </>
        )}
      </div>

      {loading && (
        <div style={{ float: "left" }}>
          <div style={spinnerStyle}></div>
        </div>
      )}
    </article>
  );
}

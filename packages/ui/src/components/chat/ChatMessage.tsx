import * as React from "react";
import { useState, useEffect, useContext } from "react";
import ModelMarkdown from "../common/ModelMarkdown";
import TableScrollRegion from "../ui/TableScrollRegion";
import styles from "../../styles/chat.module.scss";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";
import { citationSup } from "./citation-sup";
import { citationsOf, remarkCitationMarkers } from "./citations";
import { grantNameOf } from "../../common/grant-pdf";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";

// Import icons
import {
  FaCopy,
  FaFileAlt,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaRegStopCircle,
} from "react-icons/fa";

import "react-json-view-lite/dist/index.css";
import "../../styles/app.scss";

export interface ChatMessageProps {
  message: ChatBotHistoryItem;
  documentIdentifier?: string;
  replyNumber?: number;
}

function ChatMessage(props: ChatMessageProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [grantName, setGrantName] = useState<string>("");
  const [sourcesExpanded, setSourcesExpanded] = useState<boolean>(false);
  const sourceListId = React.useId();
  const appContext = useContext(AppContext);
  const citations = React.useMemo(() => citationsOf(props.message?.metadata), [props.message?.metadata]);
  const citationPlugins = React.useMemo(() => (citations.length ? [remarkCitationMarkers(citations)] : []), [citations]);
  const citationSupRenderer = React.useMemo(
    () => citationSup(citations, { grant: grantNameOf(props.documentIdentifier) }),
    [citations, props.documentIdentifier]
  );



  // Styles for the components
  const containerStyle: React.CSSProperties = {
    padding: "4px 16px",
    borderRadius: "var(--gw-radius-container)",
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
      props.message?.type === ChatBotMessageType.Human ? "var(--gw-color-primary-active)" : "var(--gw-color-primary)",
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

  const messageBubbleStyle = {
    padding: "12px 16px",
    borderRadius:
      props.message?.type === ChatBotMessageType.Human
        ? "18px 18px 4px 18px"
        : "18px 18px 18px 4px",
    backgroundColor:
      props.message?.type === ChatBotMessageType.Human ? "var(--gw-color-primary)" : "var(--gw-color-surface-subtle)",
    color:
      props.message?.type === ChatBotMessageType.Human ? "white" : "var(--gw-color-text)",
    wordWrap: "break-word" as const,
    boxShadow:
      props.message?.type === ChatBotMessageType.Human
        ? "0 1px 3px color-mix(in srgb, var(--gw-color-text-strong) 10%, transparent)"
        : "0 2px 4px color-mix(in srgb, var(--gw-color-text-strong) 15%, transparent)",
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

  const stopped = props.message.metadata?.stopped === true;

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

  const cleanSourceTitle = (title: string) => {
    return title
      .replace(/\s*\(Bedrock Knowledge Base\)\s*$/i, "")
      .replace(/\+/g, " ");
  };

  const sources = showSources ? (props.message.metadata.Sources as Array<{ title: string; uri: string }>) : [];
  const grantSources = sources.filter((source) => 
    source.uri && !source.uri.includes("userDocuments")
  );
  const uploadedFiles = sources.filter((source) => 
    source.uri && source.uri.includes("userDocuments")
  );
  const totalSourceCount = grantSources.length + uploadedFiles.length;

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
            <div style={avatarStyle} role="img" aria-label="GrantWell assistant">
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
                    <span className="sr-only">
                      {content.length === 0 ? "Assistant is typing" : "Assistant replied: "}
                    </span>
                    <div style={messageContentStyle}>
                      {content.length === 0 ? (
                        <span className={styles.typingDots} aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : null}

                      <ModelMarkdown
                        className={styles.answerMarkdown}
                        remarkPlugins={citationPlugins}
                        components={{
                          sup: citationSupRenderer,
                          h1(props) {
                            const { children, ...rest } = props;
                            return <h2 {...rest}>{children}</h2>;
                          },
                          h2(props) {
                            const { children, ...rest } = props;
                            return <h3 {...rest}>{children}</h3>;
                          },
                          h3(props) {
                            const { children, ...rest } = props;
                            return <h4 {...rest}>{children}</h4>;
                          },
                          h4(props) {
                            const { children, ...rest } = props;
                            return <h5 {...rest}>{children}</h5>;
                          },
                          h5(props) {
                            const { children, ...rest } = props;
                            return <h6 {...rest}>{children}</h6>;
                          },
                          h6(props) {
                            const { children, ...rest } = props;
                            return <h6 {...rest}>{children}</h6>;
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
                              <TableScrollRegion
                                label="Table in this answer"
                                className={styles.markdownTableScroll}
                              >
                                <table {...rest} className={styles.markdownTable}>
                                  {children}
                                </table>
                              </TableScrollRegion>
                            );
                          },
                          th(props) {
                            const { children, ...rest } = props;
                            return (
                              <th scope="col" {...rest}>
                                {children}
                              </th>
                            );
                          },
                          td(props) {
                            const { children, ...rest } = props;
                            return <td {...rest}>{children}</td>;
                          },
                        }}
                      >
                        {content}
                      </ModelMarkdown>
                    </div>

                    {stopped && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginTop: "8px",
                          fontSize: "12px",
                          fontStyle: "italic",
                          color: "var(--gw-color-text-secondary)",
                        }}
                      >
                        <FaRegStopCircle size={12} aria-hidden="true" />
                        Response stopped
                      </div>
                    )}

                    {/* Collapsible sources section */}
                    {showSources && (
                      <div
                        style={{
                          borderTop: "1px solid var(--gw-color-border)",
                          marginTop: "12px",
                          paddingTop: "8px",
                        }}
                      >
                        <button
                          onClick={() => setSourcesExpanded(!sourcesExpanded)}
                          aria-expanded={sourcesExpanded}
                          aria-controls={sourcesExpanded ? sourceListId : undefined}
                          aria-label={
                            props.replyNumber
                              ? `Sources (${totalSourceCount}) for reply ${props.replyNumber}`
                              : undefined
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px 0",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--gw-color-text)",
                            width: "100%",
                            textAlign: "left",
                            minHeight: "32px",
                          }}
                        >
                          {sourcesExpanded
                            ? <FaChevronDown size={10} aria-hidden="true" />
                            : <FaChevronRight size={10} aria-hidden="true" />}
                          Sources ({totalSourceCount})
                        </button>

                        {sourcesExpanded && (
                          <div
                            id={sourceListId}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                              paddingTop: "4px",
                              paddingLeft: "4px",
                            }}
                          >
                            {grantSources.length > 0 && (
                              <div role="group" aria-label={grantName || "Grant"}>
                                <div aria-hidden="true" style={{
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  color: "var(--gw-color-text-secondary, #5a5a5a)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  marginBottom: "4px",
                                }}>
                                  {grantName || "Grant"}
                                </div>
                                <div role="list">
                                {grantSources.map((source, idx) => (
                                  <div
                                    key={idx}
                                    role="listitem"
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "13px",
                                      color: "var(--gw-color-text)",
                                      padding: "3px 0",
                                    }}
                                  >
                                    <FaFileAlt size={11} aria-hidden="true" style={{ flexShrink: 0, color: "var(--gw-color-text-muted)" }} />
                                    <span style={{ wordBreak: "break-word" }}>
                                      {cleanSourceTitle(source.title)}
                                    </span>
                                  </div>
                                ))}
                                </div>
                              </div>
                            )}

                            {uploadedFiles.length > 0 && (
                              <div role="group" aria-label="Your supporting documents" style={{ marginTop: grantSources.length > 0 ? "6px" : "0" }}>
                                <div aria-hidden="true" style={{
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  color: "var(--gw-color-text-secondary, #5a5a5a)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  marginBottom: "4px",
                                }}>
                                  Your supporting documents
                                </div>
                                <div role="list">
                                {uploadedFiles.map((file, idx) => (
                                  <div
                                    key={idx}
                                    role="listitem"
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "13px",
                                      color: "var(--gw-color-text)",
                                      padding: "3px 0",
                                    }}
                                  >
                                    <FaFileAlt size={11} aria-hidden="true" style={{ flexShrink: 0, color: "var(--gw-color-accent)" }} />
                                    <span style={{ wordBreak: "break-word", flex: 1 }}>
                                      {cleanSourceTitle(file.title)}
                                    </span>
                                  </div>
                                ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Copy button - now next to the bubble */}
              {props.message.content.length > 0 && (
                <div style={copyButtonContainerStyle}>
                  <button
                    type="button"
                    className="gw-btn gw-btn--icon gw-btn--slim"
                    onClick={handleCopy}
                    aria-label={
                      copied
                        ? "Copied to clipboard"
                        : `Copy ${props.replyNumber ? `reply ${props.replyNumber}` : "message"} to clipboard`
                    }
                  >
                    {copied ? (
                      <FaCheck size={14} aria-hidden="true" style={{ color: "var(--gw-color-success)" }} />
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
            <div style={avatarStyle} role="img" aria-label="User">
              U
            </div>
            <div style={messageBubbleStyle}>
              <span className="sr-only">You said: </span>
              <div style={messageContentStyle}>{props.message.content}</div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export default React.memo(ChatMessage);

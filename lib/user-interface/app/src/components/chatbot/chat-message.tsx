import * as React from "react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../../styles/chat.module.scss";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";

// Import icons
import {
  FaCopy,
  FaThumbsUp,
  FaThumbsDown,
  FaExternalLinkAlt,
  FaChevronDown,
  FaFileAlt,
} from "react-icons/fa";

import "react-json-view-lite/dist/index.css";
import "../../styles/app.scss";
import { useNotifications } from "../notif-manager";
import { Utils } from "../../common/utils";
import { feedbackCategories, feedbackTypes } from "../../common/constants";

export interface ChatMessageProps {
  message: ChatBotHistoryItem;
  onThumbsUp: () => void;
  onThumbsDown: (
    feedbackTopic: string,
    feedbackType: string,
    feedbackMessage: string
  ) => void;
}

export default function ChatMessage(props: ChatMessageProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIcon, setSelectedIcon] = useState<1 | 0 | null>(null);
  const { addNotification, removeNotification } = useNotifications();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState({
    label: "Select a Topic",
    value: "1",
  });
  const [selectedFeedbackType, setSelectedFeedbackType] = useState({
    label: "Select a Problem",
    value: "1",
  });
  const [value, setValue] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // State for copy popup
  const [showCopyPopup, setShowCopyPopup] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
      props.message?.type === ChatBotMessageType.Human ? "#004d7a" : "#0073bb",
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
      props.message?.type === ChatBotMessageType.Human ? "#0073bb" : "#e8eef1",
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
    backgroundColor: "#006499",
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

  const modalOverlayStyle = {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: modalVisible ? "flex" : "none",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  };

  const modalStyle = {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    width: "500px",
    maxWidth: "90%",
    padding: "20px",
    position: "relative" as const,
  };

  const modalHeaderStyle = {
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "16px",
    borderBottom: "1px solid #eee",
    paddingBottom: "12px",
  };

  const modalFooterStyle = {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "16px",
    paddingTop: "12px",
    borderTop: "1px solid #eee",
    gap: "8px",
  };

  const buttonStyle = {
    padding: "8px 12px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#006499",
    color: "white",
  };

  const linkButtonStyle = {
    ...buttonStyle,
    backgroundColor: "transparent",
    color: "#006499",
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

  const selectStyle = {
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "100%",
    marginBottom: "12px",
    fontSize: "14px",
  };

  const inputStyle = {
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "100%",
    marginBottom: "8px",
    fontSize: "14px",
  };

  const formFieldStyle = {
    marginBottom: "16px",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "14px",
    fontWeight: 500,
  };

  const spinnerStyle = {
    display: "inline-block",
    width: "20px",
    height: "20px",
    border: "3px solid rgba(0, 0, 0, 0.1)",
    borderRadius: "50%",
    borderTopColor: "#006499",
    animation: "spin 1s linear infinite",
  };

  const thumbsContainerStyle = {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
  };

  const successIndicatorStyle = {
    backgroundColor: "#eafbea",
    color: "#067306",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "13px",
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

  const handleCopy = () => {
    navigator.clipboard.writeText(props.message.content);
    setShowCopyPopup(true);
    setTimeout(() => setShowCopyPopup(false), 2000);
  };

  return (
    <div>
      {/* Modal for feedback */}
      <div style={modalOverlayStyle}>
        <div
          style={modalStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
        >
          <div style={modalHeaderStyle} id="feedback-modal-title">
            Provide Feedback
          </div>
          <div>
            <div style={formFieldStyle}>
              <label htmlFor="feedback-topic" style={labelStyle}>
                Topic
              </label>
              <select
                id="feedback-topic"
                style={selectStyle}
                value={selectedTopic.value}
                onChange={(e) => {
                  const selected = feedbackCategories.find(
                    (cat) => cat.value === e.target.value
                  );
                  setSelectedTopic(
                    selected || { label: "Select a Topic", value: "1" }
                  );
                }}
                aria-invalid={selectedTopic.value === "1"}
                aria-describedby="feedback-topic-error"
              >
                {feedbackCategories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={formFieldStyle}>
              <label htmlFor="feedback-problem" style={labelStyle}>
                Problem Type
              </label>
              <select
                id="feedback-problem"
                style={selectStyle}
                value={selectedFeedbackType.value}
                onChange={(e) => {
                  const selected = feedbackTypes.find(
                    (type) => type.value === e.target.value
                  );
                  setSelectedFeedbackType(
                    selected || { label: "Select a Problem", value: "1" }
                  );
                }}
                aria-invalid={selectedFeedbackType.value === "1"}
                aria-describedby="feedback-problem-error"
              >
                {feedbackTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={formFieldStyle}>
              <label htmlFor="feedback-input" style={labelStyle}>
                Please enter feedback here
              </label>
              <input
                id="feedback-input"
                type="text"
                style={inputStyle}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={value.trim() === ""}
                aria-describedby="feedback-input-help"
              />
            </div>
          </div>
          <div style={modalFooterStyle}>
            <button
              style={linkButtonStyle}
              onClick={() => {
                setModalVisible(false);
                setValue("");
                setSelectedTopic({ label: "Select a Topic", value: "1" });
                setSelectedFeedbackType({
                  label: "Select a Topic",
                  value: "1",
                });
              }}
            >
              Cancel
            </button>
            <button
              style={primaryButtonStyle}
              onClick={() => {
                if (
                  !selectedTopic.value ||
                  !selectedFeedbackType.value ||
                  selectedTopic.value === "1" ||
                  selectedFeedbackType.value === "1" ||
                  value.trim() === ""
                ) {
                  const id = addNotification(
                    "error",
                    "Please fill out all fields."
                  );
                  Utils.delay(3000).then(() => removeNotification(id));
                  return;
                } else {
                  setModalVisible(false);
                  setValue("");

                  const id = addNotification(
                    "success",
                    "Your feedback has been submitted."
                  );
                  Utils.delay(3000).then(() => removeNotification(id));

                  props.onThumbsDown(
                    selectedTopic.value,
                    selectedFeedbackType.value,
                    value.trim()
                  );
                  setSelectedIcon(0);

                  setSelectedTopic({ label: "Select a Topic", value: "1" });
                  setSelectedFeedbackType({
                    label: "Select a Problem",
                    value: "1",
                  });
                }
              }}
            >
              Ok
            </button>
          </div>
        </div>
      </div>

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
                          <div
                            style={{ position: "relative" }}
                            ref={dropdownRef}
                          >
                            <button
                              style={{
                                backgroundColor: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: "4px 8px",
                                fontSize: "13px",
                                color: "#374151",
                                fontWeight: 500,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                minWidth: "44px",
                                minHeight: "44px",
                                borderRadius: "4px",
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f3f4f6";
                                e.currentTarget.style.color = "#0073bb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                                e.currentTarget.style.color = "#374151";
                              }}
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              aria-label="View source documents"
                              aria-expanded={isDropdownOpen}
                              aria-haspopup="true"
                            >
                              <FaFileAlt size={12} />
                              {
                                (props.message.metadata.Sources as any[]).length
                              }{" "}
                              Sources <FaChevronDown size={10} />
                            </button>

                            {isDropdownOpen && (
                              <div style={dropdownMenuStyle}>
                                {(props.message.metadata.Sources as any[]).map(
                                  (item, index) => (
                                    <a
                                      key={index}
                                      href={item.uri}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={dropdownItemStyle}
                                    >
                                      {item.title}{" "}
                                      <FaExternalLinkAlt
                                        size={10}
                                        style={{ marginLeft: "4px" }}
                                      />
                                    </a>
                                  )
                                )}
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
                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                      e.currentTarget.style.color = "#0073bb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "#6b7280";
                    }}
                    aria-label="Copy message to clipboard"
                  >
                    <FaCopy size={14} />
                  </button>
                  {showCopyPopup && (
                    <div
                      style={{
                        position: "absolute",
                        fontSize: "11px",
                        color: "#059669",
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        marginLeft: "4px",
                      }}
                    >
                      Copied!
                    </div>
                  )}
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
    </div>
  );
}

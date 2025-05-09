import * as React from "react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../../styles/chat.module.scss";
import {
  ChatBotConfiguration,
  ChatBotHistoryItem,
  ChatBotMessageType,
} from "./types";

// Import icons
import {
  FaCopy,
  FaThumbsUp,
  FaThumbsDown,
  FaExternalLinkAlt,
  FaChevronDown,
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
    padding: "16px",
    borderRadius: "8px",
    backgroundColor: "transparent",
    marginBottom: "16px",
    position: "relative",
    display: "flex",
    flexDirection:
      props.message?.type === ChatBotMessageType.Human
        ? "row-reverse"
        : "row",
    alignItems: "flex-start",
  };

  const aiContainerStyle = {
    display: "flex",
    flexDirection: "column" as const,
    maxWidth: "80%",
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
    padding: "6px 12px",
    backgroundColor: "#006499",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
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
    padding: "4px 8px",
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
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  };

  const popoverStyle = {
    position: "absolute" as const,
    right: "40px",
    top: "10px",
    zIndex: 100,
  };

  const popoverContentStyle = {
    padding: "4px 8px",
    backgroundColor: "white",
    borderRadius: "4px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
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

  // State for copy popup
  const [showCopyPopup, setShowCopyPopup] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(props.message.content);
    setShowCopyPopup(true);
    setTimeout(() => setShowCopyPopup(false), 2000);
  };

  return (
    <div>
      {/* Modal for feedback */}
      <div style={modalOverlayStyle}>
        <div style={modalStyle}>
          <div style={modalHeaderStyle}>Provide Feedback</div>
          <div>
            <div style={formFieldStyle}>
              <select
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
              >
                {feedbackCategories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={formFieldStyle}>
              <select
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
              >
                {feedbackTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={formFieldStyle}>
              <label style={labelStyle}>Please enter feedback here</label>
              <input
                type="text"
                style={inputStyle}
                value={value}
                onChange={(e) => setValue(e.target.value)}
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
          <div style={aiContainerStyle}>
            <div style={messageBubbleStyle}>
              <div style={messageContentStyle}>
                {content?.length === 0 ? (
                  <div style={spinnerStyle}></div>
                ) : null}

                {props.message.content.length > 0 ? (
                  <div
                    className={styles.btn_chabot_message_copy}
                    style={{ position: "absolute", top: "8px", right: "8px" }}
                  >
                    <div style={{ position: "relative" }}>
                      <button style={iconButtonStyle} onClick={handleCopy}>
                        <FaCopy size={16} />
                      </button>
                      {showCopyPopup && (
                        <div style={popoverStyle}>
                          <div style={popoverContentStyle}>
                            <div style={successIndicatorStyle}>
                              Copied to clipboard
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <ReactMarkdown
                  children={content}
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
                        <th {...rest} className={styles.markdownTableCell}>
                          {children}
                        </th>
                      );
                    },
                    td(props) {
                      const { children, ...rest } = props;
                      return (
                        <td {...rest} className={styles.markdownTableCell}>
                          {children}
                        </td>
                      );
                    },
                  }}
                />
              </div>
            </div>

            <div style={aiActionsStyle}>
              <div style={{ display: "flex", gap: "8px" }}>
                {(selectedIcon === 1 || selectedIcon === null) && (
                  <button
                    style={iconButtonStyle}
                    onClick={() => {
                      props.onThumbsUp();
                      const id = addNotification(
                        "success",
                        "Thank you for your valuable feedback!"
                      );
                      Utils.delay(3000).then(() => removeNotification(id));
                      setSelectedIcon(1);
                    }}
                  >
                    {selectedIcon === 1 ? (
                      <FaThumbsUp size={16} />
                    ) : (
                      <FaThumbsUp size={16} />
                    )}
                  </button>
                )}
                {(selectedIcon === 0 || selectedIcon === null) && (
                  <button
                    style={iconButtonStyle}
                    onClick={() => {
                      setModalVisible(true);
                    }}
                  >
                    {selectedIcon === 0 ? (
                      <FaThumbsDown size={16} />
                    ) : (
                      <FaThumbsDown size={16} />
                    )}
                  </button>
                )}
              </div>

              {showSources && (
                <div style={footerStyle}>
                  <div style={{ position: "relative" }} ref={dropdownRef}>
                    <button
                      style={dropdownButtonStyle}
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      Sources <FaChevronDown size={12} />
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
              )}
            </div>
          </div>
        ) : (
          <div style={messageBubbleStyle}>
            <div style={messageContentStyle}>{props.message.content}</div>
          </div>
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

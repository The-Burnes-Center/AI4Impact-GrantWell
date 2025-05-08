import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";
import { useNotifications } from "../notif-manager";
import { Utils } from "../../common/utils";
import { feedbackCategories, feedbackTypes } from "../../common/constants";
// Import icons
import {
  Copy,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  ChevronDown,
  Check,
} from "lucide-react";

// Styles for the components
const styles = {
  messageContainer: {
    position: "relative",
    marginBottom: "16px",
  },
  aiMessage: {
    backgroundColor: "#f5f8fa",
    borderRadius: "8px",
    padding: "16px",
    position: "relative",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    borderTopLeftRadius: 0,
    maxWidth: "80%",
    alignSelf: "flex-start",
  },
  humanMessage: {
    backgroundColor: "#1a73e8",
    color: "white",
    borderRadius: "8px",
    padding: "16px",
    position: "relative",
    alignSelf: "flex-end",
    borderBottomRightRadius: 0,
    maxWidth: "80%",
  },
  messageWrapper: {
    display: "flex",
  },
  alignStart: {
    justifyContent: "flex-start",
  },
  alignEnd: {
    justifyContent: "flex-end",
  },
  messageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  messageSender: {
    fontWeight: 500,
  },
  messageTime: {
    fontSize: "12px",
    opacity: 0.7,
  },
  messageContent: {
    whiteSpace: "pre-line",
  },
  messageFooter: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid rgba(0, 0, 0, 0.1)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "4px 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackButtons: {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
  },
  copyButton: {
    position: "absolute",
    top: "8px",
    right: "8px",
    zIndex: 2,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    color: "#6b7280",
  },
  sourceButton: {
    padding: "6px 12px",
    backgroundColor: "#1a73e8",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
  },
  dropdownContainer: {
    position: "relative",
  },
  dropdownMenu: {
    position: "absolute",
    bottom: "40px",
    right: "0",
    backgroundColor: "white",
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
    borderRadius: "4px",
    zIndex: 100,
    minWidth: "200px",
    maxHeight: "300px",
    overflowY: "auto",
  },
  dropdownHeader: {
    padding: "8px 12px",
    fontSize: "14px",
    fontWeight: 500,
    borderBottom: "1px solid #eee",
    backgroundColor: "#f7f9fc",
  },
  dropdownItem: {
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    color: "#333",
    textDecoration: "none",
    fontSize: "14px",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    border: "none",
    backgroundColor: "transparent",
    borderBottom: "1px solid #f5f5f5",
  },
  dropdownItemHover: {
    backgroundColor: "#f5f7fa",
  },
  dropdownIcon: {
    marginLeft: "4px",
    fontSize: "10px",
  },
  // Feedback Modal Styles
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    width: "500px",
    maxWidth: "90%",
    padding: "20px",
    position: "relative",
  },
  modalHeader: {
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "16px",
    borderBottom: "1px solid #eee",
    paddingBottom: "12px",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "16px",
    paddingTop: "12px",
    borderTop: "1px solid #eee",
    gap: "8px",
  },
  formField: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "14px",
    fontWeight: 500,
  },
  input: {
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "100%",
    fontSize: "14px",
  },
  select: {
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "100%",
    marginBottom: "12px",
    fontSize: "14px",
  },
  primaryButton: {
    padding: "8px 12px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    backgroundColor: "#1a73e8",
    color: "white",
  },
  secondaryButton: {
    padding: "8px 12px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    backgroundColor: "transparent",
    color: "#1a73e8",
  },
  // Copy Popup Styles
  popover: {
    position: "absolute",
    right: "40px",
    top: "10px",
    zIndex: 100,
  },
  popoverContent: {
    padding: "4px 8px",
    backgroundColor: "white",
    borderRadius: "4px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  successIndicator: {
    backgroundColor: "#eafbea",
    color: "#067306",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  // Markdown Styles
  codeMarkdown: {
    backgroundColor: "#f5f7fa",
    borderRadius: "4px",
    padding: "12px",
    overflowX: "auto",
    fontFamily: "'Courier New', monospace",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  markdownTable: {
    borderCollapse: "collapse",
    width: "100%",
    margin: "16px 0",
  },
  markdownTableCell: {
    border: "1px solid #ddd",
    padding: "8px 12px",
    textAlign: "left",
  },
  prose: {
    fontSize: "14px",
    lineHeight: 1.6,
  },
};

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

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {/* Feedback Modal */}
      {modalVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-500 max-w-90% p-5">
            <div className="text-lg font-semibold pb-3 mb-3 border-b border-gray-200">
              Provide Feedback
            </div>

            <div className="space-y-4">
              <div>
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

              <div>
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Please enter feedback here
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end mt-4 pt-3 border-t border-gray-200 gap-2">
              <button
                className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-md"
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
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message display */}
      <div
        className={`flex ${
          props.message?.type === ChatBotMessageType.Human
            ? "justify-end"
            : "justify-start"
        }`}
      >
        <div
          className={`relative max-w-3xl rounded-lg p-4 ${
            props.message?.type === ChatBotMessageType.Human
              ? "bg-blue-600 text-white self-end rounded-br-none"
              : "bg-gray-100 text-gray-800 self-start rounded-tl-none"
          }`}
        >
          {/* Message header with name and time */}
          <div className="flex justify-between items-start mb-2">
            <span className="font-medium">
              {props.message?.type === ChatBotMessageType.Human
                ? "You"
                : "GrantWell AI"}
            </span>
            {props.message.metadata?.timestamp && (
              <span className="text-xs opacity-70">
                {formatTime(props.message.metadata.timestamp as string)}
              </span>
            )}
          </div>

          {/* Copy button for AI messages */}
          {props.message?.type === ChatBotMessageType.AI &&
            content?.length > 0 && (
              <div className="absolute top-2 right-2">
                <button
                  className="p-1 text-gray-500 hover:text-gray-700 rounded-full"
                  onClick={handleCopy}
                >
                  <Copy className="h-4 w-4" />
                </button>

                {showCopyPopup && (
                  <div className="absolute right-8 top-0 bg-white shadow-md rounded-md p-1 text-xs text-green-600 flex items-center whitespace-nowrap">
                    <Check className="h-3 w-3 mr-1" /> Copied to clipboard
                  </div>
                )}
              </div>
            )}

          {/* Message content */}
          {content?.length === 0 ? (
            <div className="flex items-center justify-center py-2">
              <div className="w-5 h-5 border-2 border-t-transparent border-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                children={content}
                remarkPlugins={[remarkGfm]}
                components={{
                  pre(props) {
                    const { children, ...rest } = props;
                    return (
                      <pre
                        {...rest}
                        className="bg-gray-800 text-white p-3 rounded overflow-x-auto"
                      >
                        {children}
                      </pre>
                    );
                  },
                  table(props) {
                    const { children, ...rest } = props;
                    return (
                      <div className="overflow-x-auto">
                        <table
                          {...rest}
                          className="min-w-full divide-y divide-gray-200"
                        >
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th(props) {
                    const { children, ...rest } = props;
                    return (
                      <th
                        {...rest}
                        className="px-3 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
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
                        className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 border-t border-gray-200"
                      >
                        {children}
                      </td>
                    );
                  },
                }}
              />
            </div>
          )}

          {/* Feedback buttons and sources for AI messages */}
          {props.message?.type === ChatBotMessageType.AI &&
            content?.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-200 flex justify-between items-center">
                <div className="flex space-x-2">
                  {(selectedIcon === 1 || selectedIcon === null) && (
                    <button
                      className={`p-1 rounded ${
                        selectedIcon === 1
                          ? "text-blue-600"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                      onClick={() => {
                        props.onThumbsUp();
                        const id = addNotification(
                          "success",
                          "Thank you for your feedback!"
                        );
                        Utils.delay(3000).then(() => removeNotification(id));
                        setSelectedIcon(1);
                      }}
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </button>
                  )}

                  {(selectedIcon === 0 || selectedIcon === null) && (
                    <button
                      className={`p-1 rounded ${
                        selectedIcon === 0
                          ? "text-red-600"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                      onClick={() => {
                        setModalVisible(true);
                      }}
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Sources dropdown */}
                {showSources && (
                  <div className="relative" ref={dropdownRef}>
                    <button
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded flex items-center hover:bg-blue-700"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      Sources <ChevronDown className="h-3 w-3 ml-1" />
                    </button>

                    {isDropdownOpen && (
                      <div className="absolute bottom-8 right-0 bg-white shadow-lg rounded-lg w-56 overflow-hidden z-10">
                        <div className="text-sm font-medium p-2 bg-gray-50 border-b border-gray-200">
                          Sources
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {(props.message.metadata.Sources as any[]).map(
                            (item, index) => (
                              <a
                                key={index}
                                href={item.uri}
                                className="flex items-center p-2 hover:bg-gray-50 text-gray-700 text-sm"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span className="flex-1 truncate">
                                  {item.title}
                                </span>
                                <ExternalLink className="h-3 w-3 text-gray-400 ml-1" />
                              </a>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Human message is just rendered without the feedback controls */}
      {props.message?.type === ChatBotMessageType.Human && (
        <div></div> // The message is already rendered above
      )}
    </>
  );
}

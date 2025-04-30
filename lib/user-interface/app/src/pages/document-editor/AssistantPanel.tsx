import React, { useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AssistantPanelProps } from "./types";

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  activeSection,
  chatMessages,
  isSending,
  messageInput,
  setMessageInput,
  handleSendMessage,
}) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (chatContainerRef.current && chatMessages.length > 0) {
      window.requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop =
            chatContainerRef.current.scrollHeight;
        }
      });
    }
  }, [chatMessages]);

  // Handle Enter key in textarea
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  return (
    <div className="assistant-panel">
      <div className="assistant-container">
        <div className="assistant-header">
          <h3>Document Assistant</h3>
        </div>
        <div ref={chatContainerRef} className="chat-messages">
          {chatMessages.map((message, index) => (
            <div
              key={index}
              className={`message-container ${
                message.role === "user" ? "user" : "bot"
              }`}
            >
              <div
                className={`message ${
                  message.role === "user" ? "user" : "bot"
                }`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {isSending && (
            <div className="message-container bot">
              <div className="message bot is-typing">
                <div className="loading-spinner chat-spinner"></div>
              </div>
            </div>
          )}
        </div>
        <div className="chat-input-area">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Ask for writing help..."
            className="chat-input"
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSendMessage}
            disabled={isSending || !messageInput.trim()}
            className={`send-button ${
              isSending || !messageInput.trim() ? "disabled" : ""
            }`}
            aria-label="Send message"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

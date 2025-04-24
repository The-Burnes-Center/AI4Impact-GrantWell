import React, { useRef, useEffect, useCallback } from "react";
import { Button, Spinner } from "@cloudscape-design/components";
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
    <div
      style={{
        width: "280px", // Slightly narrower
        position: "fixed", // Fixed position
        left: 0,
        top: "160px", // Adjust based on your header height
        bottom: 0,
        borderRight: "1px solid #ccc",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f5f5f5",
        overflow: "hidden",
        zIndex: 10,
        height: "calc(100vh - 160px)", // Calculate height based on viewport
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "10px",
        }}
      >
        <div style={{ marginBottom: "10px" }}>
          <h3>Document Assistant</h3>
        </div>
        <div
          ref={chatContainerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            marginBottom: "10px",
            padding: "10px",
            backgroundColor: "white",
            borderRadius: "4px",
          }}
        >
          {chatMessages.map((message, index) => (
            <div
              key={index}
              style={{
                marginBottom: "12px",
                textAlign: message.role === "user" ? "right" : "left",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  maxWidth: "85%",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  backgroundColor:
                    message.role === "user" ? "#007eb9" : "#e9ebed",
                  color: message.role === "user" ? "white" : "black",
                  textAlign: "left",
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {isSending && (
            <div style={{ textAlign: "left", marginBottom: "12px" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  backgroundColor: "#e9ebed",
                }}
              >
                <Spinner size="normal" />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex" }}>
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Ask for writing help..."
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              resize: "none",
              height: "60px",
            }}
            onKeyDown={handleKeyDown}
          />
          <div style={{ marginLeft: "8px", alignSelf: "flex-end" }}>
            <Button
              onClick={handleSendMessage}
              disabled={isSending || !messageInput.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

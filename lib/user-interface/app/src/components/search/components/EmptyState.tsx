import React from "react";
import { ViewAllGrantsButton } from "./ViewAllGrantsButton";
import { emptyPromptStyle } from "../styles/searchStyles";

interface EmptyStateProps {
  onViewAll: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onViewAll }) => {
  return (
    <div style={emptyPromptStyle}>
      <div
        style={{
          background: "linear-gradient(135deg, #e6f4ff 0%, #f0f9ff 100%)",
          borderRadius: "12px",
          padding: "20px 24px",
          margin: "15px 0",
          border: "2px solid #14558F",
          boxShadow: "0 2px 8px rgba(0, 115, 187, 0.1)",
          textAlign: "left",
        }}
      >
        <p
          id="search-help-know-grant"
          style={{
            margin: "0 0 12px 0",
            fontSize: "14px",
            color: "#333",
            lineHeight: "1.6",
          }}
        >
          <strong>Search by grant name</strong> — Type a grant name to find
          exact matches instantly.
        </p>
        <p
          id="search-help-not-sure"
          style={{
            margin: "0",
            fontSize: "14px",
            color: "#333",
            lineHeight: "1.6",
          }}
        >
          <strong>Or describe what you need</strong> — Type a description and AI
          will suggest matching grants automatically.
        </p>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <ViewAllGrantsButton onClick={onViewAll} />
      </div>
    </div>
  );
};

export default EmptyState;

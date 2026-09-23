import React from "react";

export const searchContainerStyle: React.CSSProperties = {
  position: "relative",
  maxWidth: "650px",
  width: "100%",
  margin: "0 auto",
  zIndex: 100,
};

export const inputContainerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
};

// Visually hidden label - accessible to screen readers
export const labelStyle: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: "0",
};

export const searchIconStyle: React.CSSProperties = {
  position: "absolute",
  left: "15px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "#666",
  pointerEvents: "none",
  zIndex: 1,
};

export const getInputStyle = (isLoading: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "14px 40px 14px 45px",
  fontSize: "16px",
  borderRadius: "25px",
  border: "1px solid #767676",
  boxSizing: "border-box",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  transition: "all 0.2s ease",
  backgroundColor: "#ffffff",
  cursor: isLoading ? "not-allowed" : "text",
  opacity: isLoading ? 0.7 : 1,
});

export const getClearButtonStyle = (isLoading: boolean): React.CSSProperties => ({
  position: "absolute",
  right: "15px",
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  cursor: isLoading ? "not-allowed" : "pointer",
  padding: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#666",
  transition: "color 0.2s ease",
  opacity: isLoading ? 0.7 : 1,
});
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
  padding: "14px 20px 14px 45px",
  fontSize: "16px",
  borderRadius: "25px",
  border: "1px solid #e0e0e0",
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

export const resultsContainerStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  backgroundColor: "#fff",
  borderRadius: "0 0 15px 15px",
  boxShadow: "0 4px 15px rgba(0,0,0,0.15)",
  maxHeight: "600px",
  minHeight: "200px",
  overflowY: "auto",
  zIndex: 10,
  marginTop: "5px",
  border: "1px solid #e0e0e0",
};

export const resultItemStyle: React.CSSProperties = {
  padding: "12px 15px",
  cursor: "pointer",
  borderBottom: "1px solid #f0f0f0",
  transition: "background-color 0.2s",
};

export const selectedItemStyle: React.CSSProperties = {
  ...resultItemStyle,
  backgroundColor: "#f0f7ff",
  borderLeft: "3px solid #14558F",
};

export const pinnedItemStyle: React.CSSProperties = {
  ...resultItemStyle,
  borderLeft: "3px solid #008798",
  backgroundColor: "#f0ffff",
};

export const selectedPinnedItemStyle: React.CSSProperties = {
  ...pinnedItemStyle,
  backgroundColor: "#e0f7f7",
  borderLeft: "3px solid #14558F",
};

export const sectionHeaderStyle: React.CSSProperties = {
  padding: "10px 15px",
  backgroundColor: "#f9f9f9",
  fontWeight: "bold",
  fontSize: "14px",
  color: "#666",
};

export const emptyPromptStyle: React.CSSProperties = {
  padding: "20px",
  textAlign: "center",
  color: "#555",
  fontSize: "14px",
};

export const pinnedBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "14px",
  backgroundColor: "#005a63",
  color: "white",
  padding: "2px 6px",
  borderRadius: "10px",
  marginLeft: "6px",
  verticalAlign: "middle",
};

export const pinButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "8px",
  marginLeft: "8px",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background-color 0.2s ease",
};

export const unpinButtonStyle: React.CSSProperties = {
  ...pinButtonStyle,
  color: "#E74C3C",
};

export const grantCardStyle: React.CSSProperties = {
  padding: "16px",
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  marginBottom: "16px",
  border: "1px solid #e0e0e0",
};

export const grantCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
  width: "100%",
};

export const grantCardTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: "#14558F",
};

export const aiSuggestionCardStyle: React.CSSProperties = {
  padding: "12px",
  backgroundColor: "#f8f9ff",
  borderRadius: "8px",
  marginBottom: "8px",
  border: "1px solid #e8ecf4",
};

export const selectedAiSuggestionCardStyle: React.CSSProperties = {
  ...aiSuggestionCardStyle,
  backgroundColor: "#f0f7ff",
  borderLeft: "3px solid #14558F",
};

export const aiLoadingStyle: React.CSSProperties = {
  padding: "24px 16px",
  textAlign: "center",
  backgroundColor: "#f8f9ff",
  borderRadius: "8px",
  margin: "8px 12px",
};

export const aiErrorStyle: React.CSSProperties = {
  padding: "16px",
  margin: "8px 12px",
  backgroundColor: "#fee",
  border: "1px solid #fcc",
  borderRadius: "8px",
  color: "#c33",
  fontSize: "14px",
};

export const aiPromptStyle: React.CSSProperties = {
  padding: "12px 16px",
  margin: "8px 12px",
  backgroundColor: "#f0f7ff",
  borderRadius: "8px",
  border: "1px dashed #14558F",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

export const viewAllButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 20px",
  backgroundColor: "#14558F",
  color: "white",
  borderRadius: "20px",
  fontSize: "14px",
  border: "none",
  cursor: "pointer",
  transition: "background-color 0.2s",
  gap: "8px",
};

export const modalOverlayStyle: React.CSSProperties = {
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
  padding: "20px",
};

export const modalContentStyle: React.CSSProperties = {
  backgroundColor: "white",
  borderRadius: "12px",
  maxWidth: "900px",
  width: "100%",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
};

export const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "20px 24px",
  borderBottom: "2px solid #e0e0e0",
  backgroundColor: "#f9f9f9",
};

export const modalBodyStyle: React.CSSProperties = {
  padding: "24px",
  overflowY: "auto",
  flex: 1,
};

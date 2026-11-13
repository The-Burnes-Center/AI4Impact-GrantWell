import React from "react";

export const inputContainerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontSize: "16px",
  fontWeight: 600,
  color: "var(--gw-color-heading)",
};

export const searchIconStyle: React.CSSProperties = {
  position: "absolute",
  left: "15px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--gw-color-text-secondary)",
  pointerEvents: "none",
  zIndex: 1,
};

export const getInputStyle = (isLoading: boolean): React.CSSProperties => ({
  width: "100%",
  // Room for the search icon on the left and the clear button on the right.
  padding: "10px 40px 10px 45px",
  cursor: isLoading ? "not-allowed" : "text",
  opacity: isLoading ? 0.7 : 1,
});

export const getClearButtonStyle = (isLoading: boolean): React.CSSProperties => ({
  position: "absolute",
  right: "15px",
  top: "50%",
  transform: "translateY(-50%)",
  cursor: isLoading ? "not-allowed" : undefined,
  opacity: isLoading ? 0.7 : 1,
});
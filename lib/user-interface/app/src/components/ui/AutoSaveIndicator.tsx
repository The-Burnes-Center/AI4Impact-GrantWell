/**
 * AutoSaveIndicator Component
 * 
 * Displays the current auto-save status with appropriate visual feedback.
 * Shows a spinner while saving and a checkmark when saved.
 * 
 * @example
 * // Basic usage
 * <AutoSaveIndicator status={saveStatus} />
 * 
 * // With custom messages
 * <AutoSaveIndicator
 *   status={saveStatus}
 *   savingText="Syncing..."
 *   savedText="Synced"
 * />
 */

import React from "react";
import { colors, typography, spacing } from "./styles";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutoSaveIndicatorProps {
  /** Current save status */
  status: SaveStatus;
  /** Text to show while saving */
  savingText?: string;
  /** Text to show when saved */
  savedText?: string;
  /** Text to show on error */
  errorText?: string;
  /** Duration before auto-hiding after save (0 to disable) */
  hideAfterMs?: number;
}

const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  status,
  savingText = "Saving...",
  savedText = "Saved",
  errorText = "Error saving",
}) => {
  if (status === "idle") {
    return null;
  }

  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    color: status === "error" ? colors.error : colors.textSecondary,
  };

  const spinnerStyle: React.CSSProperties = {
    width: "14px",
    height: "14px",
    border: `2px solid ${colors.borderLight}`,
    borderTopColor: colors.primary,
    borderRadius: "50%",
    animation: "autosave-spin 0.8s linear infinite",
  };

  return (
    <div
      style={containerStyle}
      role="status"
      aria-live="polite"
      aria-label={
        status === "saving"
          ? savingText
          : status === "saved"
          ? savedText
          : errorText
      }
    >
      {status === "saving" && (
        <>
          <div style={spinnerStyle} aria-hidden="true" />
          <span>{savingText}</span>
        </>
      )}

      {status === "saved" && (
        <span style={{ display: "flex", alignItems: "center", gap: "6px", color: colors.success }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {savedText}
        </span>
      )}

      {status === "error" && (
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {errorText}
        </span>
      )}

      <style>{`
        @keyframes autosave-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AutoSaveIndicator;

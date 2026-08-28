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
}

const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  status,
  savingText = "Saving...",
  savedText = "Saved",
  errorText = "Error saving",
}) => {
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
    <>
      {/* Outside the live region: CSS text inside one gets read out with the status. */}
      <style>{`
        @keyframes autosave-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      {/* Always mounted, including when idle: a region created at the same instant as
          "Saving..." is not announced. The status text is the only label. */}
      <div style={containerStyle} role="status" aria-live="polite">
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
      </div>
    </>
  );
};

export default AutoSaveIndicator;

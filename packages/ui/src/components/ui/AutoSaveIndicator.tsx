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

import React, { useRef } from "react";
import { colors, typography, spacing } from "./styles";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface AutoSaveIndicatorProps {
  /** Current save status */
  status: SaveStatus;
  /** Text to show while edits are debounced but not yet sent */
  pendingText?: string;
  /** Text to show while saving */
  savingText?: string;
  /** Text to show when saved */
  savedText?: string;
  /** Text to show on error */
  errorText?: string;
  /** Duration before auto-hiding after save (0 to disable) */
  hideAfterMs?: number;
  /** Standing line for the idle state; omitted renders nothing while idle. */
  idleText?: string;
  /** Set false for a second, visual-only copy of a status already announced elsewhere. */
  announce?: boolean;
  /** Offers a retry button alongside the error state */
  onRetry?: () => void;
  /** "onPrimary" for placement on the teal card header. */
  variant?: "default" | "onPrimary";
}

const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  status,
  pendingText = "Unsaved changes",
  savingText = "Saving...",
  savedText = "Saved",
  errorText = "Not saved",
  idleText,
  announce = true,
  onRetry,
  variant = "default",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  if (status === "idle" && !idleText) {
    return null;
  }

  const onPrimary = variant === "onPrimary";

  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    color: onPrimary ? colors.white : status === "error" ? colors.error : colors.textSecondary,
  };

  const spinnerStyle: React.CSSProperties = {
    width: "14px",
    height: "14px",
    border: `2px solid ${onPrimary ? "color-mix(in srgb, var(--gw-color-surface) 40%, transparent)" : colors.borderLight}`,
    borderTopColor: onPrimary ? colors.white : colors.primary,
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
        .autosave--on-primary:focus-visible,
        .autosave--on-primary button:focus-visible {
          outline: 2px solid var(--gw-color-surface);
          outline-offset: 2px;
        }
      `}</style>
      {/* With idleText the region mounts before the first save: one created with its message is not announced. */}
      <div
        ref={containerRef}
        className={onPrimary ? "autosave--on-primary" : undefined}
        style={containerStyle}
        {...(announce
          ? { role: "status", "aria-live": "polite" as const, tabIndex: -1 }
          : { "aria-hidden": true })}
      >
        {status === "idle" && idleText && <span>{idleText}</span>}

        {status === "pending" && (
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
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {pendingText}
          </span>
        )}

        {status === "saving" && (
          <>
            <div style={spinnerStyle} aria-hidden="true" />
            <span>{savingText}</span>
          </>
        )}

        {status === "saved" && (
          <span style={{ display: "flex", alignItems: "center", gap: "6px", color: onPrimary ? colors.white : colors.success }}>
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
            {onRetry && (
              <button
                type="button"
                onClick={() => {
                  // The button unmounts once the retry starts; the status keeps focus in place.
                  containerRef.current?.focus();
                  onRetry();
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: onPrimary ? colors.white : colors.error,
                  font: "inherit",
                  fontWeight: typography.fontWeight.semibold,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            )}
          </span>
        )}
      </div>
    </>
  );
};

export default AutoSaveIndicator;

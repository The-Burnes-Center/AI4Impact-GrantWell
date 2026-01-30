/**
 * LoadingSpinner Component
 * 
 * A reusable loading spinner with size variants.
 * Includes proper accessibility attributes for screen readers.
 * 
 * @example
 * // Default medium spinner
 * <LoadingSpinner />
 * 
 * // Small spinner with custom message
 * <LoadingSpinner size="sm" message="Loading data..." />
 * 
 * // Large spinner
 * <LoadingSpinner size="lg" />
 */

import React from "react";
import { colors } from "./styles";

export type SpinnerSize = "sm" | "md" | "lg";

export interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Color of the spinner (defaults to primary) */
  color?: string;
  /** Message to display (also used for screen readers) */
  message?: string;
  /** Whether to show the message visually */
  showMessage?: boolean;
  /** Center the spinner in its container */
  centered?: boolean;
}

const sizeMap: Record<SpinnerSize, { size: number; border: number }> = {
  sm: { size: 16, border: 2 },
  md: { size: 32, border: 3 },
  lg: { size: 48, border: 4 },
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  color = colors.primary,
  message = "Loading...",
  showMessage = false,
  centered = true,
}) => {
  const { size: dimension, border } = sizeMap[size];

  const containerStyle: React.CSSProperties = centered
    ? {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        padding: "20px",
      }
    : {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      };

  const spinnerStyle: React.CSSProperties = {
    width: `${dimension}px`,
    height: `${dimension}px`,
    border: `${border}px solid ${colors.borderLight}`,
    borderTopColor: color,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  };

  return (
    <div
      style={containerStyle}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div style={spinnerStyle} aria-hidden="true" />
      {showMessage && (
        <span
          style={{
            fontSize: size === "sm" ? "12px" : "14px",
            color: colors.textSecondary,
          }}
        >
          {message}
        </span>
      )}
      {/* Screen reader only text */}
      <span className="sr-only" style={{ 
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}>
        {message}
      </span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;

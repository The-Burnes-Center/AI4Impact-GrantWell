/**
 * FormErrorSummary Component
 * 
 * Displays a summary of form validation errors at the top of a form.
 * Provides keyboard-accessible error links for navigation.
 * 
 * @example
 * // Basic usage
 * <FormErrorSummary
 *   errors={{
 *     name: "Name is required",
 *     email: "Invalid email format"
 *   }}
 * />
 * 
 * // With custom title and field labels
 * <FormErrorSummary
 *   errors={formErrors}
 *   title="Please fix the following issues:"
 *   fieldLabels={{
 *     orgName: "Organization Name",
 *     einNumber: "EIN Number"
 *   }}
 * />
 */

import React, { useEffect, useRef } from "react";
import { colors, typography, spacing, borderRadius } from "./styles";

export interface FormErrorSummaryProps {
  /** Object of field names to error messages */
  errors: Record<string, string | undefined>;
  /** Title displayed at the top of the error summary */
  title?: string;
  /** Mapping of field names to display labels */
  fieldLabels?: Record<string, string>;
  /** Whether to auto-focus the summary when errors appear */
  autoFocus?: boolean;
  /** Callback when clicking an error link */
  onErrorClick?: (fieldName: string) => void;
}

const FormErrorSummary: React.FC<FormErrorSummaryProps> = ({
  errors,
  title,
  fieldLabels = {},
  autoFocus = true,
  onErrorClick,
}) => {
  const summaryRef = useRef<HTMLDivElement>(null);
  
  // Filter to only include errors with messages
  const activeErrors = Object.entries(errors).filter(([_, message]) => Boolean(message));
  const errorCount = activeErrors.length;

  // Auto-focus when errors appear
  useEffect(() => {
    if (autoFocus && errorCount > 0 && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [autoFocus, errorCount]);

  if (errorCount === 0) {
    return null;
  }

  const defaultTitle = `There ${errorCount === 1 ? "is" : "are"} ${errorCount} error${
    errorCount !== 1 ? "s" : ""
  } in this form`;

  const containerStyle: React.CSSProperties = {
    marginBottom: spacing["2xl"],
    padding: spacing.lg,
    background: colors.errorLight,
    border: `2px solid ${colors.error}`,
    borderRadius: borderRadius.md,
  };

  const titleStyle: React.CSSProperties = {
    margin: `0 0 ${spacing.md} 0`,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error,
    fontFamily: typography.fontFamily,
  };

  const listStyle: React.CSSProperties = {
    margin: 0,
    paddingLeft: spacing.xl,
  };

  const listItemStyle: React.CSSProperties = {
    marginBottom: spacing.xs,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
  };

  const linkStyle: React.CSSProperties = {
    color: colors.error,
    textDecoration: "underline",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    textAlign: "left",
  };

  const handleErrorClick = (fieldName: string) => {
    if (onErrorClick) {
      onErrorClick(fieldName);
    } else {
      // Default behavior: focus the field
      const field = document.getElementById(fieldName);
      if (field) {
        field.focus();
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const getFieldLabel = (fieldName: string): string => {
    if (fieldLabels[fieldName]) {
      return fieldLabels[fieldName];
    }
    // Convert camelCase to Title Case
    return fieldName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  return (
    <div
      ref={summaryRef}
      id="error-summary"
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      style={containerStyle}
    >
      <h2 style={titleStyle}>{title || defaultTitle}</h2>
      <ul style={listStyle}>
        {activeErrors.map(([fieldName, message]) => (
          <li key={fieldName} style={listItemStyle}>
            <button
              type="button"
              style={linkStyle}
              onClick={() => handleErrorClick(fieldName)}
              onMouseEnter={(e) => {
                e.currentTarget.style.textDecoration = "none";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.textDecoration = "underline";
              }}
            >
              {getFieldLabel(fieldName)}: {message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FormErrorSummary;

/**
 * FormField Component
 * 
 * A reusable form field wrapper that handles labels, help text, and error states.
 * Provides consistent styling and accessibility across all form inputs.
 * 
 * @example
 * // Basic text input
 * <FormField
 *   label="Email"
 *   name="email"
 *   type="email"
 *   value={email}
 *   onChange={handleChange}
 *   required
 * />
 * 
 * // With error and help text
 * <FormField
 *   label="Password"
 *   name="password"
 *   type="password"
 *   value={password}
 *   onChange={handleChange}
 *   error="Password must be at least 8 characters"
 *   helpText="Use a mix of letters, numbers, and symbols"
 * />
 * 
 * // Textarea
 * <FormField
 *   label="Description"
 *   name="description"
 *   as="textarea"
 *   rows={4}
 *   value={description}
 *   onChange={handleChange}
 * />
 */

import React, { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { colors, typography, spacing, borderRadius, inputStyles } from "./styles";

type InputProps = InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export interface FormFieldProps {
  /** Field label */
  label: string;
  /** Field name (used for id and name attributes) */
  name: string;
  /** Input type (text, email, password, number, etc.) */
  type?: string;
  /** Current value */
  value?: string | number;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Blur handler */
  onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Error message (presence indicates error state) */
  error?: string;
  /** Help text displayed below the input */
  helpText?: string;
  /** Render as input or textarea */
  as?: "input" | "textarea";
  /** Number of rows for textarea */
  rows?: number;
  /** Additional input props */
  inputProps?: InputProps | TextareaProps;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  name,
  type = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  error,
  helpText,
  as = "input",
  rows = 3,
  inputProps,
}) => {
  const hasError = Boolean(error);
  const helpId = `${name}-help`;
  const errorId = `${name}-error`;
  const describedBy = [helpText ? helpId : null, hasError ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    fontFamily: typography.fontFamily,
  };

  const inputStyle: React.CSSProperties = {
    ...inputStyles.base,
    ...(hasError && inputStyles.error),
    ...(disabled && { backgroundColor: colors.background, cursor: "not-allowed" }),
  };

  const helpTextStyle: React.CSSProperties = {
    display: "block",
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  };

  const errorStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.error,
    fontFamily: typography.fontFamily,
  };

  const sharedProps = {
    id: name,
    name,
    value,
    onChange,
    onBlur,
    placeholder,
    disabled,
    required,
    "aria-required": required,
    "aria-invalid": hasError,
    "aria-describedby": describedBy,
    style: inputStyle,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = colors.primary;
      e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primaryLight}`;
    },
    onBlurCapture: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = hasError ? colors.error : colors.border;
      e.currentTarget.style.boxShadow = "none";
    },
  };

  return (
    <div style={{ marginBottom: spacing.lg }}>
      <label htmlFor={name} style={labelStyle}>
        {label}
        {required && (
          <span style={{ color: colors.error, marginLeft: "4px" }} aria-hidden="true">
            *
          </span>
        )}
      </label>

      {as === "textarea" ? (
        <textarea
          {...sharedProps}
          rows={rows}
          {...(inputProps as TextareaProps)}
        />
      ) : (
        <input
          {...sharedProps}
          type={type}
          {...(inputProps as InputProps)}
        />
      )}

      {helpText && !hasError && (
        <span id={helpId} style={helpTextStyle}>
          {helpText}
        </span>
      )}

      {hasError && (
        <span id={errorId} role="alert" style={errorStyle}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </span>
      )}
    </div>
  );
};

export default FormField;

/**
 * Button Component
 * 
 * A reusable button component with multiple variants and sizes.
 * Supports accessibility features including focus states and ARIA attributes.
 * 
 * @example
 * // Primary button
 * <Button variant="primary" onClick={handleClick}>Submit</Button>
 * 
 * // Secondary button with icon
 * <Button variant="secondary" size="sm">
 *   <ArrowLeft /> Back
 * </Button>
 * 
 * // Disabled state
 * <Button disabled>Processing...</Button>
 */

import React, { ButtonHTMLAttributes, forwardRef } from "react";
import { colors, buttonStyles, transitions } from "./styles";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Whether the button takes full width */
  fullWidth?: boolean;
  /** Loading state - shows spinner and disables button */
  loading?: boolean;
  /** Children elements */
  children: React.ReactNode;
}

const hoverColors: Record<ButtonVariant, string> = {
  primary: colors.primaryHover,
  secondary: colors.background,
  danger: "#b71c1c",
  ghost: colors.primaryLight,
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      disabled,
      children,
      style,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const baseStyle: React.CSSProperties = {
      ...buttonStyles.base,
      ...buttonStyles.sizes[size],
      ...buttonStyles.variants[variant],
      width: fullWidth ? "100%" : "auto",
      opacity: isDisabled ? 0.6 : 1,
      cursor: isDisabled ? "not-allowed" : "pointer",
      ...style,
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled) {
        e.currentTarget.style.backgroundColor = hoverColors[variant];
      }
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled) {
        e.currentTarget.style.backgroundColor =
          buttonStyles.variants[variant].backgroundColor || "";
      }
      onMouseLeave?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.outline = `2px solid ${colors.primary}`;
      e.currentTarget.style.outlineOffset = "2px";
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.outline = "none";
      onBlur?.(e);
    };

    return (
      <button
        ref={ref}
        style={baseStyle}
        disabled={isDisabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-disabled={isDisabled}
        {...props}
      >
        {loading && <LoadingDots />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

/** Simple loading dots animation for button loading state */
const LoadingDots: React.FC = () => (
  <span
    style={{
      display: "inline-flex",
      gap: "2px",
    }}
    aria-hidden="true"
  >
    <span className="loading-dot" style={dotStyle}>.</span>
    <span className="loading-dot" style={{ ...dotStyle, animationDelay: "0.2s" }}>.</span>
    <span className="loading-dot" style={{ ...dotStyle, animationDelay: "0.4s" }}>.</span>
    <style>{`
      @keyframes bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-4px); }
      }
      .loading-dot {
        animation: bounce 1s infinite;
      }
    `}</style>
  </span>
);

const dotStyle: React.CSSProperties = {
  display: "inline-block",
  fontWeight: "bold",
};

export default Button;

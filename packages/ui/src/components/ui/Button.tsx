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

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant. "ghost" is the lower-emphasis choice beside a primary and renders as secondary. */
  variant?: ButtonVariant;
  /** Size of the button; "sm" is the slim button for tight spaces. */
  size?: ButtonSize;
  /** Whether the button takes full width */
  fullWidth?: boolean;
  /** Loading state - shows spinner and ignores clicks, but stays focusable */
  loading?: boolean;
  /** Children elements */
  children: React.ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "gw-btn--primary",
  secondary: "gw-btn--secondary",
  danger: "gw-btn--danger",
  ghost: "gw-btn--secondary",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", fullWidth = false, loading = false, disabled, children, style, className, onClick, ...props },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const classes = ["gw-btn", VARIANT_CLASS[variant], size === "sm" ? "gw-btn--slim" : "", className ?? ""].filter(Boolean).join(" ");

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (loading) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        className={classes}
        style={fullWidth ? { width: "100%", ...style } : style}
        disabled={disabled}
        onClick={handleClick}
        aria-disabled={isDisabled || undefined}
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

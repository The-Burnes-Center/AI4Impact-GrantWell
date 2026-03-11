/**
 * NavigationButtons Component
 * 
 * A reusable component for step navigation with back/continue buttons.
 * Used in multi-step forms and wizards.
 * 
 * @example
 * // Basic usage
 * <NavigationButtons
 *   onBack={() => goToStep(currentStep - 1)}
 *   onContinue={() => goToStep(currentStep + 1)}
 * />
 * 
 * // With custom labels
 * <NavigationButtons
 *   onBack={handleBack}
 *   onContinue={handleSubmit}
 *   backLabel="Previous"
 *   continueLabel="Submit"
 * />
 * 
 * // Hide back button on first step
 * <NavigationButtons
 *   showBack={currentStep > 0}
 *   onContinue={handleNext}
 * />
 */

import React from "react";
import { colors, typography, spacing, borderRadius, transitions } from "./styles";

export interface NavigationButtonsProps {
  /** Handler for back button click */
  onBack?: () => void;
  /** Handler for continue button click */
  onContinue?: () => void;
  /** Label for back button */
  backLabel?: string;
  /** Label for continue button */
  continueLabel?: string;
  /** Whether to show back button */
  showBack?: boolean;
  /** Whether to show continue button */
  showContinue?: boolean;
  /** Disable continue button */
  continueDisabled?: boolean;
  /** Show loading state on continue */
  continueLoading?: boolean;
  /** Justify content style */
  justify?: "space-between" | "flex-end" | "flex-start" | "center";
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  onBack,
  onContinue,
  backLabel = "Back",
  continueLabel = "Continue",
  showBack = true,
  showContinue = true,
  continueDisabled = false,
  continueLoading = false,
  justify = "space-between",
}) => {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: justify,
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing["2xl"],
  };

  const backButtonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    padding: `${spacing.md} ${spacing.xl}`,
    background: colors.white,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    color: colors.text,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily,
    cursor: "pointer",
    transition: transitions.normal,
  };

  const continueButtonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    padding: `${spacing.md} ${spacing["2xl"]}`,
    background: continueDisabled ? colors.textMuted : colors.primary,
    color: colors.white,
    border: "none",
    borderRadius: borderRadius.md,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily,
    cursor: continueDisabled ? "not-allowed" : "pointer",
    transition: transitions.normal,
    opacity: continueDisabled ? 0.6 : 1,
  };

  const handleBackHover = (e: React.MouseEvent<HTMLButtonElement>, isHover: boolean) => {
    e.currentTarget.style.backgroundColor = isHover ? colors.background : colors.white;
  };

  const handleContinueHover = (e: React.MouseEvent<HTMLButtonElement>, isHover: boolean) => {
    if (!continueDisabled) {
      e.currentTarget.style.backgroundColor = isHover ? colors.primaryHover : colors.primary;
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.outline = `2px solid ${colors.primary}`;
    e.currentTarget.style.outlineOffset = "2px";
  };

  const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.outline = "none";
  };

  // Arrow icons
  const LeftArrow = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );

  const RightArrow = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );

  const LoadingSpinner = () => (
    <>
      <div
        style={{
          width: "16px",
          height: "16px",
          border: "2px solid rgba(255, 255, 255, 0.3)",
          borderTopColor: colors.white,
          borderRadius: "50%",
          animation: "nav-spin 0.8s linear infinite",
        }}
        aria-hidden="true"
      />
      <style>{`
        @keyframes nav-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );

  return (
    <div style={containerStyle}>
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          style={backButtonStyle}
          onMouseEnter={(e) => handleBackHover(e, true)}
          onMouseLeave={(e) => handleBackHover(e, false)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-label={backLabel}
        >
          <LeftArrow />
          {backLabel}
        </button>
      ) : (
        showBack && <div style={{ width: "1px" }} />
      )}

      {showContinue && onContinue && (
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled || continueLoading}
          style={continueButtonStyle}
          onMouseEnter={(e) => handleContinueHover(e, true)}
          onMouseLeave={(e) => handleContinueHover(e, false)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-label={continueLabel}
          aria-disabled={continueDisabled}
        >
          {continueLoading ? <LoadingSpinner /> : continueLabel}
          {!continueLoading && <RightArrow />}
        </button>
      )}
    </div>
  );
};

export default NavigationButtons;

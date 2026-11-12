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
import { colors, spacing } from "./styles";

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
    flexWrap: "wrap",
    gap: spacing.lg,
    marginTop: spacing["2xl"],
  };

  // A 44px touch target; the look comes from the shared button classes.
  const navButtonStyle: React.CSSProperties = { minHeight: "44px" };

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
          border: "2px solid color-mix(in srgb, var(--gw-color-surface) 30%, transparent)",
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
      {/* Outside the button: ARIA treats button children as presentational, so a live
          region nested in one never fires. Always mounted so the text is an update. */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {continueLoading ? `${continueLabel} in progress` : ""}
      </div>

      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="gw-btn gw-btn--secondary"
          style={navButtonStyle}
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
          // aria-disabled, not disabled, so a keyboard user's focus stays on the button while it is busy.
          onClick={() => {
            if (!continueDisabled && !continueLoading) onContinue();
          }}
          className="gw-btn gw-btn--primary"
          style={navButtonStyle}
          aria-label={continueLabel}
          aria-disabled={continueDisabled || continueLoading || undefined}
          aria-busy={continueLoading}
        >
          {continueLoading ? <LoadingSpinner /> : continueLabel}
          {!continueLoading && <RightArrow />}
        </button>
      )}
    </div>
  );
};

export default NavigationButtons;

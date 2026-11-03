import React, { useEffect, useState } from "react";
import { LuCheck } from "react-icons/lu";

interface ProgressStepperProps {
  steps: Array<{
    id: string;
    label: string;
    description?: string;
    tooltip?: string; // Optional detailed tooltip text
  }>;
  activeStep: number;
  onStepClick?: (stepIndex: number) => void;
  completedSteps?: number[];
  showProgress?: boolean;
  isStepClickable?: (stepIndex: number) => boolean; // Custom function to determine if step is clickable
}

const ProgressStepper: React.FC<ProgressStepperProps> = ({
  steps,
  activeStep,
  onStepClick,
  completedSteps = [],
  showProgress = true,
  isStepClickable: customIsStepClickable,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const tooltipShown = !tooltipDismissed && (hoveredIndex !== null || focusedIndex !== null);

  // WCAG 1.4.13: Escape also dismisses a tooltip opened by hover, while focus is elsewhere.
  useEffect(() => {
    if (!tooltipShown) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTooltipDismissed(true);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [tooltipShown]);

  const progressPercentage = ((activeStep + 1) / steps.length) * 100;
  const isStepCompleted = (index: number) => completedSteps.includes(index);
  const isStepActive = (index: number) => index === activeStep;
  const isStepClickable = (index: number) => {
    if (!onStepClick) return false;
    if (customIsStepClickable) {
      return customIsStepClickable(index);
    }
    return isStepCompleted(index) || index === activeStep + 1;
  };

  const getStepState = (index: number): string => {
    const completed = isStepCompleted(index);
    if (isStepActive(index)) return completed ? "current step, completed" : "current step";
    if (completed) return "completed";
    return isStepClickable(index) ? "not started" : "locked";
  };

  const getTooltipText = (step: typeof steps[0], index: number): string => {
    if (step.tooltip) return step.tooltip;
    const description = step.description ? ` - ${step.description}` : "";
    const state = getStepState(index);
    return `${step.label}${description}\nStatus: ${state.charAt(0).toUpperCase()}${state.slice(1)}`;
  };

  const current = steps[activeStep];

  return (
    <nav
      className="progress-stepper-container"
      aria-label="Application steps"
      style={{
        width: "100%",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: "20px 24px",
        position: "sticky",
        top: "var(--gw-editor-header-height, 62px)",
        zIndex: 100,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
      }}
    >
      <style>
        {`
          .step-wrapper {
            z-index: 1;
          }

          .step-wrapper:hover,
          .step-wrapper:focus-within {
            z-index: 10;
          }

          .step-tooltip {
            position: absolute;
            top: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 12px;
            background-color: #1f2937;
            color: #ffffff;
            border-radius: 6px;
            font-family: var(--gw-font-family);
            font-size: 12px;
            font-weight: 400;
            white-space: pre-line;
            text-align: left;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s ease, transform 0.2s ease;
            max-width: 220px;
            min-width: 150px;
            line-height: 1.5;
          }

          /* WCAG 1.4.13: covers the gap so the pointer can move onto the tooltip */
          .step-tooltip::after {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            height: 12px;
          }

          .step-wrapper:first-child .step-tooltip {
            left: 0;
            transform: translateX(0);
          }

          .step-wrapper:last-child .step-tooltip {
            left: 50%;
            right: auto;
            transform: translateX(calc(-50% + 16px)); /* Center on step circle (16px = half circle width) */
            max-width: min(220px, calc(100vw - 32px));
          }

          .step-tooltip::before {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-bottom-color: #1f2937;
          }

          .step-wrapper:first-child .step-tooltip::before {
            left: 20px;
            transform: translateX(0);
          }

          .step-wrapper:last-child .step-tooltip::before {
            left: 50%;
            right: auto;
            transform: translateX(calc(-50% + 16px));
          }

          .step-tooltip.step-tooltip--visible {
            opacity: 1;
            visibility: visible;
            transform: translateX(-50%) translateY(2px);
          }

          .step-wrapper:first-child .step-tooltip.step-tooltip--visible {
            transform: translateX(0) translateY(2px);
          }

          .step-wrapper:last-child .step-tooltip.step-tooltip--visible {
            transform: translateX(calc(-50% + 16px)) translateY(2px);
          }

          .progress-stepper-container .step-summary {
            display: none;
          }

          @media (max-width: 768px) {
            .progress-stepper-container {
              padding: 16px 12px !important;
            }
            .progress-stepper-container .step-label {
              font-size: 13px !important;
            }
            .progress-stepper-container .step-description,
            .progress-stepper-container .step-progress {
              display: none;
            }
            .progress-stepper-container .step-summary {
              display: block;
            }
            .step-tooltip {
              display: none; /* Hide tooltips on mobile for better UX */
            }
          }
          @media (max-width: 480px) {
            .progress-stepper-container {
              padding: 12px 8px !important;
            }
            .progress-stepper-container button {
              width: 28px !important;
              height: 28px !important;
              font-size: 12px !important;
              margin-bottom: 0 !important;
            }
            /* Five label columns overlap here; the summary line names the current step. */
            .progress-stepper-container .step-text {
              display: none;
            }
          }
        `}
      </style>
      <div style={{ position: "relative" }}>
        {/* Connector Lines */}
        {steps.length > 1 && (
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              right: "16px",
              height: "2px",
              // Light enough that the completed fill reads against it at 3.4:1.
              // The circles, not this rail, carry the per-step state.
              backgroundColor: "#c9ced3",
              zIndex: 0,
            }}
          >
            <div
              style={{
                width: steps.length > 1 ? `${(activeStep / (steps.length - 1)) * 100}%` : "0%",
                height: "100%",
                backgroundColor: "var(--gw-color-primary)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        )}

        <ol
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            position: "relative",
            gap: "8px",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {steps.map((step, index) => {
            const completed = isStepCompleted(index);
            const active = isStepActive(index);
            const clickable = isStepClickable(index);
            const tooltipText = getTooltipText(step, index);
            const tooltipVisible =
              !tooltipDismissed && (hoveredIndex === index || focusedIndex === index);

            return (
              <li key={step.id} className="step-wrapper" style={{ flex: 1, position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                  onMouseEnter={() => {
                    setHoveredIndex(index);
                    setTooltipDismissed(false);
                  }}
                  onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                >
                  <div
                    id={`tooltip-${step.id}`}
                    className={`step-tooltip${tooltipVisible ? " step-tooltip--visible" : ""}`}
                    role="tooltip"
                  >
                    {tooltipText}
                  </div>

                  {/* Step Circle */}
                  <button
                    type="button"
                    onClick={() => clickable && onStepClick?.(index)}
                    aria-disabled={!clickable || undefined}
                    aria-label={`Step ${index + 1} of ${steps.length}: ${step.label}, ${getStepState(index)}`}
                    aria-current={active ? "step" : undefined}
                    aria-describedby={`tooltip-${step.id}`}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      border: `2px solid ${completed || active ? "var(--gw-color-primary)" : "var(--gw-color-text-muted)"}`,
                      backgroundColor: completed || active ? "var(--gw-color-primary)" : "var(--gw-color-white)",
                      color: completed || active ? "#ffffff" : "#4b5563",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: clickable ? "pointer" : "not-allowed",
                      transition: "all 0.2s ease",
                      fontFamily: "var(--gw-font-family)",
                      fontSize: "14px",
                      fontWeight: 600,
                      padding: 0,
                      marginBottom: "8px",
                    }}
                    onMouseEnter={(e) => {
                      if (clickable) {
                        e.currentTarget.style.transform = "scale(1.1)";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(20, 85, 143, 0.3)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (clickable) {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                    onFocus={(e) => {
                      setFocusedIndex(index);
                      setTooltipDismissed(false);
                      e.currentTarget.style.outline = "2px solid var(--gw-color-primary)";
                      e.currentTarget.style.outlineOffset = "2px";
                    }}
                    onBlur={(e) => {
                      setFocusedIndex(null);
                      e.currentTarget.style.outline = "none";
                    }}
                  >
                    {completed ? (
                      <LuCheck size={18} strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </button>

                  {/* Step Label */}
                  <div
                    className="step-text"
                    style={{
                      textAlign: "center",
                      maxWidth: "120px",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--gw-font-family)",
                        fontSize: "15px",
                        fontWeight: active ? 600 : 500,
                        color: active ? "var(--gw-color-primary)" : completed ? "var(--gw-color-text-muted)" : "var(--gw-color-text-status)",
                        lineHeight: "1.4",
                        transition: "color 0.2s ease",
                        cursor: "default",
                      }}
                      className="step-label"
                    >
                      {step.label}
                    </div>
                    {step.description && (
                      <div
                        style={{
                          fontFamily: "var(--gw-font-family)",
                          fontSize: "13px",
                          color: "#4b5563",
                          marginTop: "4px",
                          lineHeight: "1.3",
                        }}
                        className="step-description"
                      >
                        {step.description}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {current && (
        <p
          className="step-summary"
          style={{
            textAlign: "center",
            margin: "12px 0 0",
            fontFamily: "var(--gw-font-family)",
            fontSize: "13px",
            color: "#4b5563",
            fontWeight: 500,
          }}
        >
          {`Step ${activeStep + 1} of ${steps.length}: ${current.label}${current.description ? ` — ${current.description}` : ""}`}
        </p>
      )}

      {showProgress && (
        <div
          className="step-progress"
          style={{
            textAlign: "center",
            marginTop: "12px",
            fontFamily: "var(--gw-font-family)",
            fontSize: "12px",
            color: "#6b7280",
            fontWeight: 500,
          }}
        >
          {`Application progress: step ${activeStep + 1} of ${steps.length} (${Math.round(progressPercentage)}%)`}
        </div>
      )}
    </nav>
  );
};

export default ProgressStepper;

import React, { useState } from "react";
import { Check } from "lucide-react";

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
}

const ProgressStepper: React.FC<ProgressStepperProps> = ({
  steps,
  activeStep,
  onStepClick,
  completedSteps = [],
  showProgress = true,
}) => {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const progressPercentage = ((activeStep + 1) / steps.length) * 100;
  const isStepCompleted = (index: number) => completedSteps.includes(index) || index < activeStep;
  const isStepActive = (index: number) => index === activeStep;
  const isStepClickable = (index: number) => {
    if (!onStepClick) return false;
    // Allow clicking on completed steps or the next step
    return isStepCompleted(index) || index === activeStep + 1;
  };

  const getTooltipText = (step: typeof steps[0], index: number): string => {
    if (step.tooltip) return step.tooltip;
    
    const status = isStepCompleted(index) 
      ? "Completed" 
      : isStepActive(index) 
      ? "Current step" 
      : index < activeStep 
      ? "Completed" 
      : "Upcoming";
    
    const description = step.description ? ` - ${step.description}` : "";
    return `${step.label}${description}\nStatus: ${status}`;
  };

  return (
    <div
      className="progress-stepper-container"
      style={{
        width: "100%",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: "20px 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
      }}
    >
      <style>
        {`
          .step-tooltip {
            position: absolute;
            bottom: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 12px;
            background-color: #1f2937;
            color: #ffffff;
            border-radius: 6px;
            font-family: 'Noto Sans', sans-serif;
            font-size: 12px;
            font-weight: 400;
            white-space: pre-line;
            text-align: left;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease, transform 0.2s ease;
            max-width: 220px;
            min-width: 150px;
            line-height: 1.5;
          }
          
          .step-wrapper:first-child .step-tooltip {
            left: 0;
            transform: translateX(0);
          }
          
          .step-wrapper:last-child .step-tooltip {
            left: auto;
            right: 0;
            transform: translateX(0);
          }
          
          .step-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: #1f2937;
          }
          
          .step-wrapper:first-child .step-tooltip::after {
            left: 20px;
            transform: translateX(0);
          }
          
          .step-wrapper:last-child .step-tooltip::after {
            left: auto;
            right: 20px;
            transform: translateX(0);
          }
          
          .step-wrapper:hover .step-tooltip,
          .step-wrapper:focus-within .step-tooltip {
            opacity: 1;
            transform: translateX(-50%) translateY(-2px);
          }
          
          .step-wrapper:first-child:hover .step-tooltip,
          .step-wrapper:first-child:focus-within .step-tooltip {
            transform: translateX(0) translateY(-2px);
          }
          
          .step-wrapper:last-child:hover .step-tooltip,
          .step-wrapper:last-child:focus-within .step-tooltip {
            transform: translateX(0) translateY(-2px);
          }
          
          @media (max-width: 768px) {
            .progress-stepper-container {
              padding: 16px 12px !important;
            }
            .progress-stepper-container .step-label {
              font-size: 13px !important;
            }
            .progress-stepper-container .step-description {
              display: none;
            }
            .progress-stepper-container > div:last-child {
              font-size: 11px !important;
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
            }
            .progress-stepper-container .step-label {
              font-size: 12px !important;
            }
          }
        `}
      </style>
      {/* Progress Bar */}
      {showProgress && (
        <div
          style={{
            width: "100%",
            height: "4px",
            backgroundColor: "#e5e7eb",
            borderRadius: "2px",
            marginBottom: "24px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressPercentage}%`,
              height: "100%",
              backgroundColor: "#14558F",
              borderRadius: "2px",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {/* Steps */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          position: "relative",
          gap: "8px",
        }}
      >
        {/* Connector Lines */}
        {steps.length > 1 && (
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              right: "16px",
              height: "2px",
              backgroundColor: "#e5e7eb",
              zIndex: 0,
            }}
          >
            <div
              style={{
                width: steps.length > 1 ? `${(activeStep / (steps.length - 1)) * 100}%` : "0%",
                height: "100%",
                backgroundColor: "#14558F",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        )}

        {steps.map((step, index) => {
          const completed = isStepCompleted(index);
          const active = isStepActive(index);
          const clickable = isStepClickable(index);
          const isHovered = hoveredStep === index;
          const tooltipText = getTooltipText(step, index);

          return (
            <div
              key={step.id}
              className="step-wrapper"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                zIndex: isHovered ? 10 : 1,
              }}
              onMouseEnter={() => setHoveredStep(index)}
              onMouseLeave={() => setHoveredStep(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div
                  id={`tooltip-${step.id}`}
                  className="step-tooltip"
                  role="tooltip"
                  aria-hidden="true"
                >
                  {tooltipText}
                </div>
              )}

              {/* Step Circle */}
              <button
                onClick={() => clickable && onStepClick?.(index)}
                disabled={!clickable}
                aria-label={`Step ${index + 1}: ${step.label}${active ? " (current)" : ""}${completed ? " (completed)" : ""}`}
                aria-current={active ? "step" : undefined}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: `2px solid ${completed || active ? "#14558F" : "#e5e7eb"}`,
                  backgroundColor: completed || active ? "#14558F" : "#ffffff",
                  color: completed || active ? "#ffffff" : "#9ca3af",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: clickable ? "pointer" : "default",
                  transition: "all 0.2s ease",
                  fontFamily: "'Noto Sans', sans-serif",
                  fontSize: "14px",
                  fontWeight: 600,
                  padding: 0,
                  marginBottom: "8px",
                }}
                onMouseEnter={(e) => {
                  setHoveredStep(index);
                  if (clickable) {
                    e.currentTarget.style.transform = "scale(1.1)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(20, 85, 143, 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  setHoveredStep(null);
                  if (clickable) {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
                onFocus={(e) => {
                  setHoveredStep(index);
                  if (clickable) {
                    e.currentTarget.style.outline = "2px solid #0088FF";
                    e.currentTarget.style.outlineOffset = "2px";
                  }
                }}
                onBlur={(e) => {
                  setHoveredStep(null);
                  e.currentTarget.style.outline = "none";
                }}
              >
                {completed ? (
                  <Check size={18} strokeWidth={3} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </button>

              {/* Step Label */}
              <div
                style={{
                  textAlign: "center",
                  maxWidth: "120px",
                }}
                onMouseEnter={() => setHoveredStep(index)}
                onMouseLeave={() => setHoveredStep(null)}
              >
                <div
                  style={{
                    fontFamily: "'Noto Sans', sans-serif",
                    fontSize: "15px",
                    fontWeight: active ? 600 : 500,
                    color: active ? "#14558F" : completed ? "#6b7280" : "#9ca3af",
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
                      fontFamily: "'Noto Sans', sans-serif",
                      fontSize: "13px",
                      color: "#9ca3af",
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
          );
        })}
      </div>

      {/* Progress Percentage (Optional) */}
      {showProgress && (
        <div
          style={{
            textAlign: "center",
            marginTop: "12px",
            fontFamily: "'Noto Sans', sans-serif",
            fontSize: "12px",
            color: "#6b7280",
            fontWeight: 500,
          }}
        >
          {Math.round(progressPercentage)}% Complete
        </div>
      )}
    </div>
  );
};

export default ProgressStepper;

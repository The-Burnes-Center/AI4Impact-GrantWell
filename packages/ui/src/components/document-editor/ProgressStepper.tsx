import React, { useEffect, useRef, useState } from "react";
import { LuCheck, LuChevronDown, LuChevronRight } from "react-icons/lu";

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
  isStepClickable?: (stepIndex: number) => boolean; // Custom function to determine if step is clickable
}

const ProgressStepper: React.FC<ProgressStepperProps> = ({
  steps,
  activeStep,
  onStepClick,
  completedSteps = [],
  isStepClickable: customIsStepClickable,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const [allStepsOpen, setAllStepsOpen] = useState(false);
  const allStepsSummaryRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    setAllStepsOpen(false);
  }, [activeStep]);

  // Opening the list unpins the stepper, which can leave the summary above the viewport.
  useEffect(() => {
    if (!allStepsOpen) return;
    const reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    allStepsSummaryRef.current?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [allStepsOpen]);

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
      className={`progress-stepper-container${allStepsOpen ? " progress-stepper-container--list-open" : ""}`}
      aria-label="Application steps"
      style={{
        width: "100%",
        background: "var(--gw-color-surface)",
        borderBottom: "1px solid var(--gw-color-border)",
        padding: "8px 20px",
        position: "sticky",
        top: "var(--gw-editor-header-height, 62px)",
        zIndex: 100,
        boxShadow: "var(--gw-shadow-low)",
        boxSizing: "border-box",
      }}
    >
      <style>
        {`
          .step-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px;
            max-width: var(--gw-content-max-width, 1400px);
            margin: 0 auto;
            padding: 0;
            list-style: none;
          }
          .step-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            gap: 4px;
            z-index: 1;
          }
          .step-wrapper:hover,
          .step-wrapper:focus-within {
            z-index: 10;
          }
          .step-hover {
            position: relative;
          }
          .step-chip {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 44px;
            min-width: 44px;
            box-sizing: border-box;
            padding: 0 10px;
            border: none;
            border-radius: var(--gw-radius-control);
            background: none;
            color: var(--gw-color-text-secondary);
            font-family: var(--gw-font-family);
            font-size: 14px;
            font-weight: 500;
            line-height: 1.3;
            text-align: left;
          }
          button.step-chip {
            cursor: pointer;
          }
          button.step-chip:hover {
            background: var(--gw-color-surface-subtle);
            color: var(--gw-color-primary-hover);
          }
          button.step-chip:hover .step-chip__label {
            text-decoration: underline;
            text-underline-offset: 3px;
          }
          .step-chip--current {
            padding: 0 12px;
            background: var(--gw-color-primary-light);
            color: var(--gw-color-primary-hover);
            font-weight: 600;
          }
          .step-chip__marker {
            display: flex;
            flex-shrink: 0;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            box-sizing: border-box;
            border: 2px solid var(--gw-color-text-muted);
            border-radius: 50%;
            background: var(--gw-color-surface);
            color: var(--gw-color-border-input-hover);
            font-size: 12px;
            font-weight: 600;
          }
          .step-chip__marker--filled {
            border-color: var(--gw-color-primary);
            background: var(--gw-color-primary);
            color: var(--gw-color-text-inverse);
          }
          .step-separator {
            flex-shrink: 0;
            color: var(--gw-color-border-strong);
          }

          .step-tooltip {
            position: absolute;
            top: calc(100% + 8px);
            left: 0;
            padding: 8px 12px;
            background-color: var(--gw-color-text-strong);
            color: var(--gw-color-text-inverse);
            border-radius: var(--gw-radius-control);
            font-family: var(--gw-font-family);
            font-size: 12px;
            font-weight: 400;
            white-space: pre-line;
            text-align: left;
            box-shadow: var(--gw-shadow-mid);
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s ease, transform 0.2s ease;
            max-width: min(220px, calc(100vw - 32px));
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
          .step-tooltip::before {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 15px;
            border: 6px solid transparent;
            border-bottom-color: var(--gw-color-text-strong);
          }
          .step-tooltip.step-tooltip--visible {
            opacity: 1;
            visibility: visible;
            transform: translateY(2px);
          }

          .progress-stepper-container .step-summary {
            display: none;
          }
          .step-all {
            margin: 4px auto 0;
            max-width: 360px;
            font-family: var(--gw-font-family);
            font-size: 13px;
          }
          .step-all > summary {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            min-height: 44px;
            list-style: none;
            cursor: pointer;
            color: var(--gw-color-primary-hover);
            font-weight: 600;
            text-decoration: underline;
            text-underline-offset: 3px;
          }
          .step-all > summary::-webkit-details-marker {
            display: none;
          }
          .step-all__chevron {
            flex-shrink: 0;
            transition: transform 0.15s ease;
          }
          .step-all[open] .step-all__chevron {
            transform: rotate(180deg);
          }
          /* WCAG 2.4.11: the open list can be taller than the screen, so it scrolls with the page. */
          .progress-stepper-container.progress-stepper-container--list-open,
          .document-editor-header:has(+ .progress-stepper-container--list-open) {
            position: static !important;
          }
          .step-all ol {
            display: grid;
            gap: 4px;
            margin: 8px 0 0;
            padding: 0;
            list-style: none;
          }
          .step-all li {
            display: grid;
            gap: 1px;
            color: var(--gw-color-text);
          }
          .step-all .step-all__row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
          }
          .step-all .step-all__desc {
            font-size: 12px;
            color: var(--gw-color-text-secondary);
          }
          .step-all li[aria-current] {
            font-weight: 600;
          }
          .step-all .step-all__state {
            color: var(--gw-color-text-secondary);
            white-space: nowrap;
          }

          @media (max-width: 768px) {
            .progress-stepper-container {
              padding: 8px 12px !important;
            }
            .progress-stepper-container .step-summary {
              display: block;
            }
            .step-tooltip {
              display: none;
            }
          }
          @media (max-width: 480px) {
            .progress-stepper-container {
              padding: 8px !important;
            }
            .step-row {
              justify-content: center;
            }
            /* Five named chips need several rows here; the summary line names the current step. */
            .step-chip {
              justify-content: center;
              padding: 0;
            }
            .step-chip__label {
              display: none;
            }
          }
        `}
      </style>
      <ol className="step-row">
        {steps.map((step, index) => {
          const completed = isStepCompleted(index);
          const active = isStepActive(index);
          const clickable = isStepClickable(index) && !active;
          const tooltipVisible = !tooltipDismissed && (hoveredIndex === index || focusedIndex === index);
          const content = (
            <>
              <span
                className={`step-chip__marker${completed || active ? " step-chip__marker--filled" : ""}`}
                aria-hidden="true"
              >
                {completed ? <LuCheck size={14} strokeWidth={3} /> : index + 1}
              </span>
              <span className="step-chip__label" aria-hidden="true">{step.label}</span>
              <span className="visually-hidden">
                {`Step ${index + 1} of ${steps.length}: ${step.label}, ${getStepState(index)}`}
              </span>
            </>
          );

          return (
            <li key={step.id} className="step-wrapper" aria-current={active ? "step" : undefined}>
              <div
                className="step-hover"
                onMouseEnter={() => {
                  setHoveredIndex(index);
                  setTooltipDismissed(false);
                }}
                onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
              >
                {clickable ? (
                  <button
                    type="button"
                    className="step-chip"
                    onClick={() => onStepClick?.(index)}
                    aria-describedby={`tooltip-${step.id}`}
                    onFocus={() => {
                      setFocusedIndex(index);
                      setTooltipDismissed(false);
                    }}
                    onBlur={() => setFocusedIndex(null)}
                  >
                    {content}
                  </button>
                ) : (
                  <span className={`step-chip${active ? " step-chip--current" : ""}`}>{content}</span>
                )}
                <div
                  id={`tooltip-${step.id}`}
                  className={`step-tooltip${tooltipVisible ? " step-tooltip--visible" : ""}`}
                  role="tooltip"
                >
                  {getTooltipText(step, index)}
                </div>
              </div>
              {index < steps.length - 1 && (
                <LuChevronRight size={16} className="step-separator" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>

      {current && (
        <p
          className="step-summary"
          style={{
            textAlign: "center",
            margin: "8px 0 0",
            fontFamily: "var(--gw-font-family)",
            fontSize: "13px",
            color: "var(--gw-color-text-secondary)",
            fontWeight: 500,
          }}
        >
          {`Step ${activeStep + 1} of ${steps.length}: ${current.label}${current.description ? ` — ${current.description}` : ""}`}
        </p>
      )}

      {/* Every step's help text and state, reachable without hover; phones also hide the tooltips and the smallest the step names. */}
      <details
        className="step-all"
        open={allStepsOpen}
        onToggle={(e) => setAllStepsOpen(e.currentTarget.open)}
      >
        <summary ref={allStepsSummaryRef}>
          All steps
          <LuChevronDown size={14} className="step-all__chevron" aria-hidden="true" />
        </summary>
        <ol>
          {steps.map((step, index) => (
            <li key={step.id} aria-current={isStepActive(index) ? "step" : undefined}>
              <span className="step-all__row">
                <span>{`${index + 1} ${step.label}`}</span>
                <span className="step-all__state">
                  {isStepActive(index)
                    ? "You are here"
                    : isStepCompleted(index)
                      ? "Done"
                      : isStepClickable(index)
                        ? "Not started"
                        : "Locked"}
                </span>
              </span>
              {(step.tooltip ?? step.description) && <span className="step-all__desc">{step.tooltip ?? step.description}</span>}
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
};

export default ProgressStepper;

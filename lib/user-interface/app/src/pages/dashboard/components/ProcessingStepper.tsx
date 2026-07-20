import React from "react";
import { LuCheck } from "react-icons/lu";
import { PROCESSING_STAGES, stageIndex } from "./processing-stages";

interface ProcessingStepperProps {
  /** Current `processing_status` value from the metadata record. */
  status: string;
}

/**
 * Compact ordered progress indicator for a NOFO moving through the ingestion
 * pipeline. Renders each stage as a dot — completed stages filled, the current
 * stage pulsing, later stages muted — with the current stage's label beside it.
 * A `quarantined` status is handled by the caller (it links to review), not here.
 */
const ProcessingStepper: React.FC<ProcessingStepperProps> = ({ status }) => {
  const current = stageIndex(status);
  // An unrecognized/terminal status has no position; show a neutral label rather
  // than pinning the stepper to the first stage.
  const label = current >= 0 ? PROCESSING_STAGES[current].label : "Processing";

  return (
    <span
      className="processing-stepper"
      role="status"
      aria-label={`Processing: ${label}`}
    >
      <span className="processing-stepper__dots" aria-hidden="true">
        {PROCESSING_STAGES.map((stage, i) => {
          const state =
            i < current ? "done" : i === current ? "current" : "upcoming";
          return (
            <span
              key={stage.key}
              className={`processing-stepper__dot processing-stepper__dot--${state}`}
              title={stage.label}
            >
              {state === "done" && <LuCheck size={9} aria-hidden="true" />}
            </span>
          );
        })}
      </span>
      <span className="processing-stepper__label">{label}</span>
    </span>
  );
};

export default ProcessingStepper;

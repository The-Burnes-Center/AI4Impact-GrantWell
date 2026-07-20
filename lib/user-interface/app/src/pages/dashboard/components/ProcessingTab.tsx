import React from "react";
import { LuCheck, LuLoader } from "react-icons/lu";
import { PROCESSING_STAGES, stageIndex } from "./processing-stages";
import type { NOFO } from "../../../common/types/nofo";

interface ProcessingTabProps {
  /** In-flight grants (processingStatus set, not quarantined). */
  nofos: NOFO[];
}

const TOTAL_STAGES = PROCESSING_STAGES.length;

function stateLabel(state: "done" | "current" | "upcoming"): string {
  if (state === "done") return "Done";
  if (state === "current") return "In progress";
  return "Waiting";
}

/**
 * The "Processing" segment of the Grants tab: grants still moving through the ingestion pipeline.
 * Each card shows overall progress (bar + "Step N of TOTAL"), a plain-language description of the
 * current stage, and the full stage list with per-stage state. These rows are not visible to end
 * users until processing finishes.
 */
const ProcessingTab: React.FC<ProcessingTabProps> = ({ nofos }) => {
  if (nofos.length === 0) {
    return (
      <div className="processing-tab__empty">
        <p>No grants are processing right now.</p>
        <p className="processing-tab__empty-hint">
          Uploaded grants appear here with live progress until they finish and go live.
        </p>
      </div>
    );
  }

  return (
    <div className="processing-tab">
      {nofos.map((nofo) => {
        const current = stageIndex(nofo.processingStatus);
        // Completed-stage count for the progress readout: stages strictly before the current one.
        // Clamp so an unknown/terminal status doesn't produce a negative or over-100% value.
        const completed = current < 0 ? 0 : Math.min(current, TOTAL_STAGES);
        const percent = Math.round((completed / TOTAL_STAGES) * 100);
        const stepNumber = current < 0 ? TOTAL_STAGES : current + 1;
        const currentStage = current >= 0 ? PROCESSING_STAGES[current] : null;

        return (
          <div key={nofo.name} className="processing-tab__card">
            <div className="processing-tab__header">
              <p className="processing-tab__name">{nofo.name}</p>
              <span className="processing-tab__count">
                Step {stepNumber} of {TOTAL_STAGES} &middot; {percent}%
              </span>
            </div>

            <div
              className="processing-tab__bar"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${nofo.name} processing progress`}
            >
              <div className="processing-tab__bar-fill" style={{ width: `${percent}%` }} />
            </div>

            {currentStage && (
              <p className="processing-tab__current-desc">{currentStage.description}</p>
            )}

            <ol className="processing-tab__steps">
              {PROCESSING_STAGES.map((stage, i) => {
                const state =
                  i < current ? "done" : i === current ? "current" : "upcoming";
                return (
                  <li
                    key={stage.key}
                    className={`processing-tab__step processing-tab__step--${state}`}
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    <span className="processing-tab__marker" aria-hidden="true">
                      {state === "done" && <LuCheck size={13} />}
                      {state === "current" && (
                        <LuLoader size={13} className="processing-tab__spin" />
                      )}
                    </span>
                    <span className="processing-tab__step-text">
                      <span className="processing-tab__label">{stage.label}</span>
                      <span className="processing-tab__state">{stateLabel(state)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
};

export default ProcessingTab;

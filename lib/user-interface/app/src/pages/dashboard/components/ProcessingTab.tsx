import React from "react";
import { LuCheck, LuLoader } from "react-icons/lu";
import { PROCESSING_STAGES, stageIndex } from "./processing-stages";
import type { NOFO } from "../../../common/types/nofo";

interface ProcessingTabProps {
  /** In-flight grants (processingStatus set, not quarantined). */
  nofos: NOFO[];
}

/**
 * The "Processing" segment of the Grants tab: grants still moving through the ingestion pipeline,
 * each with a full labeled stepper showing how far along it is. These rows are not visible to
 * end users until processing finishes. Freshest uploads first.
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
        return (
          <div key={nofo.name} className="processing-tab__card">
            <p className="processing-tab__name">{nofo.name}</p>
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
                    <span className="processing-tab__label">{stage.label}</span>
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

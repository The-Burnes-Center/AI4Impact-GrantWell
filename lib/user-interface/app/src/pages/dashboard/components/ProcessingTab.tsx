import React from "react";
import { LuCheck, LuLoader, LuCircleCheck, LuTriangleAlert, LuArrowRight, LuX } from "react-icons/lu";
import { PROCESSING_STAGES, stageIndex } from "./processing-stages";
import type { NOFO } from "../../../common/types/nofo";

interface ProcessingTabProps {
  /** In-flight grants (processingStatus set) plus ones finished within the last 24h. */
  nofos: NOFO[];
  /** Open the grant's summary/requirements page (used by a succeeded card). */
  onViewSummary: (nofoName: string) => void;
  /** Jump to the "Needs attention" segment focused on a grant (used by a failed card). */
  onOpenReview: (nofoName: string) => void;
  /** Hide a finished card from the tab (client-side; resets on reload). */
  onDismiss: (nofoName: string) => void;
}

const TOTAL_STAGES = PROCESSING_STAGES.length;

function stateLabel(state: "done" | "current" | "upcoming"): string {
  if (state === "done") return "Done";
  if (state === "current") return "In progress";
  return "Waiting";
}

/** A grant is "finished" (terminal card) when it has a completion stamp and no live stage. */
function isFinished(nofo: NOFO): boolean {
  return !!nofo.processingCompletedAt && !nofo.processingStatus;
}

const InProgressCard: React.FC<{ nofo: NOFO }> = ({ nofo }) => {
  const current = stageIndex(nofo.processingStatus);
  const completed = current < 0 ? 0 : Math.min(current, TOTAL_STAGES);
  const percent = Math.round((completed / TOTAL_STAGES) * 100);
  const stepNumber = current < 0 ? TOTAL_STAGES : current + 1;
  const currentStage = current >= 0 ? PROCESSING_STAGES[current] : null;

  return (
    <div className="processing-tab__card">
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
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
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
};

const FinishedCard: React.FC<{
  nofo: NOFO;
  onViewSummary: (name: string) => void;
  onOpenReview: (name: string) => void;
  onDismiss: (name: string) => void;
}> = ({ nofo, onViewSummary, onOpenReview, onDismiss }) => {
  const published = nofo.processingOutcome === "published";
  return (
    <div
      className={`processing-tab__card processing-tab__card--${published ? "published" : "failed"}`}
    >
      <div className="processing-tab__header">
        <p className="processing-tab__name">{nofo.name}</p>
        <span className="processing-tab__header-right">
          <span
            className={`processing-tab__outcome processing-tab__outcome--${published ? "published" : "failed"}`}
          >
            {published ? (
              <>
                <LuCircleCheck size={14} aria-hidden="true" /> Published — live
              </>
            ) : (
              <>
                <LuTriangleAlert size={14} aria-hidden="true" /> Needs review
              </>
            )}
          </span>
          <button
            type="button"
            className="processing-tab__dismiss"
            onClick={() => onDismiss(nofo.name)}
            aria-label={`Dismiss ${nofo.name} from processing`}
            title="Dismiss"
          >
            <LuX size={14} aria-hidden="true" />
          </button>
        </span>
      </div>

      <p className="processing-tab__current-desc">
        {published
          ? "This grant finished processing and is now live for users."
          : "This grant couldn't be published automatically and needs a review."}
      </p>

      {published ? (
        <button
          type="button"
          className="processing-tab__action processing-tab__action--primary"
          onClick={() => onViewSummary(nofo.name)}
        >
          View summary <LuArrowRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className="processing-tab__action processing-tab__action--attention"
          onClick={() => onOpenReview(nofo.name)}
        >
          Go to Needs attention <LuArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/**
 * The "Processing" segment of the Grants tab. Splits into two groups so completed uploads don't
 * vanish the instant they finish: grants still moving through the pipeline (with a detailed
 * stepper), and grants that finished within the last 24h (a terminal card with an outcome +
 * a button to the summary page, or to the Needs-attention queue on failure).
 */
const ProcessingTab: React.FC<ProcessingTabProps> = ({ nofos, onViewSummary, onOpenReview, onDismiss }) => {
  const inProgress = nofos.filter((n) => !isFinished(n));
  const finished = nofos.filter(isFinished);

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
      {inProgress.length > 0 && (
        <>
          <h3 className="processing-tab__group-title">In progress</h3>
          {inProgress.map((nofo) => (
            <InProgressCard key={nofo.name} nofo={nofo} />
          ))}
        </>
      )}

      {finished.length > 0 && (
        <>
          <h3 className="processing-tab__group-title">Recently finished</h3>
          {finished.map((nofo) => (
            <FinishedCard
              key={nofo.name}
              nofo={nofo}
              onViewSummary={onViewSummary}
              onOpenReview={onOpenReview}
              onDismiss={onDismiss}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default ProcessingTab;

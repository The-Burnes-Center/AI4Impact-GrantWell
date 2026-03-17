import React from "react";
import { LuCheck, LuX, LuRefreshCw } from "react-icons/lu";

interface ReviewActionsProps {
  actionInProgress: string | null;
  hasCorrections: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReprocess: () => void;
}

const ReviewActions: React.FC<ReviewActionsProps> = ({
  actionInProgress,
  hasCorrections,
  onApprove,
  onReject,
  onReprocess,
}) => {
  return (
    <div className="review-expanded-row__actions">
      <button
        className="review-btn review-btn--reprocess"
        onClick={onReprocess}
        disabled={actionInProgress !== null}
        aria-label="Reprocess this NOFO through the pipeline"
      >
        <LuRefreshCw
          size={14}
          className={actionInProgress === "reprocess" ? "refresh-icon" : ""}
          aria-hidden="true"
        />
        {actionInProgress === "reprocess" ? "Reprocessing..." : "Reprocess"}
      </button>

      <button
        className="review-btn review-btn--reject"
        onClick={onReject}
        disabled={actionInProgress !== null}
        aria-label="Reject this NOFO"
      >
        <LuX size={14} aria-hidden="true" />
        {actionInProgress === "reject" ? "Rejecting..." : "Reject"}
      </button>

      <button
        className="review-btn review-btn--approve"
        onClick={onApprove}
        disabled={actionInProgress !== null}
        aria-label="Approve and publish this NOFO"
      >
        <LuCheck size={14} aria-hidden="true" />
        {actionInProgress === "approve"
          ? "Publishing..."
          : hasCorrections
            ? "Approve with Edits"
            : "Approve As-Is"}
      </button>
    </div>
  );
};

export default ReviewActions;

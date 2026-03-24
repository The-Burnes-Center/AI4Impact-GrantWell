import React from "react";
import { LuCheck, LuX, LuRefreshCw, LuUpload } from "react-icons/lu";

interface ReviewActionsProps {
  actionInProgress: string | null;
  hasCorrections: boolean;
  canApprove: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReprocess: () => void;
  onReupload: () => void;
  rejectDisabled?: boolean;
}

const ReviewActions: React.FC<ReviewActionsProps> = ({
  actionInProgress,
  hasCorrections,
  canApprove,
  onApprove,
  onReject,
  onReprocess,
  onReupload,
  rejectDisabled = false,
}) => {
  return (
    <div className="review-expanded-row__actions">
      {canApprove ? (
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
      ) : null}

      <button
        className="review-btn review-btn--reject"
        onClick={onReject}
        disabled={actionInProgress !== null || rejectDisabled}
        aria-label={rejectDisabled ? "Reject this NOFO (admin notes required)" : "Reject this NOFO"}
      >
        <LuX size={14} aria-hidden="true" />
        {actionInProgress === "reject" ? "Rejecting..." : "Reject"}
      </button>

      {!canApprove ? (
        <button
          className="review-btn review-btn--approve"
          onClick={onReupload}
          disabled={actionInProgress !== null}
          aria-label="Upload the correct NOFO document to replace this one"
        >
          <LuUpload size={14} aria-hidden="true" />
          {actionInProgress === "reupload" ? "Uploading..." : "Re-upload Correct NOFO"}
        </button>
      ) : (
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
      )}
    </div>
  );
};

export default ReviewActions;

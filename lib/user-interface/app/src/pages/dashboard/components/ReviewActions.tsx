import React from "react";
import { LuCheck, LuX, LuRefreshCw, LuUpload, LuTriangleAlert } from "react-icons/lu";

type ReviewSource = "pipeline" | "dlq" | "duplicate" | "quality";

interface ReviewActionsProps {
  actionInProgress: string | null;
  hasCorrections: boolean;
  canApprove: boolean;
  status: string;
  source?: ReviewSource;
  onApprove: () => void;
  onReject: () => void;
  onReprocess: () => void;
  onReupload: () => void;
  onNeedsReupload: () => void;
  rejectDisabled?: boolean;
}

/**
 * The single action most likely to resolve a review, given how it failed. The
 * backend already knows this via `source`/`canApprove`; surfacing it as the
 * emphasized primary button spares the admin from deciding among five options.
 */
type RecommendedAction = "approve" | "reupload" | "reject" | "reprocess";

function recommendedAction(
  source: ReviewSource | undefined,
  canApprove: boolean
): RecommendedAction {
  if (source === "duplicate") return "reject";
  if (source === "quality") return "reupload";
  if (source === "dlq" || source === "pipeline") return "reprocess";
  // A content NEEDS_REVIEW: approvable partials → approve, otherwise re-upload.
  return canApprove ? "approve" : "reupload";
}

const ReviewActions: React.FC<ReviewActionsProps> = ({
  actionInProgress,
  hasCorrections,
  canApprove,
  status,
  source,
  onApprove,
  onReject,
  onReprocess,
  onReupload,
  onNeedsReupload,
  rejectDisabled = false,
}) => {
  const busy = actionInProgress !== null;

  // needs_reupload is a terminal holding state: the only meaningful moves are
  // supplying the new document or abandoning the entry.
  if (status === "needs_reupload") {
    return (
      <div className="review-expanded-row__actions">
        <button
          className="review-btn review-btn--approve review-btn--recommended"
          onClick={onReupload}
          disabled={busy}
          aria-label="Upload the correct NOFO document"
        >
          <LuUpload size={14} aria-hidden="true" />
          {actionInProgress === "reupload" ? "Uploading..." : "Re-upload Document"}
        </button>
        <button
          className="review-btn review-btn--reject"
          onClick={onReject}
          disabled={busy || rejectDisabled}
          aria-label={rejectDisabled ? "Reject this NOFO (admin notes required)" : "Reject this NOFO"}
        >
          <LuX size={14} aria-hidden="true" />
          {actionInProgress === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>
    );
  }

  const recommended = recommendedAction(source, canApprove);

  const approveBtn = canApprove ? (
    <button
      key="approve"
      className={`review-btn review-btn--approve ${recommended === "approve" ? "review-btn--recommended" : ""}`}
      onClick={onApprove}
      disabled={busy}
      aria-label="Approve and publish this NOFO"
    >
      <LuCheck size={14} aria-hidden="true" />
      {actionInProgress === "approve"
        ? "Publishing..."
        : hasCorrections
          ? "Approve with Edits"
          : "Approve As-Is"}
    </button>
  ) : null;

  const reuploadBtn = (
    <button
      key="reupload"
      className={`review-btn ${recommended === "reupload" ? "review-btn--approve review-btn--recommended" : "review-btn--secondary"}`}
      onClick={onReupload}
      disabled={busy}
      aria-label="Upload the correct NOFO document to replace this one"
    >
      <LuUpload size={14} aria-hidden="true" />
      {actionInProgress === "reupload" ? "Uploading..." : "Re-upload Correct NOFO"}
    </button>
  );

  const reprocessBtn = (
    <button
      key="reprocess"
      className={`review-btn ${recommended === "reprocess" ? "review-btn--approve review-btn--recommended" : "review-btn--reprocess"}`}
      onClick={onReprocess}
      disabled={busy}
      aria-label="Reprocess this NOFO through the pipeline"
    >
      <LuRefreshCw
        size={14}
        className={actionInProgress === "reprocess" ? "refresh-icon" : ""}
        aria-hidden="true"
      />
      {actionInProgress === "reprocess" ? "Reprocessing..." : "Reprocess"}
    </button>
  );

  const rejectBtn = (
    <button
      key="reject"
      className={`review-btn ${recommended === "reject" ? "review-btn--reject review-btn--recommended" : "review-btn--reject"}`}
      onClick={onReject}
      disabled={busy || rejectDisabled}
      aria-label={rejectDisabled ? "Reject this NOFO (admin notes required)" : "Reject this NOFO"}
    >
      <LuX size={14} aria-hidden="true" />
      {actionInProgress === "reject" ? "Rejecting..." : "Reject"}
    </button>
  );

  const needsReuploadBtn = (
    <button
      key="needs_reupload"
      className="review-btn review-btn--needs-reupload"
      onClick={onNeedsReupload}
      disabled={busy}
      aria-label="Mark this NOFO as needing a new document upload"
    >
      <LuTriangleAlert size={14} aria-hidden="true" />
      {actionInProgress === "needs_reupload" ? "Marking..." : "Needs Re-upload"}
    </button>
  );

  // Order the recommended action first; the rest follow as secondary options.
  const byKey: Record<RecommendedAction, React.ReactNode> = {
    approve: approveBtn,
    reupload: reuploadBtn,
    reprocess: reprocessBtn,
    reject: rejectBtn,
  };
  const rest = (["approve", "reprocess", "reject", "reupload"] as RecommendedAction[])
    .filter((k) => k !== recommended)
    .map((k) => byKey[k]);

  return (
    <div className="review-expanded-row__actions">
      {byKey[recommended]}
      {rest}
      {needsReuploadBtn}
    </div>
  );
};

export default ReviewActions;

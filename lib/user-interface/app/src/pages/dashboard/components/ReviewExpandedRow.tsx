import React, { useState, useEffect } from "react";
import { LuWrench, LuChevronUp, LuTriangleAlert } from "react-icons/lu";
import { ApiClient } from "../../../common/api-client/api-client";
import type {
  ReviewItem,
  ReviewDetail,
  ValidationIssue,
} from "../../../common/types/processing-review";
import ValidationIssueCard from "./ValidationIssueCard";
import SummaryEditor from "./SummaryEditor";
import SummaryDiff from "./SummaryDiff";
import ReviewActions from "./ReviewActions";
import { Modal } from "../../../components/common/Modal";

interface ReviewExpandedRowProps {
  review: ReviewItem;
  apiClient: ApiClient;
  onActionComplete: () => void;
  addNotification: (type: string, message: string) => void;
  onCollapse: () => void;
}

interface SummaryField {
  item: string;
  description: string;
  confidence?: string;
  removed?: boolean;
}

const ReviewExpandedRow: React.FC<ReviewExpandedRowProps> = ({
  review,
  apiClient,
  onActionComplete,
  addNotification,
  onCollapse,
}) => {
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminNotes, setAdminNotes] = useState("");
  const [notesError, setNotesError] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [editedSummary, setEditedSummary] = useState<Record<string, unknown> | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadDetail();
  }, [review.nofo_name]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const result = await apiClient.landingPage.getReviewDetail(review.nofo_name);
      setDetail(result);
      if (result.extractedSummary) {
        setEditedSummary({ ...result.extractedSummary });
      }
      setAdminNotes(result.admin_notes || "");
    } catch {
      addNotification("error", "Failed to load review details");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFix = (issue: ValidationIssue) => {
    if (!editedSummary) return;

    const fieldMatch = issue.field.match(/^(\w+)\[(\d+)\]$/);
    if (fieldMatch) {
      const [, arrayName, indexStr] = fieldMatch;
      const index = parseInt(indexStr, 10);
      const arr = editedSummary[arrayName] as SummaryField[] | undefined;
      if (arr && Array.isArray(arr) && arr[index]) {
        if (
          issue.category === "hallucination" ||
          issue.suggestedFix.toLowerCase().includes("remove")
        ) {
          const updated = [...arr];
          updated[index] = { ...updated[index], removed: true };
          setEditedSummary({ ...editedSummary, [arrayName]: updated });
        }
      }
    } else if (issue.field === "GrantName" && issue.suggestedFix) {
      const nameMatch = issue.suggestedFix.match(/"([^"]+)"/);
      if (nameMatch) {
        setEditedSummary({ ...editedSummary, GrantName: nameMatch[1] });
      }
    }

    addNotification("info", `Applied suggested fix for ${issue.field}`);
  };

  const handleApplyAllFixes = () => {
    if (!detail?.validationResult?.issues) return;
    for (const issue of detail.validationResult.issues) {
      handleApplyFix(issue);
    }
    addNotification("info", "All suggested fixes applied");
  };

  const getCorrections = (): Record<string, unknown> | undefined => {
    if (!editedSummary || !detail?.extractedSummary) return undefined;
    if (JSON.stringify(editedSummary) === JSON.stringify(detail.extractedSummary)) {
      return undefined;
    }

    const corrections: Record<string, unknown> = {};
    for (const key of Object.keys(editedSummary)) {
      const edited = editedSummary[key];
      if (Array.isArray(edited)) {
        const filtered = (edited as SummaryField[]).filter((item) => !item.removed);
        if (JSON.stringify(filtered) !== JSON.stringify(detail.extractedSummary[key])) {
          corrections[key] = filtered;
        }
      } else if (edited !== (detail.extractedSummary as Record<string, unknown>)[key]) {
        corrections[key] = edited;
      }
    }
    return Object.keys(corrections).length > 0 ? corrections : undefined;
  };

  const handleApprove = async () => {
    setActionInProgress("approve");
    try {
      const corrections = getCorrections();
      await apiClient.landingPage.approveReview(
        review.nofo_name,
        corrections,
        adminNotes || undefined
      );
      addNotification("success", `"${review.nofo_name}" approved and published`);
      onActionComplete();
    } catch {
      addNotification("error", "Failed to approve review");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectClick = () => {
    if (!adminNotes.trim()) {
      setNotesError(true);
      addNotification("error", "Please provide a reason for rejection");
      return;
    }
    setNotesError(false);
    setRejectModalOpen(true);
  };

  const confirmReject = async () => {
    setRejectModalOpen(false);
    setActionInProgress("reject");
    try {
      await apiClient.landingPage.rejectReview(review.nofo_name, adminNotes);
      addNotification("info", `"${review.nofo_name}" rejected`);
      onActionComplete();
    } catch {
      addNotification("error", "Failed to reject review");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReprocess = async () => {
    setActionInProgress("reprocess");
    try {
      await apiClient.landingPage.reprocessNofo(review.nofo_name);
      addNotification("info", `Reprocessing triggered for "${review.nofo_name}"`);
      onActionComplete();
    } catch {
      addNotification("error", "Failed to trigger reprocessing");
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div
        style={{ padding: "20px", textAlign: "center", color: "var(--mds-color-text-secondary)" }}
        aria-busy="true"
      >
        Loading review details...
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "var(--mds-color-danger)" }}>
        Failed to load review details.
      </div>
    );
  }

  const issues = detail.validationResult?.issues || [];
  const criticalIssues = issues.filter((i) => i.severity === "critical");
  const warningIssues = issues.filter((i) => i.severity === "warning");
  const infoIssues = issues.filter((i) => i.severity === "info");

  return (
    <div
      className="review-expanded-row"
      role="region"
      aria-label={`Review details for ${review.nofo_name}`}
    >
      <div className="review-expanded-row__header">
        <h3 style={{ margin: 0, fontSize: "15px", color: "var(--mds-color-heading)" }}>
          Validation Issues ({issues.length})
        </h3>
        <button
          className="review-btn review-btn--collapse"
          onClick={onCollapse}
          aria-label="Collapse review details"
        >
          <LuChevronUp size={14} aria-hidden="true" />
          Collapse
        </button>
      </div>

      {issues.length > 0 ? (
        <div style={{ marginBottom: "16px" }}>
          {criticalIssues.map((issue, i) => (
            <ValidationIssueCard key={`crit-${i}`} issue={issue} onApplyFix={handleApplyFix} />
          ))}
          {warningIssues.map((issue, i) => (
            <ValidationIssueCard key={`warn-${i}`} issue={issue} onApplyFix={handleApplyFix} />
          ))}
          {infoIssues.map((issue, i) => (
            <ValidationIssueCard key={`info-${i}`} issue={issue} onApplyFix={handleApplyFix} />
          ))}
          {issues.length > 1 && (
            <button
              className="review-btn review-btn--apply-all"
              onClick={handleApplyAllFixes}
              aria-label="Apply all suggested fixes"
            >
              <LuWrench size={14} aria-hidden="true" />
              Apply All Fixes
            </button>
          )}
        </div>
      ) : review.source === "dlq" ? (
        <div className="review-dlq-alert" role="alert">
          This NOFO failed processing and was moved to the Dead Letter Queue.
          {detail.errorMessage && (
            <div style={{ marginTop: "8px", fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {detail.errorMessage}
            </div>
          )}
        </div>
      ) : null}

      {editedSummary && (
        <>
          {getCorrections() !== undefined && (
            <button
              type="button"
              className="review-btn review-btn--apply-all"
              onClick={() => setShowDiff(!showDiff)}
              aria-pressed={showDiff}
              aria-label={showDiff ? "Show editor" : "Review changes"}
            >
              {showDiff ? "Show Editor" : "Review Changes"}
            </button>
          )}
          {showDiff && getCorrections() !== undefined ? (
            <SummaryDiff
              original={detail.extractedSummary as Record<string, unknown>}
              edited={editedSummary}
            />
          ) : (
            <SummaryEditor
              editedSummary={editedSummary}
              onSummaryChange={setEditedSummary}
            />
          )}
        </>
      )}

      {detail.documentTextPreview && (
        <details className="review-source-preview">
          <summary>Source Document Preview</summary>
          <div className="review-source-preview__content">
            {detail.documentTextPreview}
          </div>
        </details>
      )}

      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor={`admin-notes-${review.review_id}`}
          className="summary-field__label"
        >
          Admin Notes
          <span className="review-field-required">(Required for rejection)</span>
        </label>
        <textarea
          id={`admin-notes-${review.review_id}`}
          className={`review-admin-notes ${notesError ? "review-admin-notes--error" : ""}`}
          value={adminNotes}
          onChange={(e) => {
            setAdminNotes(e.target.value);
            if (notesError) setNotesError(false);
          }}
          placeholder="Add notes about this review..."
          rows={2}
          aria-required="true"
          aria-describedby={notesError ? `admin-notes-error-${review.review_id}` : undefined}
          aria-invalid={notesError}
        />
        {notesError && (
          <p
            id={`admin-notes-error-${review.review_id}`}
            className="review-field-error"
            role="alert"
          >
            Please provide a reason for rejection.
          </p>
        )}
      </div>

      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Confirm Reject"
      >
        <div className="modal-form">
          <div className="delete-confirmation">
            <LuTriangleAlert size={32} className="warning-icon dashboard-info-icon" />
            <p>
              Are you sure you want to reject <strong>{review.nofo_name}</strong>?
            </p>
          </div>
          <p className="warning-text">
            This will permanently delete the NOFO file and all processed data. This action cannot be
            undone.
          </p>
          {adminNotes && (
            <div className="form-group" style={{ marginTop: "16px" }}>
              <label className="summary-field__label">Rejection reason:</label>
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "var(--mds-color-background)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  color: "var(--mds-color-text)",
                }}
              >
                {adminNotes}
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button
              className="modal-button secondary"
              onClick={() => setRejectModalOpen(false)}
              aria-label="Cancel reject"
            >
              Cancel
            </button>
            <button
              className="modal-button danger"
              onClick={confirmReject}
              aria-label="Reject and delete this NOFO"
            >
              Reject and Delete
            </button>
          </div>
        </div>
      </Modal>

      <ReviewActions
        actionInProgress={actionInProgress}
        hasCorrections={getCorrections() !== undefined}
        onApprove={handleApprove}
        onReject={handleRejectClick}
        onReprocess={handleReprocess}
        rejectDisabled={!adminNotes.trim()}
      />
    </div>
  );
};

export default ReviewExpandedRow;

import React, { useState, useEffect } from "react";
import { LuWrench, LuChevronUp } from "react-icons/lu";
import { ApiClient } from "../../../common/api-client/api-client";
import type {
  ReviewItem,
  ReviewDetail,
  ValidationIssue,
} from "../../../common/types/processing-review";
import ValidationIssueCard from "./ValidationIssueCard";
import SummaryEditor from "./SummaryEditor";
import ReviewActions from "./ReviewActions";

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
  const [editedSummary, setEditedSummary] = useState<Record<string, unknown> | null>(null);
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

  const handleReject = async () => {
    if (!adminNotes.trim()) {
      addNotification("error", "Please provide a reason for rejection");
      return;
    }
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
        <SummaryEditor
          editedSummary={editedSummary}
          onSummaryChange={setEditedSummary}
        />
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
        </label>
        <textarea
          id={`admin-notes-${review.review_id}`}
          className="review-admin-notes"
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Add notes about this review..."
          rows={2}
        />
      </div>

      <ReviewActions
        actionInProgress={actionInProgress}
        hasCorrections={getCorrections() !== undefined}
        onApprove={handleApprove}
        onReject={handleReject}
        onReprocess={handleReprocess}
      />
    </div>
  );
};

export default ReviewExpandedRow;

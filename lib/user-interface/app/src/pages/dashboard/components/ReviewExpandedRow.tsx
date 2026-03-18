import React, { useState, useEffect, useCallback } from "react";
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
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());

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

  const getIssueKey = useCallback(
    (issue: ValidationIssue) => `${issue.severity}|${issue.field}|${issue.category}|${issue.description}`,
    []
  );

  const extractQuotedText = (text: string): string | null => {
    const doubleQuote = text.match(/"([^"]+)"/);
    if (doubleQuote) return doubleQuote[1];
    const singleQuote = text.match(/'([^']+)'/);
    if (singleQuote) return singleQuote[1];
    return null;
  };

  const extractListedItems = (text: string): string[] => {
    const listPrefixes = /(?:such as|including|like|e\.g\.?|namely)\s+/i;
    const match = text.match(listPrefixes);
    if (!match || match.index === undefined) return [];
    const listPart = text.slice(match.index + match[0].length);
    return listPart
      .split(/,\s*(?:and\s+)?|,?\s+and\s+/)
      .map((s) => s.replace(/\.+$/, "").trim())
      .filter(Boolean);
  };

  const deriveItemName = (suggestedFix: string, description: string): string => {
    const colonMatch = suggestedFix.match(/^[^:]+:\s+([A-Z][^.]+)/);
    if (colonMatch) {
      const name = colonMatch[1].replace(/\s*\(.*\)\s*$/, "").trim();
      if (name.length > 5 && name.length < 80) return name;
    }

    const addMatch = suggestedFix.match(
      /^(?:add|include|insert)\s+(?:deadline\s+for\s+|the\s+|missing\s+)?(.+?)(?:\s+(?:given|since|because|due to|as stated|which|from|per)\b.*)?$/i
    );
    if (addMatch) {
      const name = addMatch[1].replace(/\s*\(.*\)\s*$/, "").trim();
      if (name.length > 2) return name.charAt(0).toUpperCase() + name.slice(1);
    }

    const missingMatch = description.match(
      /^Missing\s+(?:the\s+|a\s+)?(.+?)(?:\s+(?:which|that|mentioned|stated|guidance|requirement|from)\b.*)?$/i
    );
    if (missingMatch) {
      const name = missingMatch[1].replace(/\s*\(.*\)\s*$/, "").trim();
      if (name.length > 2) return name.charAt(0).toUpperCase() + name.slice(1);
    }

    const words = description.split(/\s+/).slice(0, 6).join(" ");
    return words.length < description.length ? `${words}...` : description;
  };

  const ARRAY_FIELDS = [
    "EligibilityCriteria",
    "RequiredDocuments",
    "ProjectNarrativeSections",
    "KeyDeadlines",
  ];

  const applySingleFix = (
    summary: Record<string, unknown>,
    issue: ValidationIssue
  ): { updated: Record<string, unknown>; applied: boolean } => {
    if (!issue.suggestedFix) return { updated: summary, applied: false };

    const fixLower = issue.suggestedFix.toLowerCase();
    const fieldMatch = issue.field.match(/^(\w+)\[(\d+)\]$/);

    if (fieldMatch) {
      const [, arrayName, indexStr] = fieldMatch;
      const index = parseInt(indexStr, 10);
      const arr = summary[arrayName] as SummaryField[] | undefined;
      if (!arr || !Array.isArray(arr) || !arr[index]) {
        return { updated: summary, applied: false };
      }

      if (issue.category === "hallucination" || fixLower.includes("remove")) {
        const updated = [...arr];
        updated[index] = { ...updated[index], removed: true };
        return { updated: { ...summary, [arrayName]: updated }, applied: true };
      }

      if (issue.category === "inaccuracy" || issue.category === "incomplete") {
        const quoted = extractQuotedText(issue.suggestedFix);
        const updated = [...arr];
        updated[index] = {
          ...updated[index],
          description: quoted || issue.suggestedFix,
        };
        return { updated: { ...summary, [arrayName]: updated }, applied: true };
      }
    }

    if (issue.field === "GrantName") {
      const quoted = extractQuotedText(issue.suggestedFix);
      if (quoted) {
        return { updated: { ...summary, GrantName: quoted }, applied: true };
      }
    }

    if (!fieldMatch) {
      const targetField = ARRAY_FIELDS.find(
        (f) => issue.field === f || issue.field.startsWith(f)
      );

      if (targetField) {
        const arr = (summary[targetField] as SummaryField[]) || [];
        const quoted = extractQuotedText(issue.suggestedFix);

        if (quoted) {
          const newItem: SummaryField = { item: quoted, description: issue.description };
          return {
            updated: { ...summary, [targetField]: [...arr, newItem] },
            applied: true,
          };
        }

        const listedItems = extractListedItems(issue.description);
        if (listedItems.length > 0) {
          const newItems = listedItems.map((name) => ({
            item: name,
            description: `Added from validation: ${issue.description}`,
          }));
          return {
            updated: { ...summary, [targetField]: [...arr, ...newItems] },
            applied: true,
          };
        }

        const itemName = deriveItemName(issue.suggestedFix, issue.description);
        const newItem: SummaryField = {
          item: itemName,
          description: issue.description,
        };
        return {
          updated: { ...summary, [targetField]: [...arr, newItem] },
          applied: true,
        };
      }

      if (typeof summary[issue.field] === "string") {
        const quoted = extractQuotedText(issue.suggestedFix);
        if (quoted) {
          return { updated: { ...summary, [issue.field]: quoted }, applied: true };
        }
      }
    }

    return { updated: summary, applied: false };
  };

  const handleApplyFix = (issue: ValidationIssue) => {
    if (!editedSummary) return;
    const key = getIssueKey(issue);
    if (appliedFixes.has(key)) return;

    const { updated, applied } = applySingleFix(editedSummary, issue);
    if (applied) {
      setEditedSummary(updated);
      setAppliedFixes((prev) => new Set(prev).add(key));
      addNotification("info", `Applied suggested fix for ${issue.field}`);
    } else {
      addNotification(
        "warning",
        `Could not auto-apply fix for ${issue.field}. Please edit the summary manually below.`
      );
    }
  };

  const handleApplyAllFixes = () => {
    if (!editedSummary || !detail?.validationResult?.issues) return;
    const fixableIssues = detail.validationResult.issues.filter(
      (i) => i.suggestedFix && !appliedFixes.has(getIssueKey(i))
    );
    if (fixableIssues.length === 0) {
      addNotification("info", "No automatic fixes available");
      return;
    }

    let current = editedSummary;
    let appliedCount = 0;
    const newApplied = new Set(appliedFixes);
    for (const issue of fixableIssues) {
      const { updated, applied } = applySingleFix(current, issue);
      if (applied) {
        current = updated;
        newApplied.add(getIssueKey(issue));
        appliedCount++;
      }
    }

    if (appliedCount > 0) {
      setEditedSummary(current);
      setAppliedFixes(newApplied);
      addNotification("info", `Applied ${appliedCount} of ${fixableIssues.length} suggested fixes`);
    } else {
      addNotification("info", "No fixes could be applied automatically");
    }
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
        <div>
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--mds-color-heading)" }}>
            Validation Issues ({issues.length})
          </h3>
          {appliedFixes.size > 0 && issues.length > 0 && (
            <p className="review-fix-progress" role="status" aria-live="polite">
              {appliedFixes.size} of {issues.length} issue{issues.length !== 1 ? "s" : ""} fixed
            </p>
          )}
        </div>
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
            <ValidationIssueCard key={`crit-${i}`} issue={issue} onApplyFix={handleApplyFix} isFixed={appliedFixes.has(getIssueKey(issue))} />
          ))}
          {warningIssues.map((issue, i) => (
            <ValidationIssueCard key={`warn-${i}`} issue={issue} onApplyFix={handleApplyFix} isFixed={appliedFixes.has(getIssueKey(issue))} />
          ))}
          {infoIssues.map((issue, i) => (
            <ValidationIssueCard key={`info-${i}`} issue={issue} onApplyFix={handleApplyFix} isFixed={appliedFixes.has(getIssueKey(issue))} />
          ))}
          {issues.length > 1 && (() => {
            const fixableIssues = issues.filter((i) => i.suggestedFix);
            const allFixesApplied = fixableIssues.length > 0 && fixableIssues.every((i) => appliedFixes.has(getIssueKey(i)));
            return (
              <button
                className="review-btn review-btn--apply-all"
                onClick={handleApplyAllFixes}
                disabled={allFixesApplied || fixableIssues.length === 0}
                aria-label={allFixesApplied ? "All fixes applied" : "Apply all suggested fixes"}
              >
                <LuWrench size={14} aria-hidden="true" />
                {allFixesApplied ? "All Fixes Applied" : "Apply All Fixes"}
              </button>
            );
          })()}
        </div>
      ) : (detail.errorMessage || review.source !== "pipeline") ? (
        <div className="review-dlq-alert" role="alert">
          {review.source === "dlq" && "This NOFO failed processing and was moved to the Dead Letter Queue."}
          {review.source === "duplicate" && "This NOFO was flagged as a duplicate of an existing document."}
          {review.source === "quality" && "This NOFO failed the source document quality check."}
          {review.source === "pipeline" && detail.errorMessage && "This NOFO encountered an error during processing."}
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

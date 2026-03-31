import React, { useState, useEffect, useCallback, useRef } from "react";
import { LuChevronUp, LuTriangleAlert } from "react-icons/lu";
import { ApiClient } from "../../../common/api-client/api-client";
import type {
  ReviewItem,
  ReviewDetail,
} from "../../../common/types/processing-review";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async () => {
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
  }, [apiClient, review.nofo_name, addNotification]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const getCorrections = (): Record<string, unknown> | undefined => {
    if (!editedSummary || !detail?.extractedSummary) return undefined;
    if (JSON.stringify(editedSummary) === JSON.stringify(detail.extractedSummary)) {
      return undefined;
    }

    const corrections: Record<string, unknown> = {};
    for (const key of Object.keys(editedSummary)) {
      const edited = editedSummary[key];
      if (Array.isArray(edited)) {
        type SummaryField = { removed?: boolean; [key: string]: unknown };
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
        adminNotes || undefined,
        review.review_id
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
      await apiClient.landingPage.rejectReview(review.nofo_name, adminNotes, review.review_id);
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

  const handleNeedsReupload = async () => {
    if (!adminNotes.trim()) {
      setNotesError(true);
      addNotification("error", "Please provide notes explaining why re-upload is needed");
      return;
    }
    setNotesError(false);
    setActionInProgress("needs_reupload");
    try {
      await apiClient.landingPage.markNeedsReupload(review.nofo_name, adminNotes, review.review_id);
      addNotification("info", `"${review.nofo_name}" marked as needs re-upload`);
      onActionComplete();
    } catch {
      addNotification("error", "Failed to mark review as needs re-upload");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReuploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["application/pdf", "text/plain"];
    if (!allowedTypes.includes(file.type)) {
      addNotification("error", "Only PDF or TXT files are supported");
      return;
    }

    setActionInProgress("reupload");
    try {
      const { signedUrl } = await apiClient.landingPage.getReuploadUrl(review.nofo_name, file.type);

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      addNotification("success", `New document uploaded for "${review.nofo_name}". The pipeline will reprocess it shortly.`);
      onActionComplete();
    } catch {
      addNotification("error", "Failed to upload replacement document");
    } finally {
      setActionInProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  const isResolved = review.status === "approved" || review.status === "rejected" || review.status === "superseded";

  return (
    <div
      className="review-expanded-row"
      role="region"
      aria-label={`Review details for ${review.nofo_name}`}
    >
      <div className="review-expanded-row__header">
        <div>
          <h3 className="review-expanded-row__title">
            Review Details
          </h3>
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

      {detail.adminGuidance && (
        <div
          className="review-dlq-alert"
          role="alert"
          style={{
            borderLeft: `4px solid ${detail.adminGuidance.severity === "critical" ? "var(--mds-color-danger)" : "var(--mds-color-warning)"}`,
          }}
        >
          <strong>{detail.adminGuidance.title}</strong>
          <p style={{ margin: "8px 0 0" }}>{detail.adminGuidance.message}</p>
          <div className="review-dlq-guidance">
            <strong>Recommended actions:</strong>
            <ol>
              {detail.adminGuidance.actions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ol>
          </div>
          {detail.adminGuidance.missingCategories.length > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--mds-color-text-secondary)" }}>
              Missing categories: {detail.adminGuidance.missingCategories.join(", ")}
            </p>
          )}
        </div>
      )}

      {review.status === "needs_reupload" && (
        <div className="review-dlq-alert" role="status" style={{ borderLeft: "4px solid var(--mds-color-warning)" }}>
          <strong>Awaiting Document Re-upload</strong>
          <p style={{ margin: "8px 0 0" }}>
            This NOFO has been marked as needing a new document upload. Upload a corrected document to trigger reprocessing.
          </p>
        </div>
      )}

      {(detail.errorMessage || review.source !== "pipeline") && !detail.adminGuidance && (
        <div className="review-dlq-alert" role="alert">
          {review.source === "dlq" && (
            <>
              <strong>Processing Failed (Dead Letter Queue)</strong>
              <p style={{ margin: "8px 0 0" }}>This NOFO failed processing and was moved to the Dead Letter Queue.</p>
              <div className="review-dlq-guidance">
                <strong>What to do:</strong>
                <ol>
                  <li>Check the error details below to identify the failure reason.</li>
                  <li>Reject this entry to clean up the failed attempt.</li>
                  <li>Re-upload the NOFO document using the same grant name in the dashboard.</li>
                </ol>
              </div>
            </>
          )}
          {review.source === "duplicate" && (
            <>
              <strong>Duplicate Document Detected</strong>
              <p style={{ margin: "8px 0 0" }}>This NOFO was flagged as a duplicate of an existing document already in the system.</p>
              <div className="review-dlq-guidance">
                <strong>What to do:</strong>
                <ol>
                  <li>Check if the existing version is already published and up to date.</li>
                  <li>If this is an updated version, reject this entry, then delete the old grant and re-upload the new document.</li>
                  <li>If this is truly a duplicate, reject this entry to remove it.</li>
                </ol>
              </div>
            </>
          )}
          {review.source === "quality" && (
            <>
              <strong>Source Document Quality Check Failed</strong>
              <p style={{ margin: "8px 0 0" }}>The uploaded file did not pass the quality check. This usually means the document is not a valid grant/NOFO, is corrupted, or contains mostly non-text content (e.g., scanned images without OCR).</p>
              <div className="review-dlq-guidance">
                <strong>What to do:</strong>
                <ol>
                  <li>Go to the original source (e.g., Grants.gov or the agency website) and download a clean copy of the NOFO document.</li>
                  <li>Make sure the file is a text-based PDF (not a scanned image). If the PDF is image-based, use an OCR tool to convert it first.</li>
                  <li>Reject this entry to clean it up.</li>
                  <li>Re-upload the corrected document using the <strong>exact same grant name</strong> so it replaces this failed attempt.</li>
                </ol>
              </div>
            </>
          )}
          {review.source === "pipeline" && detail.errorMessage && (
            <>
              <strong>Processing Error</strong>
              <p style={{ margin: "8px 0 0" }}>This NOFO encountered an error during pipeline processing.</p>
              <div className="review-dlq-guidance">
                <strong>What to do:</strong>
                <ol>
                  <li>Check the error details below to understand what went wrong.</li>
                  <li>If the error is transient (e.g., timeout, throttling), reject and re-upload the document to retry.</li>
                  <li>If the document itself is problematic, download a clean copy from the source and re-upload using the same grant name.</li>
                </ol>
              </div>
            </>
          )}
          {detail.errorMessage && (
            <div style={{ marginTop: "8px", fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {detail.errorMessage}
            </div>
          )}
        </div>
      )}

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

      {isResolved ? (
        <div style={{ marginBottom: "16px" }}>
          <label className="summary-field__label">
            Admin Notes
          </label>
          {adminNotes ? (
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
          ) : (
            <p style={{ fontSize: "13px", color: "var(--mds-color-text-secondary)", margin: 0 }}>
              No admin notes recorded.
            </p>
          )}
          {detail.reviewed_at && (
            <p style={{ fontSize: "12px", color: "var(--mds-color-text-secondary)", marginTop: "8px" }}>
              {review.status === "approved" ? "Approved" : "Rejected"} on{" "}
              {new Date(detail.reviewed_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
            </p>
          )}
        </div>
      ) : (
        <>
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

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            style={{ display: "none" }}
            onChange={handleFileSelected}
            aria-label="Select replacement NOFO file"
          />
          <ReviewActions
            actionInProgress={actionInProgress}
            hasCorrections={getCorrections() !== undefined}
            canApprove={detail.adminGuidance?.canApprove !== false}
            status={review.status}
            onApprove={handleApprove}
            onReject={handleRejectClick}
            onReprocess={handleReprocess}
            onReupload={handleReuploadClick}
            onNeedsReupload={handleNeedsReupload}
            rejectDisabled={!adminNotes.trim()}
          />
        </>
      )}
    </div>
  );
};

export default ReviewExpandedRow;

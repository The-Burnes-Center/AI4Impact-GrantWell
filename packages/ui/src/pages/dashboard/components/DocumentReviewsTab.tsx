import { useCallback, useEffect, useId, useState } from "react";
import { LuDownload } from "react-icons/lu";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { DocumentReview } from "../../../common/api-client/user-documents-client";
import { Modal } from "../../../components/common/Modal";
import { MAX_REVIEW_NOTE_CHARS } from "../../../common/helpers/user-documents";
import "../../../styles/document-manager.css";

type View = "pending" | "decided";
type Decision = { review: DocumentReview; decision: "approve" | "reject" };

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";

/** Users' "This is related" requests: approve to let the AI use the document for that grant, or reject. */
export default function DocumentReviewsTab({ apiClient }: { apiClient: ApiClient }) {
  const [view, setView] = useState<View>("pending");
  const [reviews, setReviews] = useState<DocumentReview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const headingId = useId();

  const load = useCallback(async () => {
    setReviews(null);
    setLoadError(null);
    try {
      setReviews(await apiClient.userDocuments.listDocumentReviews(view));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Document reviews couldn't be loaded.");
    }
  }, [apiClient, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (review: DocumentReview) => {
    setActionError(null);
    try {
      const url = await apiClient.userDocuments.openReviewedDocument(review);
      // A link click, not window.open: after the await a popup blocker would stop a new window.
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", review.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `${review.fileName} couldn't be opened.`);
    }
  };

  const decided = (review: DocumentReview) => {
    setReviews((prev) => (prev ?? []).filter((r) => !(r.userId === review.userId && r.key === review.key && r.grant === review.grant)));
    setStatus(`${review.fileName} ${review.status === "approved" ? "approved" : "rejected"} for ${review.grant}.`);
    setDeciding(null);
  };

  return (
    <section aria-labelledby={headingId}>
      <div className="gw-toggle doc-reviews-toggle" role="group" aria-label="Requests to show">
        {(["pending", "decided"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className="gw-toggle__option dm-target"
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {v === "pending" ? "Waiting for a decision" : "Decided"}
          </button>
        ))}
      </div>

      <h3 id={headingId} className="visually-hidden">
        {view === "pending" ? "Requests waiting for a decision" : "Decided requests"}
      </h3>
      <div role="status" aria-live="polite" className="visually-hidden">
        {reviews === null && !loadError ? "Loading document reviews" : status}
      </div>
      {actionError && (
        <p className="dm-error" role="alert">
          {actionError}
        </p>
      )}

      {loadError ? (
        <div className="dm-error" role="alert">
          <p style={{ margin: 0 }}>{loadError}</p>
          <button type="button" className="gw-btn gw-btn--secondary gw-btn--slim dm-target" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : reviews === null ? (
        <p>Loading document reviews...</p>
      ) : reviews.length === 0 ? (
        <p className="dm-library-empty">
          {view === "pending" ? "No requests are waiting for a decision." : "No requests have been decided yet."}
        </p>
      ) : (
        <ul className="doc-reviews-list" aria-labelledby={headingId}>
          {reviews.map((review) => (
            <li key={`${review.userId}|${review.key}|${review.grant}`} className="doc-review">
              <h4 className="doc-review__title">{review.fileName}</h4>
              <dl className="doc-review__facts">
                <div>
                  <dt>Grant</dt>
                  <dd>{review.grant}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{review.typeLabel || "Type not set"}</dd>
                </div>
                <div>
                  <dt>From</dt>
                  <dd>
                    {review.userEmail || "Unknown"}
                    {review.userState ? ` (${review.userState})` : ""}, {formatDate(review.requestedAt)}
                  </dd>
                </div>
                <div>
                  <dt>Check said</dt>
                  <dd>{review.reason || (review.verdict === "error" ? "The check couldn't run on this document." : "No reason given.")}</dd>
                </div>
                <div>
                  <dt>Their note</dt>
                  <dd>{review.note || "No note."}</dd>
                </div>
                {review.status !== "pending" && (
                  <div>
                    <dt>Decision</dt>
                    <dd>
                      {review.status === "approved" ? "Approved" : "Rejected"} {formatDate(review.decidedAt)}
                      {review.adminNote ? `: ${review.adminNote}` : ""}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="doc-review__actions">
                <button
                  type="button"
                  className="gw-btn gw-btn--secondary dm-target"
                  onClick={() => void open(review)}
                  aria-label={`Download ${review.fileName}`}
                >
                  <LuDownload size={16} aria-hidden="true" /> Download
                </button>
                {review.status === "pending" && (
                  <>
                    <button
                      type="button"
                      className="gw-btn gw-btn--secondary dm-target"
                      onClick={() => setDeciding({ review, decision: "reject" })}
                      aria-label={`Reject ${review.fileName} for ${review.grant}`}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="gw-btn gw-btn--primary dm-target"
                      onClick={() => setDeciding({ review, decision: "approve" })}
                      aria-label={`Approve ${review.fileName} for ${review.grant}`}
                    >
                      Approve
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <DecisionDialog
        deciding={deciding}
        onClose={() => setDeciding(null)}
        onDecide={async ({ review, decision }, note) => decided(await apiClient.userDocuments.decideDocumentReview(review, decision, note))}
      />
    </section>
  );
}

function DecisionDialog({
  deciding,
  onClose,
  onDecide,
}: {
  deciding: Decision | null;
  onClose: () => void;
  onDecide: (decision: Decision, note: string) => Promise<void>;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote("");
    setError(null);
  }, [deciding]);

  const approve = deciding?.decision === "approve";
  const submit = async () => {
    if (!deciding || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onDecide(deciding, note.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision couldn't be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={deciding !== null}
      onClose={onClose}
      title={approve ? "Approve this document?" : "Reject this request?"}
      describedBy={`${id}-intro`}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p id={`${id}-intro`} className="dm-confirm-message">
          {approve
            ? `The AI will use ${deciding?.review.fileName} when this person works on ${deciding?.review.grant}.`
            : `${deciding?.review.fileName} stays unused for ${deciding?.review.grant}. They will see your note.`}
        </p>
        <div className="gw-field">
          <label className="gw-field__label" htmlFor={`${id}-note`}>
            Note to the person (optional)
          </label>
          <textarea
            id={`${id}-note`}
            className="gw-input"
            value={note}
            maxLength={MAX_REVIEW_NOTE_CHARS}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
            onChange={(e) => setNote(e.target.value)}
          />
          <p id={`${id}-help`} className="gw-field__help">
            Up to {MAX_REVIEW_NOTE_CHARS} characters.
          </p>
          {error && (
            <p id={`${id}-error`} className="gw-field__message" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dm-confirm-actions">
          <button type="button" className="gw-btn gw-btn--secondary dm-target" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`gw-btn ${approve ? "gw-btn--primary" : "gw-btn--danger"} dm-target`}
            aria-disabled={saving || undefined}
          >
            {saving ? "Saving..." : approve ? "Approve" : "Reject"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

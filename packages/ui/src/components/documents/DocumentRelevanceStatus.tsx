import { useId, useState } from "react";
import { LuCircleCheck, LuInfo, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { Modal } from "../common/Modal";
import {
  MAX_REVIEW_NOTE_CHARS,
  relevanceMessage,
  type DocumentRelevance,
} from "../../common/helpers/user-documents";
import "../../styles/document-manager.css";

interface DocumentRelevanceStatusProps {
  fileName: string;
  relevance?: DocumentRelevance;
  checking?: boolean;
  /** id for the status text, so a checkbox can point aria-describedby at it. */
  id?: string;
  onRetry?: () => void;
  /** Rejects with a message for the user when the request isn't accepted. */
  onRequestReview?: (note: string) => Promise<void>;
}

const ICONS = { success: LuCircleCheck, warning: LuTriangleAlert, info: LuInfo };

/**
 * One document's standing for the current grant, under its row in a document list. Says nothing
 * for a related document. Changes are announced through RelevanceLiveRegion, not here.
 */
export default function DocumentRelevanceStatus({ fileName, relevance, checking, id, onRetry, onRequestReview }: DocumentRelevanceStatusProps) {
  const [asking, setAsking] = useState(false);
  const ownId = useId();
  const titleId = id ?? ownId;

  if (checking) {
    return (
      <div id={titleId} className="dm-relevance dm-relevance--info">
        <LuLoaderCircle size={16} className="dm-relevance__icon dm-relevance__spin" aria-hidden="true" />
        <span>Checking whether this relates to the grant...</span>
      </div>
    );
  }
  const message = relevanceMessage(relevance);
  if (!message) return null;
  const Icon = ICONS[message.tone];
  const actions = message.actions ?? [];

  return (
    <div className={`dm-relevance dm-relevance--${message.tone}`}>
      <Icon size={16} className="dm-relevance__icon" aria-hidden="true" />
      <div className="dm-relevance__body">
        {/* Takes focus after a request is sent, since the button that opened the dialog goes away. */}
        <p id={titleId} className="dm-relevance__title" tabIndex={-1}>
          {message.title}
          {message.detail && <span className="dm-relevance__detail">{message.detail}</span>}
        </p>
        {(actions.includes("retry") && onRetry) || (actions.includes("request-review") && onRequestReview) ? (
          <div className="dm-relevance__actions">
            {actions.includes("retry") && onRetry && (
              <button type="button" className="gw-btn gw-btn--secondary gw-btn--slim dm-target" onClick={onRetry} aria-label={`Check ${fileName} again`}>
                Try again
              </button>
            )}
            {actions.includes("request-review") && onRequestReview && (
              <button
                type="button"
                className="gw-btn gw-btn--secondary gw-btn--slim dm-target"
                onClick={() => setAsking(true)}
                aria-label={`${fileName} is related: ask an admin`}
              >
                This is related
              </button>
            )}
          </div>
        ) : null}
      </div>
      {onRequestReview && (
        <RelevanceReviewDialog
          isOpen={asking}
          fileName={fileName}
          onClose={() => setAsking(false)}
          onSend={async (note) => {
            await onRequestReview(note);
            setAsking(false);
            setTimeout(() => document.getElementById(titleId)?.focus(), 0);
          }}
        />
      )}
    </div>
  );
}

function RelevanceReviewDialog({
  isOpen,
  fileName,
  onClose,
  onSend,
}: {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onSend: (note: string) => Promise<void>;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(note.trim());
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your request couldn't be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ask an admin to review" describedBy={`${id}-intro`}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <p id={`${id}-intro`} className="dm-confirm-message">
          If <strong>{fileName}</strong> relates to applying for this grant, an admin can approve it. They will see your note and
          can open the document. Until then, the AI won&apos;t use it for this grant.
        </p>
        <div className="gw-field">
          <label className="gw-field__label" htmlFor={`${id}-note`}>
            How is it related? (optional)
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
          <button type="submit" className="gw-btn gw-btn--primary dm-target" aria-disabled={sending || undefined}>
            {sending ? "Sending..." : "Send request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The one polite region that announces relevance changes for a list of documents. */
export function RelevanceLiveRegion({ announcement }: { announcement: string }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );
}

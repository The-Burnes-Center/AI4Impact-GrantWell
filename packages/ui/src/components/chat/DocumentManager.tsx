import { useEffect, useId, useMemo, useState } from "react";
import { LuX } from "react-icons/lu";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import { useApiClient } from "../../hooks/use-api-client";
import { useDocumentLibrary } from "../../hooks/use-document-library";
import { legacySelection } from "../../common/helpers/user-documents";
import DocumentPicker from "../documents/DocumentPicker";
import "../../styles/document-manager.css";

interface DocumentManagerProps {
  isOpen: boolean;
  onClose: () => void;
  documentIdentifier: string | null;
  sessionId?: string;
  onFileCountChange?: (count: number) => void;
}

type Stored = { keys: string[] | null; exists: boolean };

/** Picks which library documents this chat's AI reads. */
export default function DocumentManager({
  isOpen,
  onClose,
  documentIdentifier,
  sessionId,
  onFileCountChange,
}: DocumentManagerProps) {
  const apiClient = useApiClient();
  const library = useDocumentLibrary();
  const [stored, setStored] = useState<Stored | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const modalRef = useFocusTrap<HTMLDivElement>({ isOpen, onEscape: onClose });
  const titleId = useId();

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    apiClient.sessions
      .getDocumentKeys(sessionId)
      .then(({ documentKeys, exists }) => {
        if (!cancelled) setStored({ keys: documentKeys, exists });
      })
      .catch((error) => {
        console.error("Error loading the chat's documents:", error);
        if (!cancelled) setStored({ keys: [], exists: false });
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, sessionId]);

  const selected = useMemo(() => {
    if (!stored || library.loading) return null;
    const present = new Set(library.documents.map((d) => d.key));
    // A chat saved before the library has no selection and keeps reading its grant's old folder.
    const keys = stored.keys ?? (stored.exists ? legacySelection(library.documents, library.userId ?? "", documentIdentifier) : []);
    return keys.filter((k) => present.has(k));
  }, [stored, library.loading, library.documents, library.userId, documentIdentifier]);

  useEffect(() => {
    if (selected) onFileCountChange?.(selected.length);
  }, [selected, onFileCountChange]);

  const change = async (keys: string[]) => {
    if (!sessionId) return;
    const previous = stored;
    setStored({ keys, exists: true });
    setSaveError(null);
    try {
      await apiClient.sessions.setDocumentKeys(sessionId, keys);
    } catch (error) {
      console.error("Error saving the chat's documents:", error);
      setStored(previous);
      setSaveError("Your choice couldn't be saved. Please try again.");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="gw-modal__overlay dm-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="gw-modal dm-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ position: "relative" }}
      >
        <div className="gw-modal__header dm-header">
          <h2 id={titleId} className="gw-modal__title dm-title">Supporting Documents</h2>
          <button className="gw-btn gw-btn--icon dm-close-btn" onClick={onClose} aria-label="Close supporting documents">
            <LuX size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="gw-modal__body dm-body">
          <DocumentPicker
            library={library}
            selected={selected}
            onChange={(keys) => void change(keys)}
            legend="Use in this chat"
            description="The AI reads the documents you tick when it answers in this chat. New uploads go to My Documents, where every chat and application can use them."
          />
          {saveError && <p className="dm-error" role="alert">{saveError}</p>}
        </div>

        <div className="gw-modal__footer dm-footer">
          <button className="gw-btn gw-btn--secondary dm-footer-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

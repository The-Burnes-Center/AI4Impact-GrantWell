import { useEffect, useMemo, useState } from "react";
import Modal from "../common/Modal";
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Supporting documents"
      maxWidth="700px"
      closeLabel="Close supporting documents"
      footer={
        <button type="button" className="gw-btn gw-btn--secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <DocumentPicker
        library={library}
        selected={selected}
        onChange={(keys) => void change(keys)}
        legend="Use in this chat"
        description="The AI reads the documents you tick when it answers in this chat. New uploads go to My documents, where every chat and application can use them."
      />
      {saveError && <p className="dm-error" role="alert">{saveError}</p>}
    </Modal>
  );
}

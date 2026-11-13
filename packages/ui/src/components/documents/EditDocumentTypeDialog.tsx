import { useEffect, useId, useState } from "react";
import { Modal } from "../common/Modal";
import DocumentTypeFields from "./DocumentTypeFields";
import type { DocumentTypeInput } from "../../common/api-client/user-documents-client";
import {
  documentTypeErrors,
  type DocumentType,
  type DocumentTypeChoice,
  type LibraryDocument,
} from "../../common/helpers/user-documents";

interface EditDocumentTypeDialogProps {
  /** The document being edited; null keeps the dialog closed. */
  doc: LibraryDocument | null;
  onClose: () => void;
  onSave: (doc: LibraryDocument, documentType: DocumentTypeInput) => Promise<void>;
}

export default function EditDocumentTypeDialog({ doc, onClose, onSave }: EditDocumentTypeDialogProps) {
  const id = useId();
  const [choice, setChoice] = useState<DocumentTypeChoice>({ type: "", description: "" });
  const [errors, setErrors] = useState<ReturnType<typeof documentTypeErrors>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    setChoice({ type: (doc.type ?? "") as DocumentType | "", description: doc.description ?? "" });
    setErrors({});
    setSaveError(null);
  }, [doc]);

  const save = async () => {
    if (!doc || saving) return;
    const found = documentTypeErrors(choice);
    setErrors(found);
    if (found.type || found.description) {
      document.getElementById(`${id}-${found.type ? "type" : "description"}`)?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const type = choice.type as DocumentType;
      await onSave(doc, type === "other" ? { type, description: choice.description.trim() } : { type });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The type couldn't be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={doc !== null} onClose={onClose} title="Document type" describedBy={`${id}-file`}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p id={`${id}-file`} className="dm-confirm-message">
          {doc?.name}
        </p>
        <DocumentTypeFields idPrefix={id} value={choice} errors={errors} onChange={setChoice} />
        {saveError && (
          <p className="dm-error" role="alert">
            {saveError}
          </p>
        )}
        <div className="dm-confirm-actions">
          <button type="button" className="gw-btn gw-btn--secondary dm-target" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="gw-btn gw-btn--primary dm-target" aria-disabled={saving || undefined}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import { LuDownload, LuFileText, LuTrash2 } from "react-icons/lu";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import PageHeader from "../../components/common/PageHeader";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import LibraryUpload from "../../components/documents/LibraryUpload";
import EditDocumentTypeDialog from "../../components/documents/EditDocumentTypeDialog";
import { useDocumentLibrary } from "../../hooks/use-document-library";
import { LIBRARY_FOLDER, documentTypeLabel, formatFileSize, type LibraryDocument } from "../../common/helpers/user-documents";
import "../../styles/dashboard.css";
import "../../styles/document-manager.css";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export default function DocumentsPage() {
  const library = useDocumentLibrary();
  const [toDelete, setToDelete] = useState<LibraryDocument | null>(null);
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const docs = [...library.documents].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await library.remove(toDelete.key);
      setStatus(`${toDelete.name} deleted.`);
    } catch {
      setError(`${toDelete.name} couldn't be deleted. Please try again.`);
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const download = async (doc: LibraryDocument) => {
    setError(null);
    try {
      await library.download(doc);
    } catch {
      setError(`${doc.name} couldn't be downloaded. Please try again.`);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <UnifiedNavigation />
      <div className="dashboard-container" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="dashboard-main-content">
          <PageHeader
            title="My documents"
            intro="Upload a document once and choose it in any chat or application. The AI reads only the documents you tick there."
          />

          <LibraryUpload library={library} />

          <div role="status" aria-live="polite" className="sr-only">
            {library.loading ? "Loading documents" : status}
          </div>
          {error && <p className="dm-error" role="alert">{error}</p>}

          <h2 id="your-documents" style={{ fontSize: 18, marginTop: 32 }}>Your documents ({docs.length})</h2>
          {library.loading ? (
            <p>Loading your documents...</p>
          ) : library.loadError ? (
            <p className="dm-error" role="alert">{library.loadError}</p>
          ) : docs.length === 0 ? (
            <p className="dm-library-empty">
              None yet. Documents you upload appear here, ready to tick in any chat or application.
            </p>
          ) : (
            <ul aria-labelledby="your-documents" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {docs.map((doc) => (
                <li key={doc.key} className="dm-file-item">
                  <LuFileText size={20} className="dm-file-icon" aria-hidden="true" />
                  <div className="dm-file-details">
                    <p className="dm-file-name">{doc.name}</p>
                    <p className="dm-file-size">
                      {documentTypeLabel(doc)} · {formatFileSize(doc.size)} · Uploaded {formatDate(doc.lastModified)}
                      {doc.folder && doc.folder !== LIBRARY_FOLDER ? ` · for ${doc.folder}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="gw-btn gw-btn--secondary gw-btn--slim dm-target dm-edit-type-btn"
                    onClick={() => setEditing(doc)}
                    aria-label={`${doc.type ? "Change type" : "Set type"} of ${doc.name}`}
                  >
                    {doc.type ? "Change type" : "Set type"}
                  </button>
                  <button
                    type="button"
                    className="gw-btn gw-btn--icon dm-download-btn"
                    onClick={() => void download(doc)}
                    aria-label={`Download ${doc.name}`}
                  >
                    <LuDownload size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="gw-btn gw-btn--icon dm-delete-btn"
                    onClick={() => setToDelete(doc)}
                    aria-label={`Delete ${doc.name}`}
                  >
                    <LuTrash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete document?"
        message={toDelete ? `Delete "${toDelete.name}"?` : ""}
        warning="This removes it from My documents and from every chat and application that uses it. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        confirming={deleting}
      />

      <EditDocumentTypeDialog
        doc={editing}
        onClose={() => setEditing(null)}
        onSave={async (doc, documentType) => {
          await library.setType(doc.key, documentType);
          setStatus(`Type of ${doc.name} saved.`);
          setEditing(null);
        }}
      />
    </div>
  );
}

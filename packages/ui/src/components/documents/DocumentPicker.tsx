import { useId, useMemo } from "react";
import { Link } from "react-router";
import { LuFileText } from "react-icons/lu";
import LibraryUpload from "./LibraryUpload";
import { LiveStatus } from "../common/LiveStatus";
import type { DocumentLibrary } from "../../hooks/use-document-library";
import {
  LIBRARY_FOLDER,
  formatFileSize,
  readingNotes,
  unreadableType,
} from "../../common/helpers/user-documents";
import "../../styles/document-manager.css";

interface DocumentPickerProps {
  library: DocumentLibrary;
  /** null while the stored selection loads. */
  selected: string[] | null;
  onChange: (keys: string[]) => void;
  /** Visible group label, e.g. "Use in this chat". */
  legend: string;
  description?: string;
}

/** Library documents with a checkbox each, plus an upload that adds to the library and ticks the file. */
export default function DocumentPicker({ library, selected, onChange, legend, description }: DocumentPickerProps) {
  const descriptionId = useId();
  const chosen = useMemo(() => new Set(selected ?? []), [selected]);
  const docs = useMemo(
    () => [...library.documents].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
    [library.documents]
  );
  const notes = useMemo(() => readingNotes(docs.filter((d) => chosen.has(d.key))), [docs, chosen]);
  const skippedCount = Object.keys(notes).length;

  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(docs.map((d) => d.key).filter((k) => next.has(k)));
  };

  const addUploaded = (keys: string[]) => {
    onChange([...new Set([...(selected ?? []), ...keys])]);
  };

  return (
    <div>
      <fieldset className="dm-picker" aria-describedby={description ? descriptionId : undefined}>
        <legend className="dm-picker-legend">{legend}</legend>
        {description && (
          <p id={descriptionId} className="dm-file-size" style={{ marginTop: 0 }}>
            {description}
          </p>
        )}

        {library.loading || selected === null ? (
          <LiveStatus>
            <p>Loading your documents...</p>
          </LiveStatus>
        ) : library.loadError ? (
          <p className="dm-error" role="alert">{library.loadError}</p>
        ) : docs.length === 0 ? (
          <p className="dm-empty-state">You have no documents yet. Upload one to use it here.</p>
        ) : (
          docs.map((doc, index) => {
            const note = chosen.has(doc.key) ? notes[doc.key] : unreadableType(doc);
            const noteId = `${descriptionId}-${index}`;
            return (
              <div key={doc.key} className="dm-picker-row">
                <input
                  type="checkbox"
                  className="dm-checkbox"
                  id={`pick-${noteId}`}
                  checked={chosen.has(doc.key)}
                  onChange={() => toggle(doc.key)}
                  aria-describedby={`${noteId}-meta${note ? ` ${noteId}-note` : ""}`}
                />
                <LuFileText size={20} className="dm-file-icon" aria-hidden="true" />
                <label htmlFor={`pick-${noteId}`}>
                  <span className="dm-file-name">{doc.name}</span>
                  <span id={`${noteId}-meta`} className="dm-file-size" style={{ display: "block" }}>
                    {formatFileSize(doc.size)}
                    {doc.folder && doc.folder !== LIBRARY_FOLDER ? ` · uploaded for ${doc.folder}` : ""}
                  </span>
                  {note && (
                    <span id={`${noteId}-note`} className="dm-note" style={{ display: "block" }}>
                      {note}
                    </span>
                  )}
                </label>
              </div>
            );
          })
        )}
      </fieldset>

      <div role="status" aria-live="polite" className="sr-only">
        {skippedCount > 0
          ? `${skippedCount} selected document${skippedCount === 1 ? "" : "s"} can't be read by the AI.`
          : ""}
      </div>

      <div className="dm-picker-actions">
        <LibraryUpload library={library} variant="button" onUploaded={addUploaded} />
        <Link to="/documents" className="dm-link">
          Manage My documents
        </Link>
      </div>
    </div>
  );
}

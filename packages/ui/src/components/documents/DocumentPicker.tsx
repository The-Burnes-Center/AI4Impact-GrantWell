import { useId, useMemo } from "react";
import { Link } from "react-router";
import { LuFileText } from "react-icons/lu";
import LibraryUpload from "./LibraryUpload";
import DocumentRelevanceStatus, { RelevanceLiveRegion } from "./DocumentRelevanceStatus";
import { LiveStatus } from "../common/LiveStatus";
import type { DocumentLibrary } from "../../hooks/use-document-library";
import { useDocumentRelevance } from "../../hooks/use-document-relevance";
import {
  LIBRARY_FOLDER,
  documentTypeLabel,
  formatFileSize,
  relevanceMessage,
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
  /** "list": a bordered list for a narrow panel, the box beside the name's first line. */
  variant?: "rows" | "list";
  /** Keeps the legend for screen readers only, where a heading or tab already names the group. */
  legendHidden?: boolean;
  /** The grant the selection is for; given, each ticked document shows whether it relates to it. */
  documentIdentifier?: string | null;
}

/** Library documents with a checkbox each, plus an upload that adds to the library and ticks the file. */
export default function DocumentPicker({
  library,
  selected,
  onChange,
  legend,
  description,
  variant = "rows",
  legendHidden = false,
  documentIdentifier,
}: DocumentPickerProps) {
  const descriptionId = useId();
  const chosen = useMemo(() => new Set(selected ?? []), [selected]);
  const docs = useMemo(
    () => [...library.documents].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
    [library.documents]
  );
  const names = useMemo(() => Object.fromEntries(docs.map((d) => [d.key, d.name])), [docs]);
  const relevance = useDocumentRelevance(documentIdentifier, documentIdentifier ? selected : null, names);
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
        <legend className={legendHidden ? "visually-hidden" : "dm-picker-legend"}>{legend}</legend>
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
        ) : variant === "list" ? (
          <ul className="dm-list">
            {docs.map((doc, index) => {
              const note = chosen.has(doc.key) ? notes[doc.key] : unreadableType(doc);
              const rowId = `${descriptionId}-l${index}`;
              const showRelevance = Boolean(documentIdentifier) && chosen.has(doc.key) && !note;
              const relevanceShown =
                showRelevance && (relevance.checking.has(doc.key) || relevanceMessage(relevance.statuses[doc.key]) !== null);
              return (
                <li key={doc.key} className="dm-list__item">
                  <label className="dm-list__row">
                    <input
                      type="checkbox"
                      className="dm-checkbox"
                      checked={chosen.has(doc.key)}
                      onChange={() => toggle(doc.key)}
                      aria-describedby={relevanceShown ? `${rowId}-relevance` : undefined}
                    />
                    <span className="dm-list__text">
                      <span className="dm-list__name">{doc.name}</span>
                      <span className="dm-list__meta">
                        {documentTypeLabel(doc)} · {formatFileSize(doc.size)}
                        {doc.folder && doc.folder !== LIBRARY_FOLDER ? ` · uploaded for ${doc.folder}` : ""}
                      </span>
                      {note && <span className="dm-note dm-list__note">{note}</span>}
                    </span>
                  </label>
                  {showRelevance && (
                    <div className="dm-list__relevance">
                      <DocumentRelevanceStatus
                        id={`${rowId}-relevance`}
                        fileName={doc.name}
                        relevance={relevance.statuses[doc.key]}
                        checking={relevance.checking.has(doc.key)}
                        onRetry={() => void relevance.retry(doc.key)}
                        onRequestReview={(text) => relevance.requestReview(doc.key, text)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          docs.map((doc, index) => {
            const note = chosen.has(doc.key) ? notes[doc.key] : unreadableType(doc);
            const noteId = `${descriptionId}-${index}`;
            const showRelevance = Boolean(documentIdentifier) && chosen.has(doc.key) && !note;
            const relevanceShown =
              showRelevance && (relevance.checking.has(doc.key) || relevanceMessage(relevance.statuses[doc.key]) !== null);
            return (
              <div key={doc.key} className="dm-picker-row">
                <input
                  type="checkbox"
                  className="dm-checkbox"
                  id={`pick-${noteId}`}
                  checked={chosen.has(doc.key)}
                  onChange={() => toggle(doc.key)}
                  aria-describedby={`${noteId}-meta${note ? ` ${noteId}-note` : ""}${relevanceShown ? ` ${noteId}-relevance` : ""}`}
                />
                <LuFileText size={20} className="dm-file-icon" aria-hidden="true" />
                <div className="dm-picker-row__main">
                  <label htmlFor={`pick-${noteId}`}>
                    <span className="dm-file-name">{doc.name}</span>
                    <span id={`${noteId}-meta`} className="dm-file-size" style={{ display: "block" }}>
                      {documentTypeLabel(doc)} · {formatFileSize(doc.size)}
                      {doc.folder && doc.folder !== LIBRARY_FOLDER ? ` · uploaded for ${doc.folder}` : ""}
                    </span>
                    {note && (
                      <span id={`${noteId}-note`} className="dm-note" style={{ display: "block" }}>
                        {note}
                      </span>
                    )}
                  </label>
                  {showRelevance && (
                    <DocumentRelevanceStatus
                      id={`${noteId}-relevance`}
                      fileName={doc.name}
                      relevance={relevance.statuses[doc.key]}
                      checking={relevance.checking.has(doc.key)}
                      onRetry={() => void relevance.retry(doc.key)}
                      onRequestReview={(text) => relevance.requestReview(doc.key, text)}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </fieldset>

      {documentIdentifier && <RelevanceLiveRegion announcement={relevance.announcement} />}
      <div role="status" aria-live="polite" className="sr-only">
        {skippedCount > 0
          ? `${skippedCount} selected document${skippedCount === 1 ? "" : "s"} can't be read by the AI.`
          : ""}
      </div>

      <div className="dm-picker-actions">
        <LibraryUpload
          library={library}
          variant="button"
          onUploaded={addUploaded}
          buttonLabel={variant === "list" ? "Upload" : undefined}
        />
        <Link to="/documents" className="dm-link">
          Manage My documents
        </Link>
      </div>
    </div>
  );
}

import React, { useId, useRef, useState } from "react";
import { LuUpload, LuFileText } from "react-icons/lu";
import { Modal } from "../common/Modal";
import DocumentTypeFields from "./DocumentTypeFields";
import type { DocumentLibrary } from "../../hooks/use-document-library";
import type { DocumentTypeInput } from "../../common/api-client/user-documents-client";
import {
  UPLOAD_EXTENSIONS,
  documentTypeErrors,
  type DocumentType,
  type DocumentTypeChoice,
} from "../../common/helpers/user-documents";

type TypeErrors = ReturnType<typeof documentTypeErrors>;
import "../../styles/document-manager.css";

interface LibraryUploadProps {
  library: DocumentLibrary;
  /** Keys of the files that reached the library. */
  onUploaded?: (keys: string[]) => void;
  /** "dropzone" for the library page, "button" beside a picker. */
  variant?: "dropzone" | "button";
  buttonLabel?: string;
}

const ACCEPT = UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",");

/** Uploads straight into the library, asking before a same-named file is replaced. */
export default function LibraryUpload({ library, onUploaded, variant = "dropzone", buttonLabel = "Upload new" }: LibraryUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<{ files: File[]; duplicates: File[] } | null>(null);
  const [typing, setTyping] = useState<{ files: File[]; choices: DocumentTypeChoice[]; errors: TypeErrors[] } | null>(null);
  const instructionsId = useId();
  const formId = useId();

  const askTypes = (files: File[]) => {
    setPending(null);
    if (files.length === 0) return;
    setTyping({ files, choices: files.map(() => ({ type: "", description: "" })), errors: files.map(() => ({})) });
  };

  const confirmTypes = () => {
    if (!typing) return;
    const errors = typing.choices.map(documentTypeErrors);
    const firstBad = errors.findIndex((e) => e.type || e.description);
    if (firstBad >= 0) {
      setTyping({ ...typing, errors });
      const field = errors[firstBad].type ? "type" : "description";
      requestAnimationFrame(() => document.getElementById(`${formId}-${firstBad}-${field}`)?.focus());
      return;
    }
    const types = new Map<File, DocumentTypeInput>(
      typing.files.map((file, i) => {
        const { type, description } = typing.choices[i];
        return [file, type === "other" ? { type, description: description.trim() } : { type: type as DocumentType }];
      })
    );
    setTyping(null);
    void send(typing.files, types);
  };

  const send = async (files: File[], types: Map<File, DocumentTypeInput>) => {
    setAnnouncement(`Uploading ${files.length} document${files.length === 1 ? "" : "s"}`);
    const { uploaded, failed } = await library.upload(files, types);
    if (failed.length > 0) setProblems((prev) => [...prev, ...failed.map((name) => `${name} couldn't be uploaded. Please try again.`)]);
    setAnnouncement(
      `${uploaded.length} document${uploaded.length === 1 ? "" : "s"} uploaded${failed.length ? `, ${failed.length} failed` : ""}.`
    );
    if (uploaded.length > 0) onUploaded?.(uploaded);
  };

  const take = (incoming: File[]) => {
    const plan = library.planUpload(incoming);
    setProblems(plan.rejected);
    if (plan.duplicates.length > 0) {
      setPending({ files: plan.accepted, duplicates: plan.duplicates });
      return;
    }
    askTypes(plan.accepted);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) take(Array.from(e.target.files));
    e.target.value = "";
  };

  const browse = () => inputRef.current?.click();
  const busy = library.uploading;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="dm-file-input"
        onChange={onInput}
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
      />

      {variant === "dropzone" ? (
        <div
          className={`dm-drop-zone${dragActive ? " dm-drag-active" : ""}`}
          role="presentation"
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files?.length) take(Array.from(e.dataTransfer.files));
          }}
        >
          <LuUpload size={24} className="dm-upload-icon" aria-hidden="true" />
          <p className="dm-drop-text">
            <strong>Drag files here</strong> <span className="dm-drop-text__or">or</span>
            <br />
            <span className="dm-browse-text" id={instructionsId}>
              PDF, Word, Excel, PowerPoint, text and more, up to 100 MB each
            </span>
          </p>
          <button type="button" className="gw-btn gw-btn--primary dm-upload-btn" onClick={() => !busy && browse()} aria-disabled={busy || undefined} aria-describedby={instructionsId}>
            {busy ? "Uploading..." : "Browse files"}
          </button>
        </div>
      ) : (
        <button type="button" className="gw-btn gw-btn--primary dm-upload-btn" onClick={() => !busy && browse()} aria-disabled={busy || undefined}>
          <LuUpload size={16} aria-hidden="true" /> {busy ? "Uploading..." : buttonLabel}
        </button>
      )}

      {busy && (
        <div
          className="dm-file-progress-bar"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={library.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ marginTop: 8 }}
        >
          <div className="dm-file-progress-fill" style={{ width: `${library.progress}%` }} />
        </div>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {problems.length > 0 && (
        <div className="dm-error" role="alert">
          {problems.map((p) => (
            <p key={p} style={{ margin: 0 }}>{p}</p>
          ))}
        </div>
      )}

      <Modal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.duplicates.length === 1 ? "File already in your documents" : "Files already in your documents"}
      >
        <p className="dm-confirm-message">
          {pending?.duplicates.length === 1 ? "A file with this name is" : "Files with these names are"} already in My documents.
          Replace {pending?.duplicates.length === 1 ? "it" : "them"}, or skip and upload the rest?
        </p>
        <ul className="dm-duplicate-list">
          {pending?.duplicates.map((file) => (
            <li key={file.name} className="dm-duplicate-item">
              <LuFileText size={14} aria-hidden="true" />
              {file.name}
            </li>
          ))}
        </ul>
        <div className="dm-confirm-actions">
          <button type="button" className="gw-btn gw-btn--secondary dm-confirm-cancel-btn" onClick={() => setPending(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="gw-btn gw-btn--secondary dm-confirm-cancel-btn"
            onClick={() => {
              const dupes = new Set(pending?.duplicates.map((f) => f.name));
              askTypes((pending?.files ?? []).filter((f) => !dupes.has(f.name)));
            }}
          >
            Skip duplicates
          </button>
          <button type="button" className="gw-btn gw-btn--primary dm-confirm-replace-btn" onClick={() => askTypes(pending?.files ?? [])}>
            Replace
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={typing !== null}
        onClose={() => setTyping(null)}
        title={typing?.files.length === 1 ? "What kind of document is this?" : "What kind of documents are these?"}
        describedBy={`${formId}-intro`}
        maxWidth="560px"
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            confirmTypes();
          }}
        >
          <p id={`${formId}-intro`} className="dm-confirm-message">
            The type helps the AI use {typing?.files.length === 1 ? "it" : "each one"} well. You can change it later in My documents.
          </p>
          {typing?.files.map((file, i) => (
            <fieldset key={`${file.name}-${i}`} className="dm-type-fieldset">
              <legend className="dm-type-legend">{file.name}</legend>
              <DocumentTypeFields
                idPrefix={`${formId}-${i}`}
                value={typing.choices[i]}
                errors={typing.errors[i]}
                onChange={(choice) =>
                  setTyping((prev) => (prev ? { ...prev, choices: prev.choices.map((c, j) => (j === i ? choice : c)) } : prev))
                }
              />
            </fieldset>
          ))}
          <div className="dm-confirm-actions">
            <button type="button" className="gw-btn gw-btn--secondary dm-target" onClick={() => setTyping(null)}>
              Cancel
            </button>
            <button type="submit" className="gw-btn gw-btn--primary dm-target">
              Upload
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

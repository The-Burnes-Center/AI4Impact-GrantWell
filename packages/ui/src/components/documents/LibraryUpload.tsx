import React, { useId, useRef, useState } from "react";
import { LuUpload, LuFileText } from "react-icons/lu";
import { Modal } from "../common/Modal";
import type { DocumentLibrary } from "../../hooks/use-document-library";
import { UPLOAD_EXTENSIONS } from "../../common/helpers/user-documents";
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
  const instructionsId = useId();

  const send = async (files: File[]) => {
    setPending(null);
    if (files.length === 0) return;
    setAnnouncement(`Uploading ${files.length} document${files.length === 1 ? "" : "s"}`);
    const { uploaded, failed } = await library.upload(files);
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
    void send(plan.accepted);
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
          <LuUpload size={40} className="dm-upload-icon" aria-hidden="true" />
          <p className="dm-drop-text">Drag and drop files here, or</p>
          <button type="button" className="gw-btn gw-btn--primary dm-upload-btn" onClick={browse} disabled={busy} aria-describedby={instructionsId}>
            <LuUpload size={16} aria-hidden="true" /> {busy ? "Uploading..." : "Browse files"}
          </button>
          <p className="dm-browse-text" id={instructionsId}>
            PDF, Word, Excel, PowerPoint, text and more, up to 100 MB each
          </p>
        </div>
      ) : (
        <button type="button" className="gw-btn gw-btn--primary dm-upload-btn" onClick={browse} disabled={busy}>
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
              void send((pending?.files ?? []).filter((f) => !dupes.has(f.name)));
            }}
          >
            Skip duplicates
          </button>
          <button type="button" className="gw-btn gw-btn--primary dm-confirm-replace-btn" onClick={() => void send(pending?.files ?? [])}>
            Replace
          </button>
        </div>
      </Modal>
    </div>
  );
}

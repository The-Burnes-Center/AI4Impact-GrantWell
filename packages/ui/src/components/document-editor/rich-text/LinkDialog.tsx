import React, { useEffect, useId, useRef, useState } from "react";
import Modal from "../../common/Modal";
import { isAllowedLinkUrl } from "./editor-extensions";

export interface LinkDialogValues {
  text: string;
  url: string;
}

interface LinkDialogProps {
  isOpen: boolean;
  editing: boolean;
  initial: LinkDialogValues;
  onSave: (values: LinkDialogValues) => void;
  onRemove: () => void;
  onClose: () => void;
}

export const LINK_URL_ERROR = "Enter a link that starts with https://, http:// or mailto:";
export const LINK_URL_MISSING = "Enter the link address.";

const LinkDialog: React.FC<LinkDialogProps> = ({ isOpen, editing, initial, onSave, onRemove, onClose }) => {
  const [text, setText] = useState(initial.text);
  const [url, setUrl] = useState(initial.url);
  const [error, setError] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const textId = useId();
  const urlId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setText(initial.text);
    setUrl(initial.url);
    setError("");
  }, [isOpen, initial.text, initial.url]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const address = url.trim();
    const problem = !address ? LINK_URL_MISSING : isAllowedLinkUrl(address) ? "" : LINK_URL_ERROR;
    setError(problem);
    if (problem) {
      urlRef.current?.focus();
      return;
    }
    onSave({ text: text.trim() || address, url: address });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? "Edit link" : "Add link"}
      initialFocusRef={initial.text ? urlRef : textRef}
    >
      <form className="modal-form se-link-form" onSubmit={submit} noValidate>
        <div className="gw-field">
          <label htmlFor={textId} className="gw-field__label">
            Text
          </label>
          <input
            ref={textRef}
            id={textId}
            type="text"
            className="gw-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="gw-field">
          <label htmlFor={urlId} className="gw-field__label">
            URL
          </label>
          <span id={hintId} className="gw-field__help">
            Starts with https://, http:// or mailto:
          </span>
          {error && (
            <span id={errorId} className="gw-field__message">
              {error}
            </span>
          )}
          <input
            ref={urlRef}
            id={urlId}
            type="url"
            inputMode="url"
            autoComplete="url"
            className="gw-input"
            value={url}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          {editing && (
            <button type="button" className="gw-btn gw-btn--secondary modal-button secondary" onClick={onRemove}>
              Remove link
            </button>
          )}
          <button type="button" className="gw-btn gw-btn--secondary modal-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="gw-btn gw-btn--primary modal-button primary">
            Save link
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default LinkDialog;

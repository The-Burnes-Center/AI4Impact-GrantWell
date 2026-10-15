import React, { useEffect, useId, useRef, useState } from "react";
import { LuPlus } from "react-icons/lu";

interface AddSectionFormProps {
  onAdd: (name: string) => void;
  disabled?: boolean;
  /** Show the name field straight away instead of behind an "Add section" button. */
  startOpen?: boolean;
}

const AddSectionForm: React.FC<AddSectionFormProps> = ({ onAdd, disabled, startOpen }) => {
  const [open, setOpen] = useState(!!startOpen);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (open && !startOpen) inputRef.current?.focus();
  }, [open, startOpen]);

  const close = () => {
    setName("");
    setOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || disabled) return;
    onAdd(trimmed);
    setName("");
    if (!startOpen) setOpen(false);
  };

  if (!open) {
    return (
      <button
        ref={toggleRef}
        type="button"
        className="se-add-section__toggle"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <LuPlus size={16} aria-hidden="true" />
        Add section
      </button>
    );
  }

  return (
    <form className="se-add-section" onSubmit={submit}>
      <label htmlFor={inputId} className="se-add-section__label">
        Section name
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        className="se-add-section__input"
        value={name}
        maxLength={200}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !startOpen) close();
        }}
        disabled={disabled}
      />
      <div className="se-add-section__actions">
        <button type="submit" className="se-add-section__submit" disabled={disabled || !name.trim()}>
          Add section
        </button>
        {!startOpen && (
          <button type="button" className="se-add-section__cancel" onClick={close}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default AddSectionForm;

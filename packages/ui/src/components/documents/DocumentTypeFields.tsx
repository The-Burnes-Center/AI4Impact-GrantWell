import {
  DOCUMENT_TYPES,
  MAX_TYPE_DESCRIPTION_CHARS,
  type DocumentType,
  type DocumentTypeChoice,
} from "../../common/helpers/user-documents";

interface DocumentTypeFieldsProps {
  /** Unique per form, for the field ids. */
  idPrefix: string;
  value: DocumentTypeChoice;
  onChange: (value: DocumentTypeChoice) => void;
  errors?: { type?: string; description?: string };
  /** Visible label of the select; names the file when a form has several. */
  label?: string;
}

/** The document type select, plus a short description when the type is Other. */
export default function DocumentTypeFields({ idPrefix, value, onChange, errors = {}, label = "Document type" }: DocumentTypeFieldsProps) {
  const typeId = `${idPrefix}-type`;
  const descriptionId = `${idPrefix}-description`;
  return (
    <>
      <div className="gw-field">
        <label className="gw-field__label" htmlFor={typeId}>
          {label} <span className="gw-field__required" aria-hidden="true">*</span>
        </label>
        <select
          id={typeId}
          className="gw-input dm-type-select"
          value={value.type}
          required
          aria-invalid={errors.type ? true : undefined}
          aria-describedby={errors.type ? `${typeId}-error` : undefined}
          onChange={(e) => onChange({ ...value, type: e.target.value as DocumentType | "" })}
        >
          <option value="">Choose a type</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {errors.type && (
          <p id={`${typeId}-error`} className="gw-field__message">
            {errors.type}
          </p>
        )}
      </div>

      {value.type === "other" && (
        <div className="gw-field">
          <label className="gw-field__label" htmlFor={descriptionId}>
            What is it? <span className="gw-field__required" aria-hidden="true">*</span>
          </label>
          <input
            id={descriptionId}
            className="gw-input"
            type="text"
            value={value.description}
            required
            maxLength={MAX_TYPE_DESCRIPTION_CHARS}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={`${descriptionId}-help${errors.description ? ` ${descriptionId}-error` : ""}`}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
          />
          <p id={`${descriptionId}-help`} className="gw-field__help">
            A few words, for example &ldquo;Board meeting minutes&rdquo;. Up to {MAX_TYPE_DESCRIPTION_CHARS} characters.
          </p>
          {errors.description && (
            <p id={`${descriptionId}-error`} className="gw-field__message">
              {errors.description}
            </p>
          )}
        </div>
      )}
    </>
  );
}

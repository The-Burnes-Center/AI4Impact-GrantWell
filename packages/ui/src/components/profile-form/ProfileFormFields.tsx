import type { ProfileForm } from "../../common/instance";
import { PROFILE_FIELD_MAX_LENGTH } from "../../common/api-client/user-profile-client";
import { SearchMultiSelect, SearchSelect } from "./SearchCombobox";
import { type AnswerField, type Answers, fieldId, toggleLocation, typeOf, withType } from "./profile-form-logic";
import "./profile-form.css";

interface Props {
  form: ProfileForm;
  value: Answers;
  onChange: (next: Answers) => void;
  /** Prefixes every field id, so the gate and the profile page can't collide. */
  idPrefix: string;
  /** Shown under each field, and marks it invalid. */
  errors: Partial<Record<AnswerField, string>>;
}

function Required() {
  return (
    <span className="gw-field__required" aria-hidden="true">
      *
    </span>
  );
}

function ErrorText({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="gw-field__message">
      {text}
    </p>
  ) : null;
}

/** Applicant type, then the organization question that type asks, role, and locations. */
export default function ProfileFormFields({ form, value, onChange, idPrefix, errors }: Props) {
  const type = typeOf(form, value.applicantType);
  const id = (f: AnswerField) => fieldId(idPrefix, f);
  const errId = (f: AnswerField) => `${id(f)}-error`;
  const describe = (f: AnswerField, ...more: string[]) => [...more, errors[f] && errId(f)].filter(Boolean).join(" ") || undefined;
  const entities = form.entities;
  const locations = form.locations;

  return (
    <div className="gw-profile-form">
      <div className="gw-field">
        <label className="gw-field__label" htmlFor={id("applicantType")}>
          Applicant type
          <Required />
        </label>
        <select
          id={id("applicantType")}
          className="gw-input"
          aria-required="true"
          aria-invalid={Boolean(errors.applicantType) || undefined}
          aria-describedby={describe("applicantType")}
          value={value.applicantType}
          onChange={(e) => onChange(withType(form, value, e.target.value))}
        >
          <option value="">Select an applicant type</option>
          {form.applicantTypes.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <ErrorText id={errId("applicantType")} text={errors.applicantType} />
      </div>

      {type?.organization === "entity" && entities && (
        <div className="gw-field">
          <label className="gw-field__label" htmlFor={id("organization")}>
            {entities.label}
            <Required />
          </label>
          <p id={`${id("organization")}-hint`} className="gw-field__help">
            Type to search, then choose from the list.
          </p>
          <SearchSelect
            id={id("organization")}
            options={entities.choices}
            value={value.organization}
            onChange={(organization) => onChange({ ...value, organization })}
            listLabel={entities.label}
            placeholder={`Search ${entities.label.toLowerCase()}`}
            describedBy={describe("organization", `${id("organization")}-hint`)}
            invalid={Boolean(errors.organization)}
            required
          />
          <ErrorText id={errId("organization")} text={errors.organization} />
        </div>
      )}

      {type?.organization === "name" && (
        <div className="gw-field">
          <label className="gw-field__label" htmlFor={id("organization")}>
            Organization name
            <Required />
          </label>
          <input
            id={id("organization")}
            type="text"
            className="gw-input"
            autoComplete="organization"
            aria-required="true"
            aria-invalid={Boolean(errors.organization) || undefined}
            aria-describedby={describe("organization")}
            maxLength={PROFILE_FIELD_MAX_LENGTH}
            value={value.organization}
            onChange={(e) => onChange({ ...value, organization: e.target.value })}
          />
          <ErrorText id={errId("organization")} text={errors.organization} />
        </div>
      )}

      <div className="gw-field">
        <label className="gw-field__label" htmlFor={id("jobTitle")}>
          Your role
          <Required />
        </label>
        <input
          id={id("jobTitle")}
          type="text"
          className="gw-input"
          autoComplete="organization-title"
          aria-required="true"
          aria-invalid={Boolean(errors.jobTitle) || undefined}
          aria-describedby={describe("jobTitle")}
          maxLength={PROFILE_FIELD_MAX_LENGTH}
          placeholder="e.g. Grants Manager"
          value={value.jobTitle}
          onChange={(e) => onChange({ ...value, jobTitle: e.target.value })}
        />
        <ErrorText id={errId("jobTitle")} text={errors.jobTitle} />
      </div>

      {type?.location && locations && (
        <div className="gw-field">
          <label className="gw-field__label" htmlFor={id("locations")}>
            {locations.label}
            <Required />
          </label>
          <p id={`${id("locations")}-hint`} className="gw-field__help">
            Choose every {locations.label.toLowerCase()} you serve, or {locations.all}.
          </p>
          <SearchMultiSelect
            id={id("locations")}
            options={[locations.all, ...locations.choices]}
            selected={value.locations}
            onToggle={(name) => {
              const { locations: next, message } = toggleLocation(form, value.locations, name);
              onChange({ ...value, locations: next });
              return message;
            }}
            listLabel={`${locations.label} choices`}
            chipsLabel={`Selected: ${locations.label.toLowerCase()}`}
            placeholder={`Search ${locations.label.toLowerCase()}`}
            describedBy={describe("locations", `${id("locations")}-hint`)}
            invalid={Boolean(errors.locations)}
            required
          />
          <ErrorText id={errId("locations")} text={errors.locations} />
        </div>
      )}
    </div>
  );
}

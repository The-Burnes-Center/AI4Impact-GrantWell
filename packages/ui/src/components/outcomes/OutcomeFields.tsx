import {
  OUTCOME_FIELDS,
  OUTCOME_LABELS,
  OUTCOME_STATUSES,
  todayIso,
  type OutcomeDraft,
  type OutcomeStatus,
} from "../../common/application-outcomes";

interface OutcomeFieldsProps {
  /** Unique per form on the page, so several applications can sit in one dialog. */
  idPrefix: string;
  value: OutcomeDraft;
  onChange: (next: OutcomeDraft) => void;
  disabled?: boolean;
  /** "Not answered yet" stays selectable, for the reminder where an application may be skipped. */
  allowBlank?: boolean;
}

/** The outcome and the dates or amount that outcome needs. */
export default function OutcomeFields({ idPrefix, value, onChange, disabled, allowBlank }: OutcomeFieldsProps) {
  const needed = value.status ? OUTCOME_FIELDS[value.status] : [];
  const set = (patch: Partial<OutcomeDraft>) => onChange({ ...value, ...patch });
  const today = todayIso();

  return (
    <>
      <div className="form-group">
        <label htmlFor={`${idPrefix}-status`}>Outcome</label>
        <select
          id={`${idPrefix}-status`}
          className="form-input"
          value={value.status}
          onChange={(e) => set({ status: e.target.value as OutcomeStatus | "" })}
          disabled={disabled}
        >
          <option value="" disabled={!allowBlank}>
            {allowBlank ? "Not answered yet" : "Choose an outcome"}
          </option>
          {OUTCOME_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OUTCOME_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {needed.includes("submittedDate") && (
        <div className="form-group">
          <label htmlFor={`${idPrefix}-submitted`}>Date submitted</label>
          <input
            id={`${idPrefix}-submitted`}
            type="date"
            className="form-input"
            value={value.submittedDate}
            max={today}
            onChange={(e) => set({ submittedDate: e.target.value })}
            disabled={disabled}
            required
          />
        </div>
      )}
      {needed.includes("decisionDate") && (
        <div className="form-group">
          <label htmlFor={`${idPrefix}-decision`}>Decision date</label>
          <input
            id={`${idPrefix}-decision`}
            type="date"
            className="form-input"
            value={value.decisionDate}
            max={today}
            onChange={(e) => set({ decisionDate: e.target.value })}
            disabled={disabled}
            required
          />
        </div>
      )}
      {needed.includes("amountAwarded") && (
        <div className="form-group">
          <label htmlFor={`${idPrefix}-amount`}>Amount awarded (whole dollars)</label>
          <input
            id={`${idPrefix}-amount`}
            type="text"
            inputMode="numeric"
            className="form-input"
            value={value.amountAwarded}
            placeholder="e.g. 25000"
            onChange={(e) => set({ amountAwarded: e.target.value })}
            disabled={disabled}
            required
          />
        </div>
      )}
    </>
  );
}

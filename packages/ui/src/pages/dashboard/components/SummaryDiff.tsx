import React from "react";

interface SummaryField {
  item: string;
  description: string;
  confidence?: string;
  removed?: boolean;
}

interface SummaryDiffProps {
  original: Record<string, unknown>;
  edited: Record<string, unknown>;
  headingLevel?: 3 | 4;
}

const ARRAY_FIELDS = [
  { key: "EligibilityCriteria", label: "Eligibility Criteria" },
  { key: "RequiredDocuments", label: "Required Documents" },
  { key: "ProjectNarrativeSections", label: "Project Narrative Sections" },
  { key: "KeyDeadlines", label: "Key Deadlines" },
] as const;

const SummaryDiff: React.FC<SummaryDiffProps> = ({ original, edited, headingLevel = 3 }) => {
  const Heading = `h${headingLevel}` as const;
  const FieldHeading = `h${headingLevel + 1}` as "h4" | "h5";
  const renderScalarDiff = (label: string, fieldName: string) => {
    const orig = original[fieldName];
    const edit = edited[fieldName];
    const origStr = String(orig ?? "");
    const editStr = String(edit ?? "");
    if (origStr === editStr) {
      return (
        <div key={fieldName} className="diff-field">
          <FieldHeading className="summary-field__label">{label}</FieldHeading>
          <div className="diff-unchanged">{editStr || "(empty)"}</div>
        </div>
      );
    }
    return (
      <div key={fieldName} className="diff-field diff-field--changed">
        <FieldHeading className="summary-field__label">{label}</FieldHeading>
        {origStr && (
          <div className="diff-removed">
            <span className="visually-hidden">Removed: </span>
            {origStr}
          </div>
        )}
        <div className="diff-added">
          <span className="visually-hidden">Added: </span>
          {editStr || "(empty)"}
        </div>
      </div>
    );
  };

  const renderArrayDiff = (label: string, fieldName: string) => {
    const origArr = (original[fieldName] as SummaryField[] | undefined) ?? [];
    const editArr = (edited[fieldName] as SummaryField[] | undefined) ?? [];
    const origActive = origArr.filter((i) => !i.removed);
    const editActive = editArr.filter((i) => !i.removed);

    const origKeys = new Set(origActive.map((i) => `${i.item}|${i.description}`));
    const editKeys = new Set(editActive.map((i) => `${i.item}|${i.description}`));

    const removed = origActive.filter((o) => !editKeys.has(`${o.item}|${o.description}`));
    const added = editActive.filter((e) => !origKeys.has(`${e.item}|${e.description}`));
    const unchanged = editActive.filter((e) => origKeys.has(`${e.item}|${e.description}`));

    const hasChanges = removed.length > 0 || added.length > 0;

    return (
      <div
        key={fieldName}
        className={`diff-field ${hasChanges ? "diff-field--changed" : ""}`}
      >
        <FieldHeading className="summary-field__label">{label}</FieldHeading>
        {removed.map((item, idx) => (
          <div key={`rem-${idx}`} className="diff-removed">
            <span aria-hidden="true">−&nbsp;</span>
            <span className="visually-hidden">Removed: </span>
            <strong>{item.item}</strong>: {item.description}
          </div>
        ))}
        {added.map((item, idx) => (
          <div key={`add-${idx}`} className="diff-added">
            <span aria-hidden="true">+&nbsp;</span>
            <span className="visually-hidden">Added: </span>
            <strong>{item.item}</strong>: {item.description}
          </div>
        ))}
        {unchanged.map((item, idx) => (
          <div key={`unch-${idx}`} className="diff-unchanged">
            <strong>{item.item}</strong>: {item.description}
          </div>
        ))}
        {removed.length === 0 && added.length === 0 && unchanged.length === 0 && (
          <div className="diff-unchanged">(none)</div>
        )}
      </div>
    );
  };

  return (
    <div className="review-summary-card">
      <Heading
        style={{
          margin: "0 0 12px 0",
          fontSize: "14px",
          color: "var(--gw-color-heading)",
        }}
      >
        Requirements Changes
      </Heading>
      {renderScalarDiff("Grant Name", "GrantName")}
      {renderScalarDiff("Agency", "Agency")}
      {renderScalarDiff("Category", "Category")}
      {ARRAY_FIELDS.map(({ key, label }) => renderArrayDiff(label, key))}
    </div>
  );
};

export default SummaryDiff;

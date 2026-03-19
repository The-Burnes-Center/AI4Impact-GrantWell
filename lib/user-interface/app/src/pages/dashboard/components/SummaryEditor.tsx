import React from "react";
import { GRANT_CATEGORIES } from "../../../common/types/nofo";

interface SummaryField {
  item: string;
  description: string;
  confidence?: string;
  removed?: boolean;
}

interface SummaryEditorProps {
  editedSummary: Record<string, unknown>;
  onSummaryChange: (updated: Record<string, unknown>) => void;
}

const SummaryEditor: React.FC<SummaryEditorProps> = ({
  editedSummary,
  onSummaryChange,
}) => {
  const handleAddItem = (fieldName: string) => {
    const items = (editedSummary[fieldName] as SummaryField[] | undefined) || [];
    const newItem: SummaryField = { item: "", description: "", confidence: "medium" };
    onSummaryChange({ ...editedSummary, [fieldName]: [...items, newItem] });
  };

  const handleItemEdit = (fieldName: string, idx: number, field: "item" | "description", value: string) => {
    const items = [...((editedSummary[fieldName] as SummaryField[]) || [])];
    items[idx] = { ...items[idx], [field]: value };
    onSummaryChange({ ...editedSummary, [fieldName]: items });
  };

  const renderField = (label: string, fieldName: string) => {
    const items = (editedSummary[fieldName] as SummaryField[] | undefined) || [];

    return (
      <div className="summary-field">
        <div className="summary-field__label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{label} ({items.filter((i) => !i.removed).length})</span>
          <button
            type="button"
            className="review-add-item-btn"
            onClick={() => handleAddItem(fieldName)}
            style={{
              fontSize: "12px",
              padding: "2px 8px",
              cursor: "pointer",
              border: "1px solid var(--mds-color-border)",
              borderRadius: "4px",
              background: "var(--mds-color-surface)",
              color: "var(--mds-color-text-primary)",
            }}
          >
            + Add Item
          </button>
        </div>
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`summary-field__item ${item.removed ? "summary-field__item--removed" : ""}`}
          >
            <input
              type="checkbox"
              className="review-checkbox"
              checked={!item.removed}
              onChange={() => {
                const updated = [...items];
                updated[idx] = { ...updated[idx], removed: !updated[idx].removed };
                onSummaryChange({ ...editedSummary, [fieldName]: updated });
              }}
              aria-label={`${item.removed ? "Include" : "Exclude"} ${item.item}`}
            />
            {!item.item && !item.description ? (
              <span className="summary-field__text" style={{ display: "flex", gap: "8px", flex: 1 }}>
                <input
                  type="text"
                  className="review-text-input"
                  placeholder="Item name"
                  value={item.item}
                  onChange={(e) => handleItemEdit(fieldName, idx, "item", e.target.value)}
                  style={{ flex: "0 0 30%", fontSize: "12px", padding: "4px 6px" }}
                />
                <input
                  type="text"
                  className="review-text-input"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => handleItemEdit(fieldName, idx, "description", e.target.value)}
                  style={{ flex: 1, fontSize: "12px", padding: "4px 6px" }}
                />
              </span>
            ) : (
              <span className="summary-field__text">
                <strong>{item.item}</strong>: {item.description}
              </span>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ fontSize: "12px", color: "var(--mds-color-text-secondary)", padding: "8px 0 0 28px" }}>
            No items extracted. Click &quot;+ Add Item&quot; to add manually.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="review-summary-card">
      <h4
        style={{
          margin: "0 0 12px 0",
          fontSize: "14px",
          color: "var(--mds-color-heading)",
        }}
      >
        Extracted Summary (Editable)
      </h4>

      <div style={{ marginBottom: "12px" }}>
        <label
          htmlFor="review-grant-name"
          className="summary-field__label"
        >
          Grant Name
        </label>
        <input
          id="review-grant-name"
          type="text"
          className="review-text-input"
          value={(editedSummary.GrantName as string) || ""}
          onChange={(e) =>
            onSummaryChange({ ...editedSummary, GrantName: e.target.value })
          }
        />
      </div>

      <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="review-agency" className="summary-field__label">
            Agency
          </label>
          <input
            id="review-agency"
            type="text"
            className="review-text-input"
            value={(editedSummary.Agency as string) || ""}
            onChange={(e) =>
              onSummaryChange({ ...editedSummary, Agency: e.target.value })
            }
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="review-category" className="summary-field__label">
            Category
          </label>
          <select
            id="review-category"
            className="review-text-input"
            value={(editedSummary.Category as string) || ""}
            onChange={(e) =>
              onSummaryChange({ ...editedSummary, Category: e.target.value })
            }
          >
            <option value="">Select category...</option>
            {GRANT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {renderField("Eligibility Criteria", "EligibilityCriteria")}
      {renderField("Required Documents", "RequiredDocuments")}
      {renderField("Project Narrative Sections", "ProjectNarrativeSections")}
      {renderField("Key Deadlines", "KeyDeadlines")}
    </div>
  );
};

export default SummaryEditor;

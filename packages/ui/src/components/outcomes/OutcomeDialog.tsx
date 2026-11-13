import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import OutcomeFields from "./OutcomeFields";
import { EMPTY_OUTCOME, toOutcomeInput, type OutcomeDraft, type OutcomeInput } from "../../common/application-outcomes";
import type { ApplicationOutcome } from "../../common/api-client/outcomes-client";
import "./outcomes.css";

interface OutcomeDialogProps {
  /** The application being updated; null keeps the dialog closed. */
  application: { sessionId: string; title: string } | null;
  current?: ApplicationOutcome;
  onSave: (sessionId: string, input: OutcomeInput) => Promise<void>;
  onClose: () => void;
}

function draftFrom(current?: ApplicationOutcome): OutcomeDraft {
  if (!current) return EMPTY_OUTCOME;
  return {
    status: current.status,
    submittedDate: current.submittedDate ?? "",
    decisionDate: current.decisionDate ?? "",
    amountAwarded: current.amountAwarded === null ? "" : String(current.amountAwarded),
  };
}

export default function OutcomeDialog({ application, current, onSave, onClose }: OutcomeDialogProps) {
  const [value, setValue] = useState<OutcomeDraft>(EMPTY_OUTCOME);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(draftFrom(current));
    setError(null);
  }, [application, current]);

  const save = async () => {
    if (!application) return;
    const input = toOutcomeInput(value);
    if ("error" in input) {
      setError(input.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(application.sessionId, input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the outcome.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={Boolean(application)} onClose={() => !saving && onClose()} title="Update outcome">
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving && value.status) void save();
        }}
        noValidate
      >
        <p className="modal-description">
          What happened with <strong>{application?.title}</strong>? This helps show what GrantWell applications achieve.
        </p>
        <div role="alert">{error && <p className="modal-description outcome-error">{error}</p>}</div>
        <OutcomeFields idPrefix="outcome" value={value} onChange={setValue} disabled={saving} />
        <div className="modal-actions">
          <button type="button" className="gw-btn gw-btn--secondary modal-button secondary" onClick={() => !saving && onClose()} aria-disabled={saving || undefined}>
            Cancel
          </button>
          <button type="submit" className="gw-btn gw-btn--primary modal-button primary" aria-disabled={saving || !value.status || undefined}>
            {saving ? "Saving..." : "Save outcome"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

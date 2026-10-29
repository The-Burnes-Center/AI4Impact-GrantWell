import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import type { DueApplication } from "../../common/api-client/outcomes-client";
import { Modal } from "../common/Modal";
import OutcomeFields from "./OutcomeFields";
import { EMPTY_OUTCOME, toOutcomeInput, type OutcomeDraft, type OutcomeInput } from "../../common/application-outcomes";
import { formatDeadline } from "./format";
import "./outcomes.css";

/**
 * After sign-in, asks what happened with every application whose grant deadline has passed.
 * Answered ones are saved; the rest, or all of them on "Not now", wait another 60 days.
 * onDone fires once: when there is nothing to ask, or when the dialog closes.
 */
export default function OutcomeReminder({ onDone }: { onDone?: () => void }) {
  const appContext = useContext(AppContext);
  const [due, setDue] = useState<DueApplication[]>([]);
  const [values, setValues] = useState<Record<string, OutcomeDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!appContext) return;
    let active = true;
    (async () => {
      let shown = false;
      try {
        const list = await new ApiClient(appContext).outcomes.due();
        if (active && list.length) {
          setDue(list);
          setValues(
            Object.fromEntries(
              list.map((d) => [d.sessionId, d.status ? { ...EMPTY_OUTCOME, status: d.status, submittedDate: d.submittedDate ?? "" } : EMPTY_OUTCOME])
            )
          );
          shown = true;
        }
      } catch (err) {
        console.error("Could not check application outcomes", err);
      }
      if (active && !shown) onDoneRef.current?.();
    })();
    return () => {
      active = false;
    };
  }, [appContext]);

  if (!appContext || due.length === 0) return null;
  const outcomes = new ApiClient(appContext).outcomes;

  const close = () => {
    setDue([]);
    onDoneRef.current?.();
  };

  // A "Submitted" answer the user left unchanged is still waiting, so it is snoozed, not re-saved.
  const changed = (d: DueApplication) => {
    const v = values[d.sessionId];
    return Boolean(v.status) && !(v.status === d.status && v.status === "submitted" && v.submittedDate === (d.submittedDate ?? ""));
  };

  const save = async () => {
    const answers: [string, OutcomeInput][] = [];
    for (const d of due.filter(changed)) {
      const input = toOutcomeInput(values[d.sessionId]);
      if ("error" in input) {
        setError(`${d.title}: ${input.error}`);
        return;
      }
      answers.push([d.sessionId, input]);
    }
    setSaving(true);
    setError(null);
    try {
      for (const [sessionId, input] of answers) await outcomes.record(sessionId, input);
      const skipped = due.filter((d) => !changed(d)).map((d) => d.sessionId);
      if (skipped.length) await outcomes.snooze(skipped);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const notNow = async () => {
    setSaving(true);
    try {
      await outcomes.snooze(due.map((d) => d.sessionId));
    } catch (err) {
      console.error("Could not snooze the outcome reminder", err);
    } finally {
      setSaving(false);
      close();
    }
  };

  return (
    <Modal isOpen onClose={() => !saving && void notNow()} title="What happened with your applications?" maxWidth="600px">
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <p className="modal-description">
          The deadline has passed for {due.length === 1 ? "this application" : "these applications"}. Let us know how it
          went. Leave any you don&apos;t know yet, and we&apos;ll ask again in 60 days.
        </p>
        <div role="alert">{error && <p className="modal-description outcome-error">{error}</p>}</div>
        <ul className="outcome-reminder__list">
          {due.map((d, i) => (
            <li key={d.sessionId} className="outcome-reminder__item">
              <h3 className="outcome-reminder__title">{d.title || "Untitled application"}</h3>
              <p className="outcome-reminder__meta">
                {d.grant}
                {d.deadline ? ` · Deadline ${formatDeadline(d.deadline)}` : ""}
              </p>
              <OutcomeFields
                idPrefix={`reminder-${i}`}
                value={values[d.sessionId]}
                onChange={(next) => setValues((prev) => ({ ...prev, [d.sessionId]: next }))}
                disabled={saving}
                allowBlank
              />
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="modal-button secondary" onClick={() => void notNow()} disabled={saving}>
            Not now
          </button>
          <button type="submit" className="modal-button primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

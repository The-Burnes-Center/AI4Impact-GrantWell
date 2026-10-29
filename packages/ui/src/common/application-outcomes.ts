/** Mirrors STATUS_FIELDS in core's application-outcomes Lambda, which validates the same rules. */
export const OUTCOME_STATUSES = ["submitted", "awarded", "not_awarded", "withdrawn", "not_submitted"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const OUTCOME_LABELS: Record<OutcomeStatus, string> = {
  submitted: "Submitted, waiting to hear",
  awarded: "Awarded",
  not_awarded: "Not awarded",
  withdrawn: "Withdrawn",
  not_submitted: "Didn't submit",
};

type OutcomeField = "submittedDate" | "decisionDate" | "amountAwarded";

export const OUTCOME_FIELDS: Record<OutcomeStatus, OutcomeField[]> = {
  submitted: ["submittedDate"],
  awarded: ["decisionDate", "amountAwarded"],
  not_awarded: ["decisionDate"],
  withdrawn: [],
  not_submitted: [],
};

export interface OutcomeInput {
  status: OutcomeStatus;
  submittedDate?: string;
  decisionDate?: string;
  amountAwarded?: number;
}

/** What the form holds: strings as typed, so a half-filled amount survives re-renders. */
export interface OutcomeDraft {
  status: OutcomeStatus | "";
  submittedDate: string;
  decisionDate: string;
  amountAwarded: string;
}

export const EMPTY_OUTCOME: OutcomeDraft = { status: "", submittedDate: "", decisionDate: "", amountAwarded: "" };

export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Whole dollars from what the user typed ("$25,000" → 25000), or null when it isn't one. */
export function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  return /^\d{1,13}$/.test(cleaned) ? Number(cleaned) : null;
}

/** The API body, or the first problem to show. */
export function toOutcomeInput(draft: OutcomeDraft, today = todayIso()): OutcomeInput | { error: string } {
  if (!draft.status) return { error: "Choose an outcome." };
  const needed = OUTCOME_FIELDS[draft.status];
  const input: OutcomeInput = { status: draft.status };
  for (const [field, label] of [["submittedDate", "Date submitted"], ["decisionDate", "Decision date"]] as const) {
    if (!needed.includes(field)) continue;
    if (!draft[field]) return { error: `${label} is required.` };
    if (draft[field] > today) return { error: `${label} can't be in the future.` };
    input[field] = draft[field];
  }
  if (needed.includes("amountAwarded")) {
    const amount = parseDollars(draft.amountAwarded);
    if (amount === null) return { error: "Amount awarded must be a whole number of dollars." };
    input.amountAwarded = amount;
  }
  return input;
}

export function formatDollars(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

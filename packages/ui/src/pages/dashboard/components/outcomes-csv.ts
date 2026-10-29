import type { AdminOutcome } from "../../../common/api-client/outcomes-client";
import { OUTCOME_LABELS } from "../../../common/application-outcomes";

const CSV_COLUMNS: [string, (o: AdminOutcome) => string][] = [
  ["Email", (o) => (o.deleted ? "(deleted account)" : o.email)],
  ["Organization", (o) => o.organization],
  ["Region", (o) => o.region],
  ["State", (o) => o.state],
  ["Grant", (o) => o.grant],
  ["Application", (o) => o.title],
  ["Outcome", (o) => OUTCOME_LABELS[o.status] ?? o.status],
  ["Requested amount", (o) => o.requestedAmount],
  ["Amount awarded", (o) => (o.amountAwarded === null ? "" : String(o.amountAwarded))],
  ["Date submitted", (o) => o.submittedDate ?? ""],
  ["Decision date", (o) => o.decisionDate ?? ""],
  ["Last updated", (o) => o.updatedAt ?? ""],
];

export function outcomesCsv(rows: AdminOutcome[]): string {
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const cell = (v: string) => {
    const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [CSV_COLUMNS.map(([h]) => h), ...rows.map((o) => CSV_COLUMNS.map(([, get]) => get(o)))];
  return lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}

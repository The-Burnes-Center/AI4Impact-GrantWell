/**
 * The ordered NOFO ingestion stages, as written to `processing_status` on the
 * metadata record by the pipeline. This is the single source of truth for both
 * the label and the position of a NOFO in the pipeline; the upload stepper reads
 * it to show how far along a document is.
 *
 * Only statuses the backend actually writes appear here. `detecting_sections`
 * and `incomplete` were display-only labels with no backend producer and are
 * intentionally omitted.
 */
export const PROCESSING_STAGES = [
  { key: "uploading", label: "Uploaded" },
  { key: "extracting_text", label: "Extracting text" },
  { key: "extracting", label: "Analyzing" },
  { key: "synthesizing", label: "Synthesizing" },
  { key: "validating", label: "Validating" },
] as const;

export type ProcessingStageKey = (typeof PROCESSING_STAGES)[number]["key"];

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  PROCESSING_STAGES.map((s, i) => [s.key, i])
);

/** Zero-based position of a status in the pipeline, or -1 if unknown/terminal. */
export function stageIndex(status: string | null | undefined): number {
  if (!status) return -1;
  return STAGE_INDEX[status] ?? -1;
}

export const PROCESSING_LABELS: Record<string, string> = Object.fromEntries(
  PROCESSING_STAGES.map((s) => [s.key, s.label])
);

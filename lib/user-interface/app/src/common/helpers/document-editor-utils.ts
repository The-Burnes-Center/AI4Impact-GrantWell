import type { DraftStatus } from "../api-client/drafts-client";

/**
 * Maps a UI step ID to the backend draft status string.
 */
export const stepToStatus = (step: string): DraftStatus => {
  const stepMap: Record<string, string> = {
    projectBasics: "project_basics",
    questionnaire: "questionnaire",
    uploadDocuments: "questionnaire",
    sectionEditor: "editing_sections",
    reviewApplication: "editing_sections",
  };
  return (stepMap[step] || "project_basics") as DraftStatus;
};

/**
 * Maps a backend draft status string to a UI step ID.
 */
export const statusToStep = (status: string): string => {
  const statusMap: Record<string, string> = {
    project_basics: "projectBasics",
    questionnaire: "questionnaire",
    uploading_documents: "uploadDocuments",
    generating_draft: "sectionEditor",
    editing_sections: "sectionEditor",
    reviewing: "reviewApplication",
    submitted: "reviewApplication",
  };
  return statusMap[status] || "projectBasics";
};

/** The ordered list of step IDs used by the document editor flow. */
export const EDITOR_STEPS = [
  { id: "projectBasics", label: "Project Basics", description: "Basic information", tooltip: "Enter your project name, organization details, requested amount, location, and contact information." },
  { id: "questionnaire", label: "Questionnaire", description: "Answer questions", tooltip: "Answer NOFO-specific questions about your project. These responses will help generate your grant application." },
  { id: "uploadDocuments", label: "Additional Information", description: "Additional context", tooltip: "Share any additional context or information that will help generate your grant application." },
  { id: "sectionEditor", label: "Section Editor", description: "Edit sections", tooltip: "Review and edit AI-generated narrative sections. You can regenerate individual sections or edit them directly." },
  { id: "reviewApplication", label: "Review", description: "Final review", tooltip: "Review your complete application, check completeness, and export as PDF when ready." },
] as const;

/** Map a step ID to its zero-based index. */
export const stepToIndex = (step: string): number => {
  const idx = EDITOR_STEPS.findIndex((s) => s.id === step);
  return idx >= 0 ? idx : 0;
};

/**
 * Session-scoped local mirror of in-progress draft edits, so a closed tab or a
 * failed save doesn't lose typing. Keys must stay scoped by session — the
 * unscoped predecessors let one draft pre-fill and then overwrite another's.
 */

export type DraftCachePart =
  | "projectBasics"
  | "questionnaire"
  | "sections"
  | "additionalInfo";

const DRAFT_CACHE_PREFIX = "gw:draft";

const LEGACY_DRAFT_CACHE_KEYS = ["projectBasics", "questionnaire", "sectionAnswers"];

export const draftCacheKey = (sessionId: string, part: DraftCachePart): string =>
  `${DRAFT_CACHE_PREFIX}:${sessionId}:${part}`;

export function readDraftCache<T>(sessionId: string | null | undefined, part: DraftCachePart): T | null {
  if (!sessionId) return null;
  try {
    const raw = localStorage.getItem(draftCacheKey(sessionId, part));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}


export function writeDraftCache<T>(sessionId: string | null | undefined, part: DraftCachePart, value: T): void {
  if (!sessionId) return;
  try {
    localStorage.setItem(draftCacheKey(sessionId, part), JSON.stringify(value));
  } catch (error) {
    console.warn("Draft cache write failed:", error);
  }
}

/** Drop every cached part for one session (e.g. after the draft is deleted). */
export function clearDraftCache(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  const prefix = `${DRAFT_CACHE_PREFIX}:${sessionId}:`;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("Draft cache clear failed:", error);
  }
}

export function sweepLegacyDraftCache(): void {
  try {
    for (const key of LEGACY_DRAFT_CACHE_KEYS) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to sweep */
  }
}

import type { DraftStatus } from "../api-client/drafts-client";

/**
 * Maps a UI step ID to the backend draft status string.
 */
export const stepToStatus = (step: string): DraftStatus => {
  const stepMap: Record<string, string> = {
    projectBasics: "project_basics",
    questionnaire: "questionnaire",
    uploadDocuments: "questionnaire",
    draftCreated: "editing_sections",
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
    generating_draft: "draftCreated",
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
  { id: "reviewApplication", label: "Review", description: "Final review", tooltip: "Review your complete application, check compliance, and export as PDF when ready." },
] as const;

/** Map a step ID to its zero-based index. */
export const stepToIndex = (step: string): number => {
  const idx = EDITOR_STEPS.findIndex((s) => s.id === step);
  return idx >= 0 ? idx : 0;
};

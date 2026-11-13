const SECTION_LABELS: Record<string, string> = {
  EligibilityCriteria: "eligibility criteria",
  RequiredDocuments: "required documents",
  ProjectNarrativeSections: "narrative sections",
  KeyDeadlines: "key deadlines",
};

export const sectionLabel = (key: string): string =>
  SECTION_LABELS[key] ??
  key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(" ")
    .map((word) => (/^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase()))
    .join(" ");

// Release bars from the rebuild plan §5.2. `null` bar: tracked, not gated (v2-only or not yet measurable).
export const BARS = {
  "deadline.dateExact": { bar: 1, label: "Application due date exact" },
  "deadline.timeTz": { bar: 1, label: "Due time and time zone as written" },
  "eligibility.precision": { bar: 0.95, label: "Eligibility precision" },
  "eligibility.recall": { bar: 0.85, label: "Eligibility recall" },
  "documents.precision": { bar: 0.95, label: "Required documents precision" },
  "documents.recall": { bar: 0.85, label: "Required documents recall" },
  "sections.recall": { bar: 0.95, label: "Narrative sections recall" },
  "sections.zeroGrants": { bar: 0, max: true, count: true, label: "Grants with 0 sections" },
  "sections.duplicatePairs": { bar: 3, max: true, count: true, label: "Same-section duplicate pairs (whole set)" },
  "criteria.recall": { bar: 0.95, label: "Scored criteria recall" },
  "criteria.pointsExact": { bar: 0.95, label: "Criteria points exact" },
  "limits.captured": { bar: 0.9, label: "Section limits captured" },
  "format.captured": { bar: 0.9, label: "Format rules captured" },
  "library.present": { bar: 1, label: "Standard sections present where the notice defers" },
  "questions.criteriaCovered": { bar: 1, label: "Each scored criterion covered by a question" },
  "questions.describeShare": { bar: 0.05, max: true, label: "\"Describe…\" question share" },
  "chat.correct": { bar: 0.9, label: "Chat answer correct" },
  "chat.absentCorrect": { bar: 0.9, label: "Chat says not stated when absent" },
  "chat.allowableCost": { bar: null, label: "Allowable-cost verdict correct" },
  "draft.withinLimit": { bar: 1, label: "Draft sections within limit (−25%/+0%)" },
  "draft.untracedNumbers": { bar: 1, max: true, label: "Untraced numbers per draft" },
  "draft.contradictions": { bar: 1, max: true, label: "Cross-section contradictions per draft" },
  "draft.criteriaAddressed": { bar: 0.9, label: "Scored criteria addressed" },
  "draft.trapsHandled": { bar: null, label: "Known traps handled" },
  "cost.perGrant": { bar: 0.34, max: true, label: "Bedrock cost per grant, USD (Textract's $0.075 is not run by the eval)" },
};

export function verdict(metric, value) {
  const b = BARS[metric];
  if (!b || b.bar === null || value === null || value === undefined) return null;
  return b.max ? value <= b.bar : value >= b.bar;
}

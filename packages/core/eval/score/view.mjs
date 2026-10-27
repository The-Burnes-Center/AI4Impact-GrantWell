// One shape for scoring, whatever summary schema the pipeline wrote. v1 has four lists and one
// date; fields it has no home for (criteria, award, format) are scored by finding them in its text.
const line = (x) => (x?.description ? `${x.item}: ${x.description}` : String(x?.item ?? x ?? ""));

export function viewOf(summary) {
  if (!summary) return null;
  if (summary.schemaVersion === 2) throw new Error("eval: v2 summaries are scored once WS3 defines them");
  const lists = {
    deadlines: (summary.KeyDeadlines ?? []).map(line),
    sections: (summary.ProjectNarrativeSections ?? []).map(line),
    sectionNames: (summary.ProjectNarrativeSections ?? []).map((s) => s.item),
    eligibility: (summary.EligibilityCriteria ?? []).map(line),
    documents: (summary.RequiredDocuments ?? []).map(line),
  };
  const text = [
    `Application deadline: ${summary.application_deadline ?? "(none)"}`,
    ...Object.entries({ "Key deadlines": lists.deadlines, "Narrative sections": lists.sections, Eligibility: lists.eligibility, "Required documents": lists.documents })
      .map(([k, v]) => `${k}:\n${v.map((t) => `- ${t}`).join("\n")}`),
  ].join("\n\n");
  return { schema: "v1", applicationDeadline: summary.application_deadline ?? null, ...lists, text, notInSchema: ["criteria", "award", "format", "limits"] };
}

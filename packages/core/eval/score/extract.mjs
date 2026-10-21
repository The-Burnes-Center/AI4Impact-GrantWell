import { viewOf } from "./view.mjs";

const label = (s) => [s.component, s.name].filter(Boolean).join(" — ");
const limitText = (l) => `${l.value} ${l.type}${l.per === "question" ? " per question" : ""}`;

function pairCounts(pairs, keyCount, predictedCount) {
  const keys = new Set(pairs.map((p) => p.key));
  const predicted = new Set(pairs.map((p) => p.predicted));
  return { recall: [keys.size, keyCount], precision: [predicted.size, predictedCount] };
}

function deadlineDateExact(gold, predicted) {
  const dates = (kinds) => new Set(gold.deadlines.filter((d) => kinds.includes(d.kind) && d.date).map((d) => d.date));
  const application = dates(["application"]);
  const accepted = application.size ? new Set([...application, ...dates(["other"])]) : dates(["other"]);
  if (application.size === 0 && predicted === null) return 1;
  return predicted !== null && accepted.has(predicted) ? 1 : 0;
}

/** Counts are [hits, total]; the report pools them across grants. */
export async function scoreExtract(gold, output, judge) {
  const view = viewOf(output?.summary);
  if (!view) return { error: "no summary" };
  const counts = {};
  const notes = [];
  const audit = [];
  const keepPairs = (field, key, predicted, pairs) =>
    audit.push({ field, pairs: pairs.map((p) => [key[p.key], predicted[p.predicted], p.evidence]), unmatchedKey: key.filter((_, i) => !pairs.some((p) => p.key === i)) });
  const keepFinds = (field, key, found) => audit.push({ field, finds: key.map((k, i) => [k, found[i].found, found[i].valueCorrect, found[i].evidence]) });

  counts["deadline.dateExact"] = [deadlineDateExact(gold, view.applicationDeadline), 1];
  const timed = gold.deadlines.filter((d) => d.kind === "application" && d.time);
  const timeKeys = [...new Map(timed.map((d) => [`${d.time} ${d.tzAsWritten ?? ""}`, d])).values()];
  if (timeKeys.length) {
    const keys = timeKeys.map((d) => `Application due ${d.date ?? "(no date)"} at ${d.time} ${d.tzAsWritten ?? "(no zone stated)"}`);
    const found = await judge.find("application deadline time and time zone", keys, view.text);
    keepFinds("deadline.timeTz", keys, found);
    counts["deadline.timeTz"] = [found.filter((f) => f.found && f.valueCorrect !== false).length, timeKeys.length];
  }

  for (const [field, key, predicted] of [
    ["eligibility", gold.eligibility.map((e) => e.item), view.eligibility],
    ["documents", gold.requiredDocuments.map((d) => d.item), view.documents],
  ]) {
    const pairs = await judge.pair(field, key, predicted);
    keepPairs(field, key, predicted, pairs);
    const c = pairCounts(pairs, key.length, predicted.length);
    counts[`${field}.recall`] = c.recall;
    counts[`${field}.precision`] = c.precision;
  }

  const sectionKeys = [...gold.sections.map(label), ...gold.libraryRequired.map((n) => (typeof n === "string" ? n : n.name))];
  const sectionPairs = await judge.pair("narrative sections", sectionKeys, view.sections);
  keepPairs("sections", sectionKeys, view.sectionNames, sectionPairs);
  counts["sections.recall"] = pairCounts(sectionPairs, sectionKeys.length, view.sections.length).recall;
  counts["sections.zeroGrants"] = [sectionKeys.length > 0 && view.sections.length === 0 ? 1 : 0, 1];
  const perKey = new Map();
  for (const p of sectionPairs) perKey.set(p.key, (perKey.get(p.key) ?? 0) + 1);
  counts["sections.duplicatePairs"] = [[...perKey.values()].reduce((n, k) => n + k - 1, 0), 1];
  const libraryStart = gold.sections.length;
  if (gold.libraryRequired.length) {
    const hit = new Set(sectionPairs.filter((p) => p.key >= libraryStart).map((p) => p.key));
    counts["library.present"] = [hit.size, gold.libraryRequired.length];
  }

  const scored = gold.criteria.filter((c) => c.scored);
  if (scored.length) {
    const keys = scored.map((c) => `${c.name}${c.points != null ? ` (${c.points} points)` : c.weightPct != null ? ` (${c.weightPct}% weight)` : ""}`);
    const found = await judge.find("scored review criteria", keys, view.text);
    keepFinds("criteria", keys, found);
    counts["criteria.recall"] = [found.filter((f) => f.found).length, scored.length];
    const valued = scored.map((c, i) => [c, found[i]]).filter(([c]) => c.points != null || c.weightPct != null);
    if (valued.length) counts["criteria.pointsExact"] = [valued.filter(([, f]) => f.found && f.valueCorrect).length, valued.length];
  }

  const limited = gold.sections.filter((s) => s.limit);
  if (limited.length) {
    const keys = limited.map((s) => `${label(s)}: limit ${limitText(s.limit)}`);
    const found = await judge.find("section length limits", keys, view.text);
    keepFinds("limits", keys, found);
    counts["limits.captured"] = [found.filter((f) => f.found && f.valueCorrect !== false).length, limited.length];
  }
  const fmt = gold.format ?? {};
  const formatKeys = [
    ...Object.entries(fmt).filter(([k, v]) => !["other", "quote"].includes(k) && v !== null).map(([k, v]) => `${k}: ${v}`),
    ...(fmt.other ?? []).map((o) => (typeof o === "string" ? o : o.item)),
  ];
  if (formatKeys.length) {
    const found = await judge.find("format rules", formatKeys, view.text);
    keepFinds("format", formatKeys, found);
    counts["format.captured"] = [found.filter((f) => f.found && f.valueCorrect !== false).length, formatKeys.length];
  }
  if (view.schema === "v1") notes.push(`v1 has no field for ${view.notInSchema.join(", ")}; those were looked for in its text`);
  return { counts, notes, audit };
}

export async function scoreQuestions(gold, questions, judge) {
  const list = (questions?.questions ?? []).map((q) => q.question);
  if (!list.length) return { error: "no questions" };
  const counts = { "questions.describeShare": [list.filter((q) => /^\s*describe\b/i.test(q)).length, list.length] };
  const scored = gold.criteria.filter((c) => c.scored);
  if (scored.length) {
    const pairs = await judge.pair("scored criteria (key) covered by applicant questions (predicted)", scored.map((c) => c.name), list);
    counts["questions.criteriaCovered"] = [new Set(pairs.map((p) => p.key)).size, scored.length];
  }
  return { counts, notes: [] };
}

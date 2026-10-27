import fs from "node:fs";
import { readOptional } from "../lib/golden.mjs";

const WORDS_PER_PAGE = 500;
const MAX_NOTICE_CHARS = 150000;

export async function scoreChat(gold, grant, output, judge) {
  const key = new Map((readOptional(grant, "chat.json") ?? []).map((q) => [q.id, q]));
  const counts = { "chat.correct": [0, 0], "chat.absentCorrect": [0, 0], "chat.allowableCost": [0, 0] };
  const graded = [];
  for (const a of output?.answers ?? []) {
    const q = key.get(a.id);
    if (!q) continue;
    const g = await judge.chat(q.question, q.expected, a.answer ?? a.error);
    const metric = q.kind === "absent" ? "chat.absentCorrect" : q.kind === "allowable_cost" ? "chat.allowableCost" : "chat.correct";
    const ok = q.kind === "absent" ? g.saysNotStated : q.kind === "allowable_cost" ? g.verdict === q.verdict : g.correct;
    counts[metric][0] += ok ? 1 : 0;
    counts[metric][1] += 1;
    graded.push({ id: a.id, kind: q.kind, ok, reason: g.reason });
  }
  for (const m of Object.keys(counts)) if (counts[m][1] === 0) delete counts[m];
  return { counts, notes: [], detail: graded };
}

function measure(content, limit) {
  const text = content ?? "";
  if (limit.type === "chars") return { actual: text.length, cap: limit.value };
  if (limit.type === "paragraphs") return { actual: text.split(/\n\s*\n/).filter((p) => p.trim()).length, cap: limit.value };
  const words = text.split(/\s+/).filter(Boolean).length;
  return { actual: words, cap: limit.type === "pages" ? limit.value * WORDS_PER_PAGE : limit.value };
}

export async function scoreDraft(gold, grant, output, judge) {
  const sections = output?.sections ?? [];
  if (!sections.length) return { error: "no sections" };
  const counts = {};
  const notes = [];
  const limited = gold.sections.filter((s) => s.limit && s.limit.per !== "question");
  if (gold.sections.some((s) => s.limit?.per === "question")) notes.push("per-question limits are not measured");
  if (limited.length) {
    const pairs = await judge.pair("application sections", limited.map((s) => s.name), sections.map((s) => s.name));
    let within = 0;
    const checked = [];
    for (const p of pairs) {
      const { actual, cap } = measure(sections[p.predicted].content, limited[p.key].limit);
      const ok = actual <= cap && actual >= cap * 0.75;
      within += ok ? 1 : 0;
      checked.push({ section: sections[p.predicted].name, actual, cap, unit: limited[p.key].limit.type, ok });
    }
    counts["draft.withinLimit"] = [within, checked.length];
    notes.push(...checked.filter((c) => !c.ok).map((c) => `${c.section}: ${c.actual} vs limit ${c.cap} ${c.unit === "pages" ? "words" : c.unit}`));
  }
  const input = readOptional(grant, "draft.json") ?? {};
  const scored = gold.criteria.filter((c) => c.scored);
  const review = await judge.draft({
    inputs: { projectBasics: input.projectBasics, questionnaireAnswers: input.questionnaireAnswers, additionalInfo: input.additionalInfo },
    excerpts: fs.readFileSync(grant.rawPath, "utf8").slice(0, MAX_NOTICE_CHARS),
    sections,
    criteria: scored.map((c) => `${c.name}${c.points != null ? ` (${c.points} points)` : c.weightPct != null ? ` (${c.weightPct}%)` : ""}`),
    traps: input.traps ?? [],
  });
  counts["draft.untracedNumbers"] = [review.untracedNumbers.length, 1];
  counts["draft.contradictions"] = [review.contradictions.length, 1];
  if (scored.length) counts["draft.criteriaAddressed"] = [review.criteria.filter((c) => c.addressed).length, scored.length];
  if (input.traps?.length) counts["draft.trapsHandled"] = [review.traps.filter((t) => t.handled).length, input.traps.length];
  const placeholders = sections.reduce((n, s) => n + ((s.content ?? "").match(/\[[A-Z][A-Z0-9 ,'/&-]{3,}\]/g) ?? []).length, 0);
  notes.push(`${placeholders} bracketed placeholders`);
  return { counts, notes, detail: { untracedNumbers: review.untracedNumbers, contradictions: review.contradictions } };
}

/** Key facts for the chat's Grant panel, read from the grant summary the page already loads. */

type Item = { item?: unknown; description?: unknown };
export interface GrantSummaryData {
  EligibilityCriteria?: Item[];
  RequiredDocuments?: Item[];
  ProjectNarrativeSections?: Item[];
  KeyDeadlines?: Item[];
}

export interface GrantFact {
  label: string;
  value: string | null;
}

const SENTENCE_MAX_CHARS = 220;

const text = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Item[] => (Array.isArray(v) ? v : []);

function sentences(description: string): string[] {
  return description
    .split(/(?<![ap]\.m\.|e\.g\.|i\.e\.|U\.S\.|\bNo\.|\bInc\.|\bvs\.|\bSec\.)(?<=[.!?])\s+(?=[A-Z0-9$])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clip(s: string): string {
  return s.length > SENTENCE_MAX_CHARS ? `${s.slice(0, SENTENCE_MAX_CHARS - 1).trimEnd()}…` : s;
}

function first(items: Item[], name: RegExp, not?: RegExp): string | null {
  const hit = items.find((i) => name.test(text(i.item)) && !(not && not.test(text(i.item))) && text(i.description).trim());
  return hit ? clip(sentences(text(hit.description))[0] ?? "") || null : null;
}

function sentenceWith(items: Item[], pattern: RegExp): string | null {
  for (const i of items) {
    const hit = sentences(text(i.description)).find((s) => pattern.test(s));
    if (hit) return clip(hit);
  }
  return null;
}

export function grantFacts(summary: GrantSummaryData | null | undefined): GrantFact[] {
  const deadlines = list(summary?.KeyDeadlines);
  const all = [
    ...list(summary?.EligibilityCriteria),
    ...list(summary?.RequiredDocuments),
    ...list(summary?.ProjectNarrativeSections),
    ...deadlines,
  ];
  const narrative = [...list(summary?.ProjectNarrativeSections), ...list(summary?.RequiredDocuments)];
  const COST_SHARE = /match|cost[\s-]?shar/i;
  return [
    {
      label: "Deadline",
      value:
        first(deadlines, /application|submission|proposal|due|close/i, /registration|intent|question|webinar|sam\.gov|notif/i) ??
        first(deadlines, /./),
    },
    { label: "Funding", value: first(all, /fund|award|amount|ceiling|budget/i, COST_SHARE) },
    { label: "Match", value: first(all, COST_SHARE) ?? sentenceWith(all, COST_SHARE) },
    {
      label: "Narrative limit",
      value: first(narrative, /page limit|length|limit/i) ?? sentenceWith(narrative, /\b\d+[\s-]pages?\b|page limit/i),
    },
  ];
}

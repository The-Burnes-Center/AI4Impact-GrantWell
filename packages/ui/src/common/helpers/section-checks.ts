/**
 * Review checks on section text: length against the grant's stated limits and [BRACKETED]
 * placeholders the draft left to fill. Limits are read from the summary's free text, so the parser
 * only takes a limit it can attribute to the section itself and gives up when in doubt.
 */

export const WORDS_PER_PAGE = 300;

export type LimitUnit = "characters" | "words" | "pages";

export interface SectionLimit {
  unit: LimitUnit;
  max: number;
}

export interface TextMeasure {
  characters: number;
  words: number;
  /** Estimated from the word count; one decimal. */
  pages: number;
}

/** Section Markdown as the reader sees it, whitespace collapsed. */
export function sectionPlainText(markdown: string | null | undefined): string {
  if (!markdown) return "";
  return markdown
    .replace(/^\s{0,3}(?:```|~~~).*$/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|[\s(])[*_](?=\S)/g, "$1")
    .replace(/(?<=\S)[*_](?=[\s).,;:!?]|$)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, "$1")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pagesForWords(words: number): number {
  const pages = Math.round((words / WORDS_PER_PAGE) * 10) / 10;
  return words > 0 && pages === 0 ? 0.1 : pages;
}

export function measureSection(markdown: string | null | undefined): TextMeasure {
  const text = sectionPlainText(markdown);
  const words = text ? text.split(" ").length : 0;
  return { characters: text.length, words, pages: pagesForWords(words) };
}

export function isOverLimit(measure: TextMeasure, limit: SectionLimit): boolean {
  return measure[limit.unit] > limit.max;
}

const PLACEHOLDER = /\[([^[\]\n]{2,})\](?!\()/g;

/** The [BRACKETED] gaps in `text`; footnote-style [1] and checkboxes are not placeholders. */
export function findPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const source = text.replace(/\\([[\]])/g, "$1");
  return [...source.matchAll(PLACEHOLDER)].filter((m) => /[A-Za-z]/.test(m[1])).map((m) => m[0]);
}

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hChildren?: Array<{ type: "text"; value: string }> };
}

/** A remark plugin that wraps each placeholder in a `<mark>`, matching findPlaceholders. */
export function remarkPlaceholderMarks() {
  return (tree: MdNode) => {
    const visit = (node: MdNode) => {
      if (!node.children || node.type === "code" || node.type === "inlineCode") return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          visit(child);
          return [child];
        }
        const value = child.value;
        const out: MdNode[] = [];
        let from = 0;
        for (const match of value.matchAll(PLACEHOLDER)) {
          if (!/[A-Za-z]/.test(match[1])) continue;
          const at = match.index ?? 0;
          if (at > from) out.push({ type: "text", value: value.slice(from, at) });
          out.push({ type: "placeholder", data: { hName: "mark", hChildren: [{ type: "text", value: match[0] }] } });
          from = at + match[0].length;
        }
        if (out.length === 0) return [child];
        if (from < value.length) out.push({ type: "text", value: value.slice(from) });
        return out;
      });
    };
    visit(tree);
  };
}

const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const UNIT = String.raw`(characters?|chars?|words?|pages?)`;
const QUALIFIER = String.raw`(?:no more than|not more than|no longer than|not to exceed|not exceed(?:ing)?|up to|maximum(?: of)?|max\.?|limited to|limit(?:ed)? of|at most|less than|fewer than)`;

const LIMIT_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b${QUALIFIER}\s+(?:a\s+)?${NUMBER}[\s-]*${UNIT}\b`, "gi"),
  new RegExp(String.raw`\b${NUMBER}[\s-]*${UNIT}\s*(?:limit|maximum|max\b|or (?:less|fewer))`, "gi"),
  new RegExp(String.raw`\b(?:page|word|character) limit(?:\s+is|:)?\s+${NUMBER}(?:[\s-]*${UNIT})?\b`, "gi"),
];

const NAME_PATTERN = new RegExp(String.raw`[(–—-]\s*${NUMBER}[\s-]*${UNIT}\b`, "gi");

const SHARED_BEFORE =
  /\b(?:part of|share[sd]?|within|included in|includes? in|counted|not included|appendix|appendices|toward|towards|against|exempt|beyond|outside|separate|combined|each|per|overall|component|attachment|application|proposal)\b/i;
const SHARED_AFTER = /^\s*\)?\s*,?\s*(?:total\s+)?(?:per|each|for each|for all|combined|across|within)\b/i;

function unitOf(word: string): LimitUnit {
  const w = word.toLowerCase();
  if (w.startsWith("char")) return "characters";
  if (w.startsWith("word")) return "words";
  return "pages";
}

function ownLimits(text: string, patterns: RegExp[], unitFromContext?: LimitUnit): SectionLimit[] {
  const found: SectionLimit[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const at = match.index ?? 0;
      const sentenceStart = Math.max(text.lastIndexOf(". ", at), text.lastIndexOf(";", at), text.lastIndexOf("::", at));
      const before = text.slice(Math.max(sentenceStart + 1, at - 60), at);
      const after = text.slice(at + match[0].length, at + match[0].length + 25);
      if (SHARED_BEFORE.test(before) || SHARED_AFTER.test(after)) continue;
      const number = match[1];
      const unitWord = match[2] ?? (/page limit/i.test(match[0]) ? "pages" : /word limit/i.test(match[0]) ? "words" : /character limit/i.test(match[0]) ? "characters" : undefined);
      const unit = unitWord ? unitOf(unitWord) : unitFromContext;
      const max = Number(number.replace(/,/g, ""));
      if (unit && max > 0) found.push({ unit, max });
    }
  }
  return found;
}

function single(limits: SectionLimit[]): SectionLimit | null {
  const distinct = new Map(limits.map((l) => [`${l.unit}:${l.max}`, l]));
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

/** The section's own length limit as the grant states it, or null when none or unclear. */
export function parseSectionLimit(name: string | null | undefined, description: string | null | undefined): SectionLimit | null {
  const title = name ?? "";
  const fromName = single([...ownLimits(title, LIMIT_PATTERNS), ...ownLimits(title, [NAME_PATTERN])]);
  if (fromName) return fromName;
  return single(ownLimits(description ?? "", LIMIT_PATTERNS));
}

interface SummaryItem {
  item?: string;
  description?: string;
}

const NARRATIVE_PHRASE =
  /\bthe (\d+)[\s-]*pages?\s+(?:(?:project|program|proposal|application|technical)\s+)?narrative\b|\b(\d+)[\s-]*pages?\s+(?:(?:project|program|proposal|application|technical)\s+)?narrative\s+(?:limit|maximum)\b/gi;

/** The page limit the grant sets for the whole narrative, or null when it states none or several. */
export function parseNarrativePageLimit(summary: Record<string, unknown> | null | undefined): number | null {
  if (!summary) return null;
  const items = (["RequiredDocuments", "ProjectNarrativeSections"] as const).flatMap((key) =>
    Array.isArray(summary[key]) ? (summary[key] as SummaryItem[]) : []
  );
  const found: number[] = [];
  for (const entry of items) {
    const name = entry?.item ?? "";
    const text = `${name} :: ${entry?.description ?? ""}`;
    for (const match of text.matchAll(NARRATIVE_PHRASE)) found.push(Number(match[1] ?? match[2]));
    const narrativeDocument = (summary.RequiredDocuments as unknown[] | undefined)?.includes(entry);
    if (narrativeDocument && /narrative/i.test(name) && !/budget/i.test(name)) {
      for (const limit of ownLimits(entry?.description ?? "", LIMIT_PATTERNS)) {
        if (limit.unit === "pages") found.push(limit.max);
      }
      for (const limit of ownLimits(name, [NAME_PATTERN, ...LIMIT_PATTERNS])) {
        if (limit.unit === "pages") found.push(limit.max);
      }
    }
  }
  const distinct = new Set(found.filter((n) => n > 0));
  return distinct.size === 1 ? [...distinct][0] : null;
}

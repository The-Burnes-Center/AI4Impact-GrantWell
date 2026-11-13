/**
 * Checks on a written section before it is saved: notes to the applicant are removed, and a
 * section over the grant's stated character or word limit is cut at a sentence boundary.
 *
 * The limit parser and plain-text measure follow the Review step's (packages/ui section-checks):
 * a limit is taken only when it can be attributed to the section itself, never when in doubt.
 */

const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const UNIT = String.raw`(characters?|chars?|words?|pages?)`;
const QUALIFIER = String.raw`(?:no more than|not more than|no longer than|not to exceed|not exceed(?:ing)?|up to|maximum(?: of)?|max\.?|limited to|limit(?:ed)? of|at most|less than|fewer than)`;

const LIMIT_PATTERNS = [
  new RegExp(String.raw`\b${QUALIFIER}\s+(?:a\s+)?${NUMBER}[\s-]*${UNIT}\b`, 'gi'),
  new RegExp(String.raw`\b${NUMBER}[\s-]*${UNIT}\s*(?:limit|maximum|max\b|or (?:less|fewer))`, 'gi'),
  new RegExp(String.raw`\b(?:page|word|character) limit(?:\s+is|:)?\s+${NUMBER}(?:[\s-]*${UNIT})?\b`, 'gi'),
];
const NAME_PATTERN = new RegExp(String.raw`[(–—-]\s*${NUMBER}[\s-]*${UNIT}\b`, 'gi');

const SHARED_BEFORE =
  /\b(?:part of|share[sd]?|within|included in|includes? in|counted|not included|appendix|appendices|toward|towards|against|exempt|beyond|outside|separate|combined|each|per|overall|component|attachment|application|proposal)\b/i;
const SHARED_AFTER = /^\s*\)?\s*,?\s*(?:total\s+)?(?:per|each|for each|for all|combined|across|within)\b/i;

function unitOf(word) {
  const w = word.toLowerCase();
  if (w.startsWith('char')) return 'characters';
  if (w.startsWith('word')) return 'words';
  return 'pages';
}

function ownLimits(text, patterns) {
  const found = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const at = match.index ?? 0;
      const sentenceStart = Math.max(text.lastIndexOf('. ', at), text.lastIndexOf(';', at), text.lastIndexOf('::', at));
      const before = text.slice(Math.max(sentenceStart + 1, at - 60), at);
      const after = text.slice(at + match[0].length, at + match[0].length + 25);
      if (SHARED_BEFORE.test(before) || SHARED_AFTER.test(after)) continue;
      const unitWord = match[2]
        ?? (/page limit/i.test(match[0]) ? 'pages' : /word limit/i.test(match[0]) ? 'words' : /character limit/i.test(match[0]) ? 'characters' : undefined);
      const max = Number(match[1].replace(/,/g, ''));
      if (unitWord && max > 0) found.push({ unit: unitOf(unitWord), max });
    }
  }
  return found;
}

function single(limits) {
  const distinct = new Map(limits.map((l) => [`${l.unit}:${l.max}`, l]));
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

/** The section's own character or word limit as the grant states it, or null (none, pages, or unclear). */
export function statedLimit(name, description) {
  const title = String(name ?? '');
  const limit = single([...ownLimits(title, LIMIT_PATTERNS), ...ownLimits(title, [NAME_PATTERN])])
    ?? single(ownLimits(String(description ?? ''), LIMIT_PATTERNS));
  return limit && limit.unit !== 'pages' ? limit : null;
}

/** Section Markdown as the reader sees it, whitespace collapsed. */
export function sectionPlainText(markdown) {
  if (!markdown) return '';
  return String(markdown)
    .replace(/^\s{0,3}(?:```|~~~).*$/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|[\s(])[*_](?=\S)/g, '$1')
    .replace(/(?<=\S)[*_](?=[\s).,;:!?]|$)/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function measure(markdown) {
  const text = sectionPlainText(markdown);
  return { characters: text.length, words: text ? text.split(' ').length : 0 };
}

export const isOver = (markdown, limit) => Boolean(limit) && measure(markdown)[limit.unit] > limit.max;

const DANGLING_LINE = /\n[ \t]*(?:#{1,6}\s[^\n]*|[-*+][ \t]*|\d+[.)][ \t]*|-{3,}|\*{3,}|_{3,})?[ \t]*$/;

function dropDanglingEnd(markdown) {
  let text = markdown.trimEnd();
  for (let previous = ''; previous !== text; ) {
    previous = text;
    text = text.replace(DANGLING_LINE, '').trimEnd();
  }
  return /^\s*#{1,6}\s/.test(text) && !text.includes('\n') ? '' : text;
}

/** The longest start of the section, ending at a sentence or line, that fits the limit. */
export function trimToLimit(markdown, limit) {
  const source = String(markdown ?? '');
  if (!isOver(source, limit)) return source;
  let best = '';
  for (const match of source.matchAll(/[.!?]["'”’)\]]*(?=\s|$)|\n/g)) {
    const candidate = dropDanglingEnd(source.slice(0, match.index + match[0].length));
    if (!candidate) continue;
    if (isOver(candidate, limit)) break;
    best = candidate;
  }
  if (best) return best;
  const words = source.split(/(\s+)/);
  let cut = '';
  for (const part of words) {
    if (isOver(cut + part, limit)) break;
    cut += part;
  }
  return cut.trimEnd();
}

const NOTE_LEAD = /^(?:important\s+|drafting\s+|editor'?s\s+|writer'?s\s+|applicant\s+)?notes?(?:\s+(?:on|about|regarding|to|for)\b[^\n:—–]{0,80})?\s*[*_]*\s*[:—–]/i;
const NOTE_HEADING = /^notes?\s+(?:on|about|regarding)\s+(?:the\s+)?(?:sources?|source materials?|materials?|information|placeholders?|this draft|drafting|assumptions|inputs?)\b/i;
const NOTE_PATTERNS = [
  NOTE_LEAD,
  NOTE_HEADING,
  /^(?:the\s+)?applicants?\s+(?:should|must|will need to|needs? to|is advised|are advised|may wish|is encouraged|are encouraged)\b/i,
  /^please\s+(?:insert|add|provide|replace|fill|confirm|verify|update|review)\b/i,
  /^(?:the\s+)?(?:source|supporting|provided|available|applicant'?s?)\s+(?:materials?|documents?|information)\s+(?:do(?:es)?|did|does)\s+not\b/i,
  /^(?:this|the)\s+(?:section|draft)\s+(?:has been|was|is)\s+(?:drafted|written|left|prepared)\b[^.]*\b(?:materials?|information|placeholders?|provided)\b/i,
];

function isNoteBlock(block) {
  const text = block
    .trim()
    .replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+)/, '')
    .replace(/^[*_[(\s]+/, '')
    .trim();
  return NOTE_PATTERNS.some((pattern) => pattern.test(text));
}

const PLACEHOLDER_LABEL = /\[\s*(?:bracketed\s+)?placeholder\s*[:—–-]\s*/gi;
const EXPLANATION = /\s*(?:[;—–]|\s-\s|\.\s|,\s|\(\s*)(?=[^\]]*\b(?:not (?:provided|included|specified|stated|available|given|found|mentioned)|source materials?|(?:the|provided|supporting|applicant'?s?) (?:materials?|documents?)|applicant (?:should|must|did|has|to)|please|was not|were not)\b)/i;

/** Brackets keep only the name of the missing fact, never why it is missing. */
function shortenPlaceholders(markdown) {
  return markdown
    .replace(PLACEHOLDER_LABEL, '[')
    .replace(/\[([^[\]\n]{2,})\](?!\()/g, (whole, inner) => {
      const at = inner.search(EXPLANATION);
      if (at <= 0) return whole;
      return `[${inner.slice(0, at).replace(/[\s,;:(—–-]+$/, '')}]`;
    });
}

/** The section without notes to the applicant; removed counts the dropped paragraphs. */
export function stripNotes(markdown) {
  const blocks = String(markdown ?? '').split(/\n[ \t]*\n/);
  const kept = blocks.filter((block) => !isNoteBlock(block));
  const text = dropDanglingEnd(shortenPlaceholders(kept.join('\n\n')).replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*\n+/, ''));
  return { text, removed: blocks.length - kept.length };
}

export function limitText(limit) {
  return `${limit.max.toLocaleString('en-US')} ${limit.unit}`;
}

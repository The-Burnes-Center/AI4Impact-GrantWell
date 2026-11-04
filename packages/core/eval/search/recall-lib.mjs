// Pure parts of the search recall eval: query sets, metrics and the fusion sweep.
import { US_STATES, words } from "../../lib/chatbot-api/functions/landing-page/ai-grant-search/search-core.mjs";
import { summaryContent } from "../../lib/chatbot-api/functions/landing-page/ai-grant-search/grant-text.mjs";

const TITLE_NOISE = new Set(["program", "programs", "grant", "grants", "project", "projects", "fy", "fiscal", "year", "nofo", "notice", "funding", "opportunity", "solicitation", "rfa", "rfp", "the", "of", "and", "for", "to", "in", "a", "an", "on"]);

/** A seeded shuffle, so a rerun samples the same grants and queries. */
export function seededShuffle(items, seed = 1) {
  const out = [...items];
  let x = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The title as a person would type it: no fiscal years, years, funding numbers or bracketed codes. */
export function cleanTitle(name) {
  return String(name)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b[A-Z]{1,6}[-‐–][A-Z0-9-]*\d[A-Z0-9-]*\b/g, " ")
    .replace(/\bFY\s?-?\d{2,4}(-\d{2,4})?\b/gi, " ")
    .replace(/\b(19|20)\d{2}(-\d{2,4})?\b/g, " ")
    .split(/\s+/)
    .flatMap((w) => words(w))
    .filter((w) => !/\d/.test(w) && !["fy", "nofo", "rfa", "rfp"].includes(w))
    .join(" ")
    .trim();
}

export const normalizeTitle = (name) => cleanTitle(name).replace(/\s+/g, " ");

/**
 * Two title-derived queries per grant, as in the 2026-09-21 recall test: the cleaned title, and its
 * three rarest words in title order. Relevant: the grant and any grant with the same cleaned title.
 */
export function titleQueries(names, sample, perGrant = 2) {
  const df = new Map();
  for (const name of names) for (const w of new Set(words(cleanTitle(name)))) df.set(w, (df.get(w) ?? 0) + 1);
  const byTitle = new Map();
  for (const name of names) {
    const t = normalizeTitle(name);
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(name);
  }
  const queries = [];
  for (const name of sample) {
    const title = normalizeTitle(name);
    if (title.length < 3) continue;
    const relevant = byTitle.get(title) ?? [name];
    const variants = [title];
    const keys = words(title).filter((w) => !TITLE_NOISE.has(w) && w.length > 2);
    const rare = [...new Set(keys)].sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0)).slice(0, 3);
    const short = keys.filter((w) => rare.includes(w)).filter((w, i, a) => a.indexOf(w) === i).join(" ");
    if (short.length >= 3 && short !== title) variants.push(short);
    for (const query of variants.slice(0, perGrant)) queries.push({ kind: "title", query, relevant, source: name });
  }
  return queries;
}

const TOPIC_WORDS = {
  Agriculture: "farm", Arts: "arts", "Business and Commerce": "small business", "Community Development": "community development",
  "Disaster Prevention and Relief": "disaster", Education: "education", "Employment, Labor, and Training": "workforce", Energy: "energy",
  Environment: "environment", "Food and Nutrition": "food", Health: "health", Housing: "housing", Humanities: "humanities",
  "Income Security and Social Services": "social services", "Law, Justice, and Legal Services": "justice", "Natural Resources": "conservation",
  "Regional Development": "rural development", "Science, Technology, and Other Research and Development": "research", Transportation: "transportation",
};

/**
 * Short "<state> <topic>" queries, the shape that returned junk before. With state grants in that
 * topic, they are relevant; for a state with none, the topic's federal grants are.
 */
export function stateQueries(metas, { limit = 40, absent = 10, seed = 1 } = {}) {
  const pairs = new Map();
  for (const [name, m] of metas) {
    if (m.scope !== "state" || !m.state || !TOPIC_WORDS[m.category]) continue;
    const key = `${m.state}|${m.category}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(name);
  }
  const present = seededShuffle([...pairs], seed).slice(0, limit).map(([key, relevant]) => {
    const [state, category] = key.split("|");
    return { kind: "state", query: `${US_STATES[state]?.toLowerCase() ?? state} ${TOPIC_WORDS[category]}`, relevant, state, category };
  });

  const federalByCategory = new Map();
  for (const [name, m] of metas) {
    if ((m.scope ?? "federal") !== "federal" || !TOPIC_WORDS[m.category]) continue;
    if (!federalByCategory.has(m.category)) federalByCategory.set(m.category, []);
    federalByCategory.get(m.category).push(name);
  }
  const statesWithGrants = new Set([...metas.values()].filter((m) => m.scope === "state").map((m) => m.state));
  const otherStates = seededShuffle(Object.keys(US_STATES).filter((s) => !statesWithGrants.has(s)), seed);
  const categories = seededShuffle([...federalByCategory.keys()], seed + 1);
  const missing = [];
  for (let i = 0; i < Math.min(absent, otherStates.length) && categories.length; i++) {
    const category = categories[i % categories.length];
    missing.push({
      kind: "state-absent",
      query: `${US_STATES[otherStates[i]].toLowerCase()} ${TOPIC_WORDS[category]}`,
      relevant: federalByCategory.get(category),
      state: otherStates[i],
      category,
    });
  }
  return [...present, ...missing];
}

export const NEED_SYSTEM = "You write realistic search queries for testing a grant search engine.";

export function needPrompt(name, meta, summary, count) {
  const c = summaryContent(summary);
  const facts = [
    `Grant: ${name}`,
    meta?.agency && `Agency: ${meta.agency}`,
    meta?.category && `Category: ${meta.category}`,
    c.eligibility.length && `Eligibility:\n${c.eligibility.join("\n")}`,
    c.narrative.length && `Application sections:\n${c.narrative.join("\n")}`,
  ].filter(Boolean).join("\n\n").slice(0, 8000);
  return `<grant>\n${facts}\n</grant>

Write ${count} different searches a person might type into a grant search box when their organization needs funding like this. Describe the need or the project in plain words, 5 to 14 words each. Don't use the grant's name, program name, acronyms, the agency's name or the word "grant". One search per line, no numbering or quotes.`;
}

export function parseNeedQueries(text, count) {
  return String(text)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length >= 10 && l.split(/\s+/).length >= 3)
    .slice(0, count);
}

export function rankOf(results, relevant) {
  const set = relevant instanceof Set ? relevant : new Set(relevant);
  const i = results.findIndex((name) => set.has(name));
  return i < 0 ? null : i + 1;
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** recall@30, top-1, top-3 and MRR over rows of {rank}, plus junk@5 where rows carry it. */
export function summarize(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const share = (f) => Math.round((rows.filter(f).length / n) * 1000) / 10;
  const junk = rows.filter((r) => r.junk5 !== undefined);
  return {
    n,
    recall30: share((r) => r.rank !== null && r.rank <= 30),
    top1: share((r) => r.rank === 1),
    top3: share((r) => r.rank !== null && r.rank <= 3),
    mrr: Math.round((rows.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / n) * 1000) / 1000,
    ...(junk.length && { junk5: Math.round((junk.reduce((s, r) => s + r.junk5, 0) / junk.length) * 1000) / 10 }),
    errors: rows.filter((r) => r.error).length,
  };
}

/** Share of the top five results outside the query's topic, for the state queries. */
export function junkAt5(results, metas, category) {
  const top = results.slice(0, 5);
  if (!top.length) return 0;
  return top.filter((name) => metas.get(name)?.category !== category).length / top.length;
}

/**
 * Re-fuses precomputed BM25 and cosine scores under different weights, thresholds and semantic
 * floors, the way rankHybrid does, and returns the ranked names.
 */
export function fuse(index, { bm25, cos, wordCount }, { short, long, floorRank }) {
  const { bm25Weight, semanticWeight, threshold } = wordCount <= 3 ? short : long;
  const ranked = Array.from(cos).filter((c) => c > -1).sort((a, b) => b - a);
  const max = ranked[0] ?? 0;
  const floor = ranked.length ? ranked[Math.min(floorRank, ranked.length) - 1] : 0;
  const range = max - floor || 1;
  const out = [];
  for (let d = 0; d < index.docs.length; d++) {
    const b = bm25.get(d) ?? 0;
    const s = cos[d] > floor ? (cos[d] - floor) / range : 0;
    const combined = bm25Weight * b + semanticWeight * s;
    if (combined > threshold) out.push([d, combined]);
  }
  out.sort((x, y) => y[1] - x[1]);
  return out.slice(0, 50).map(([d]) => index.docs[d].name);
}

export function sweepGrid() {
  const grid = [];
  for (const sb of [0.5, 0.65, 0.8])
    for (const st of [0.3, 0.38, 0.46])
      for (const lb of [0.25, 0.4, 0.55])
        for (const lt of [0.3, 0.4])
          for (const floorRank of [30, 60, 120])
            grid.push({ short: { bm25Weight: sb, semanticWeight: 1 - sb, threshold: st }, long: { bm25Weight: lb, semanticWeight: 1 - lb, threshold: lt }, floorRank });
  return grid;
}

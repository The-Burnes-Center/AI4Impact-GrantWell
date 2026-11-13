/**
 * The per-grant search index: tokenizing, the binary file the builder writes and the search Lambda
 * reads, and in-memory BM25 + cosine scoring. No AWS calls here.
 *
 * File layout: "GWSI" | uint32 header length | header JSON | sections, each 8-byte aligned.
 * Vectors are int8 with a per-vector factor (1 / |q|), so a dot product with a unit query is a cosine.
 */

export const INDEX_FORMAT = 1;
export const EMBEDDING_DIM = 1024;
export const SEARCH_PREFIX = "_search/";
export const POINTER_KEY = `${SEARCH_PREFIX}current.json`;
export const BUILDS_PREFIX = `${SEARCH_PREFIX}builds/`;

const MAGIC = "GWSI";

export const FIELD_WEIGHTS = { name: 3, agency: 1.5, category: 1.5, body: 1 };
const MAX_TF = 255;

const BM25_K1 = 1.2;
const BM25_B = 0.6;
export const BM25_MIN_SHOULD_MATCH = 0.8;
const FUZZY_PREFIX_LENGTH = 2;
const FUZZY_WEIGHT = 0.7;

// Function words only; domain words like "grant" stay in the index and are dropped at query time.
const INDEX_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "by", "at", "as", "is", "are",
  "be", "been", "was", "were", "this", "that", "these", "those", "it", "its", "from", "will", "may",
  "must", "can", "not", "no", "all", "any", "such", "which", "who", "their", "they", "them", "has",
  "have", "had", "if", "than", "then", "into", "per", "each", "other", "also", "should", "shall",
]);

export const QUERY_STOP_WORDS = new Set([
  ...INDEX_STOP_WORDS,
  "grants", "grant", "funding", "fund", "funds", "opportunities", "opportunity",
  "programs", "program", "support", "related", "federal", "state", "local", "national", "government",
  "looking", "need", "needs", "want", "help", "find", "money",
]);

export const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const STATE_PHRASES = Object.entries(US_STATES)
  .map(([code, name]) => ({ code, words: words(name) }))
  .sort((a, b) => b.words.length - a.words.length);

export function words(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

export function stem(word) {
  if (word.length <= 3 || /^\d+$/.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function indexTokens(text) {
  return words(text).filter((w) => !INDEX_STOP_WORDS.has(w)).map(stem);
}

/** The first US state named in the query (longest name first), and the words left without it. */
export function findQueryState(query) {
  const tokens = words(query);
  for (const { code, words: phrase } of STATE_PHRASES) {
    for (let i = 0; i + phrase.length <= tokens.length; i++) {
      if (phrase.every((w, j) => tokens[i + j] === w)) {
        return { code, rest: [...tokens.slice(0, i), ...tokens.slice(i + phrase.length)] };
      }
    }
  }
  return { code: null, rest: tokens };
}

export function queryTerms(tokens) {
  return [...new Set(tokens.filter((w) => !QUERY_STOP_WORDS.has(w) && w.length > 1).map(stem))];
}

/** Weighted term frequencies for one grant's fields: {term: tf}, and the weighted length. */
export function fieldTermFrequencies(fields) {
  const tf = new Map();
  let length = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    for (const token of indexTokens(fields[field])) {
      tf.set(token, (tf.get(token) ?? 0) + weight);
      length += weight;
    }
  }
  return { tf, length };
}

// ── int8 vectors ──

export function quantize(vector) {
  let maxAbs = 0;
  for (const v of vector) maxAbs = Math.max(maxAbs, Math.abs(v));
  const q = new Int8Array(vector.length);
  if (maxAbs === 0) return { q, factor: 0 };
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    q[i] = Math.round((vector[i] / maxAbs) * 127);
    norm += q[i] * q[i];
  }
  return { q, factor: norm > 0 ? 1 / Math.sqrt(norm) : 0 };
}

// ── file encode / decode ──

const align8 = (n) => (n + 7) & ~7;

/**
 * docs: [{name, agency, category, grantType, scope, state, status, expirationDate, isRolling, hash,
 *         fields: {name, agency, category, body}, vectors: [{q: Int8Array, factor}]}]
 */
export function encodeIndex({ buildId, builtAt, dims = EMBEDDING_DIM, views = [], docs }) {
  const vocab = new Map();
  const perDoc = docs.map((doc) => {
    const { tf, length } = fieldTermFrequencies(doc.fields ?? {});
    for (const term of tf.keys()) if (!vocab.has(term)) vocab.set(term, 0);
    return { tf, length };
  });
  const terms = [...vocab.keys()].sort();
  terms.forEach((t, i) => vocab.set(t, i));

  const postingLists = terms.map(() => []);
  perDoc.forEach(({ tf }, d) => {
    for (const [term, f] of tf) postingLists[vocab.get(term)].push([d, Math.min(MAX_TF, Math.round(f))]);
  });
  const totalPostings = postingLists.reduce((s, l) => s + l.length, 0);
  const wideDocIds = docs.length > 0xffff;

  const vecDoc = [];
  const vecRows = [];
  docs.forEach((doc, d) => {
    for (const v of doc.vectors ?? []) {
      if (v.q.length !== dims) throw new Error(`vector for ${doc.name} has ${v.q.length} dims, expected ${dims}`);
      vecDoc.push(d);
      vecRows.push(v);
    }
  });

  const sections = {};
  let offset = 0;
  const reserve = (name, bytes) => {
    sections[name] = { offset, bytes };
    offset = align8(offset + bytes);
  };
  reserve("postOffsets", (terms.length + 1) * 4);
  reserve("postDocs", totalPostings * (wideDocIds ? 4 : 2));
  reserve("postTf", totalPostings);
  reserve("docLen", docs.length * 4);
  reserve("vecDoc", vecRows.length * 4);
  reserve("vecFactor", vecRows.length * 4);
  reserve("vectors", vecRows.length * dims);

  const header = {
    format: INDEX_FORMAT,
    buildId,
    builtAt,
    dims,
    views,
    wideDocIds,
    avgDocLen: perDoc.length ? perDoc.reduce((s, p) => s + p.length, 0) / perDoc.length : 0,
    docs: docs.map((d) => ({
      name: d.name,
      agency: d.agency ?? null,
      category: d.category ?? null,
      grantType: d.grantType ?? null,
      scope: d.scope ?? null,
      state: d.state ?? null,
      status: d.status ?? null,
      expirationDate: d.expirationDate ?? null,
      isRolling: Boolean(d.isRolling),
      hash: d.hash ?? null,
    })),
    terms,
    sections,
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const dataStart = align8(8 + headerBytes.length);
  const out = Buffer.alloc(dataStart + offset);
  out.write(MAGIC, 0, "ascii");
  out.writeUInt32LE(headerBytes.length, 4);
  headerBytes.copy(out, 8);

  const view = (Type, name) => new Type(out.buffer, out.byteOffset + dataStart + sections[name].offset, sections[name].bytes / Type.BYTES_PER_ELEMENT);
  const postOffsets = view(Uint32Array, "postOffsets");
  const postDocs = view(wideDocIds ? Uint32Array : Uint16Array, "postDocs");
  const postTf = view(Uint8Array, "postTf");
  let p = 0;
  postingLists.forEach((list, t) => {
    postOffsets[t] = p;
    for (const [d, f] of list) {
      postDocs[p] = d;
      postTf[p] = f;
      p++;
    }
  });
  postOffsets[terms.length] = p;
  view(Float32Array, "docLen").set(perDoc.map((x) => x.length));
  view(Uint32Array, "vecDoc").set(vecDoc);
  view(Float32Array, "vecFactor").set(vecRows.map((v) => v.factor));
  const vectors = view(Int8Array, "vectors");
  vecRows.forEach((v, i) => vectors.set(v.q, i * dims));
  return out;
}

export function decodeIndex(input) {
  // A fresh ArrayBuffer: S3 bodies can sit at an offset the typed-array views below can't use.
  const bytes = new Uint8Array(input.byteLength);
  bytes.set(input);
  const buf = Buffer.from(bytes.buffer);
  if (buf.toString("ascii", 0, 4) !== MAGIC) throw new Error("not a search index file");
  const headerLength = buf.readUInt32LE(4);
  const header = JSON.parse(buf.toString("utf8", 8, 8 + headerLength));
  if (header.format !== INDEX_FORMAT) throw new Error(`search index format ${header.format}, expected ${INDEX_FORMAT}`);
  const dataStart = align8(8 + headerLength);
  const view = (Type, name) => new Type(bytes.buffer, dataStart + header.sections[name].offset, header.sections[name].bytes / Type.BYTES_PER_ELEMENT);
  const termIds = new Map();
  header.terms.forEach((t, i) => termIds.set(t, i));
  const byName = new Map();
  header.docs.forEach((d, i) => byName.set(d.name, i));
  return {
    buildId: header.buildId,
    builtAt: header.builtAt,
    dims: header.dims,
    views: header.views,
    docs: header.docs,
    byName,
    terms: header.terms,
    termIds,
    avgDocLen: header.avgDocLen,
    postOffsets: view(Uint32Array, "postOffsets"),
    postDocs: view(header.wideDocIds ? Uint32Array : Uint16Array, "postDocs"),
    postTf: view(Uint8Array, "postTf"),
    docLen: view(Float32Array, "docLen"),
    vecDoc: view(Uint32Array, "vecDoc"),
    vecFactor: view(Float32Array, "vecFactor"),
    vectors: view(Int8Array, "vectors"),
    byteLength: bytes.byteLength,
    fuzzyBuckets: null,
  };
}

/** The int8 vectors stored for a doc, so a rebuild can keep them without re-embedding. */
export function docVectors(index, d) {
  const out = [];
  for (let i = 0; i < index.vecDoc.length; i++) {
    if (index.vecDoc[i] !== d) continue;
    out.push({ q: index.vectors.slice(i * index.dims, (i + 1) * index.dims), factor: index.vecFactor[i] });
  }
  return out;
}

// ── scoring ──

export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Same edit allowance as the OpenSearch query it replaces: fuzziness AUTO:7,10.
export function allowedEdits(term) {
  if (term.length >= 10) return 2;
  if (term.length >= 7) return 1;
  return 0;
}

function fuzzyBuckets(index) {
  if (index.fuzzyBuckets) return index.fuzzyBuckets;
  const buckets = new Map();
  index.terms.forEach((t, i) => {
    if (t.length < FUZZY_PREFIX_LENGTH + 3) return;
    const key = t.slice(0, FUZZY_PREFIX_LENGTH);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });
  index.fuzzyBuckets = buckets;
  return buckets;
}

/** Term ids a query term matches: itself at full weight, near spellings at FUZZY_WEIGHT. */
export function expandTerm(index, term) {
  const out = [];
  const exact = index.termIds.get(term);
  if (exact !== undefined) out.push({ id: exact, weight: 1 });
  const edits = allowedEdits(term);
  if (edits === 0) return out;
  for (const id of fuzzyBuckets(index).get(term.slice(0, FUZZY_PREFIX_LENGTH)) ?? []) {
    if (id === exact) continue;
    if (editDistance(term, index.terms[id], edits) <= edits) out.push({ id, weight: FUZZY_WEIGHT });
  }
  return out;
}

/**
 * BM25 over the weighted fields, normalised by the score a doc would get with every term saturated,
 * so 1.0 means "every query word, many times, in a short doc". A doc must match
 * floor(BM25_MIN_SHOULD_MATCH × terms) of the terms (at least one).
 * Returns Map<docIndex, score in [0,1]>.
 */
export function bm25Scores(index, terms, { minShouldMatch = BM25_MIN_SHOULD_MATCH, allowDoc } = {}) {
  const N = index.docs.length;
  const scores = new Map();
  if (terms.length === 0 || N === 0) return scores;
  const matched = new Map();
  let ideal = 0;
  for (const term of terms) {
    const variants = expandTerm(index, term);
    if (variants.length === 0) {
      ideal += Math.log(1 + N) * (BM25_K1 + 1);
      continue;
    }
    const best = new Map();
    let df = 0;
    for (const { id, weight } of variants) {
      const start = index.postOffsets[id];
      const end = index.postOffsets[id + 1];
      df = Math.max(df, end - start);
      for (let p = start; p < end; p++) {
        const d = index.postDocs[p];
        if (allowDoc && !allowDoc(d)) continue;
        const tf = index.postTf[p];
        const lenNorm = 1 - BM25_B + BM25_B * (index.docLen[d] / (index.avgDocLen || 1));
        const s = (weight * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * lenNorm);
        if (s > (best.get(d) ?? 0)) best.set(d, s);
      }
    }
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    ideal += idf * (BM25_K1 + 1);
    for (const [d, s] of best) {
      scores.set(d, (scores.get(d) ?? 0) + idf * s);
      matched.set(d, (matched.get(d) ?? 0) + 1);
    }
  }
  const need = Math.max(1, Math.floor(minShouldMatch * terms.length + 1e-9));
  const out = new Map();
  for (const [d, s] of scores) {
    if ((matched.get(d) ?? 0) >= need) out.set(d, Math.min(1, s / (ideal || 1)));
  }
  return out;
}

/** Best cosine per doc over its vectors. Returns Float32Array indexed by doc (-1 for docs with none). */
export function cosineScores(index, query) {
  const out = new Float32Array(index.docs.length).fill(-1);
  const dims = index.dims;
  if (!query || query.length !== dims) return out;
  const q = Float32Array.from(query);
  const vectors = index.vectors;
  for (let v = 0; v < index.vecDoc.length; v++) {
    let dot = 0;
    const base = v * dims;
    for (let i = 0; i < dims; i++) dot += q[i] * vectors[base + i];
    const cos = dot * index.vecFactor[v];
    const d = index.vecDoc[v];
    if (cos > out[d]) out[d] = cos;
  }
  return out;
}

export const SCORING = {
  short: { bm25Weight: 0.65, semanticWeight: 0.35, threshold: 0.46 },
  long: { bm25Weight: 0.4, semanticWeight: 0.6, threshold: 0.4 },
};
export const SHORT_QUERY_WORD_LIMIT = 3;
// The kNN query it replaces min-max scaled its top 150 passages; about this many grants.
export const SEMANTIC_FLOOR_RANK = 60;
export const QUERY_STATE_BOOST = 0.12;
export const USER_STATE_BOOST = 0.04;

export function scoringProfile(wordCount, scoring = SCORING) {
  return wordCount <= SHORT_QUERY_WORD_LIMIT ? scoring.short : scoring.long;
}

/**
 * Hybrid ranking over the visible docs. Returns accepted [{name, score, bm25, semantic, reason}]
 * sorted by score, plus the rejected count.
 */
export function rankHybrid(index, { query, embedding, isVisible, userState = null, options = {} }) {
  const scoring = options.scoring ?? SCORING;
  const floorRank = options.semanticFloorRank ?? SEMANTIC_FLOOR_RANK;
  const queryStateBoost = options.queryStateBoost ?? QUERY_STATE_BOOST;
  const userStateBoost = options.userStateBoost ?? USER_STATE_BOOST;

  const visible = new Uint8Array(index.docs.length);
  index.docs.forEach((doc, d) => {
    visible[d] = isVisible(doc.name) ? 1 : 0;
  });
  const allowDoc = (d) => visible[d] === 1;

  const { code: queryState, rest } = findQueryState(query);
  let terms = queryTerms(rest);
  if (terms.length === 0 && queryState) terms = queryTerms(words(query));
  const wordCount = words(query).length;
  const { bm25Weight, semanticWeight, threshold } = scoringProfile(wordCount, scoring);

  const bm25 = bm25Scores(index, terms, { allowDoc, minShouldMatch: options.minShouldMatch });

  const cos = cosineScores(index, embedding);
  const ranked = [];
  for (let d = 0; d < cos.length; d++) if (visible[d] && cos[d] > -1) ranked.push(cos[d]);
  ranked.sort((a, b) => b - a);
  const max = ranked[0] ?? 0;
  const floor = ranked.length ? ranked[Math.min(floorRank, ranked.length) - 1] : 0;
  const range = max - floor || 1;

  const accepted = [];
  let rejected = 0;
  for (let d = 0; d < index.docs.length; d++) {
    if (!visible[d]) continue;
    const b = bm25.get(d) ?? 0;
    const s = cos[d] > floor ? (cos[d] - floor) / range : 0;
    if (b === 0 && s === 0) continue;
    const doc = index.docs[d];
    let combined = bm25Weight * b + semanticWeight * s;
    if (combined <= threshold) {
      rejected++;
      continue;
    }
    if (queryState && doc.state === queryState) combined += queryStateBoost;
    if (userState && doc.scope === "state" && doc.state === userState) combined += userStateBoost;
    const reason = b > 0 && s > 0 ? "Matched by keyword and meaning" : b > 0 ? "Matched by keyword" : "Matched by meaning";
    accepted.push({ name: doc.name, score: Math.round(combined * 100) / 100, bm25: b, semantic: s, reason });
  }
  accepted.sort((x, y) => y.score - x.score || y.bm25 + y.semantic - (x.bm25 + x.semantic));
  return { accepted, rejected, terms, queryState, threshold, bm25Weight, semanticWeight };
}

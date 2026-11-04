import { describe, expect, it } from "vitest";
import {
  bm25Scores,
  cosineScores,
  decodeIndex,
  docVectors,
  encodeIndex,
  findQueryState,
  quantize,
  queryTerms,
  rankHybrid,
  stem,
  USER_STATE_BOOST,
  words,
} from "../../lib/chatbot-api/functions/landing-page/ai-grant-search/search-core.mjs";
import { DIMS, fixtureIndex, syntheticDocs, topicVector } from "./search-index-helpers";

const all = () => true;
const index = (docs: Parameters<typeof fixtureIndex>[0]) => decodeIndex(fixtureIndex(docs));
const names = (idx: any, scores: Map<number, number>) =>
  [...scores].sort((a, b) => b[1] - a[1]).map(([d]) => idx.docs[d].name);

describe("index file", () => {
  it("round-trips docs, terms, postings and int8 vectors", () => {
    const docs = [
      { name: "Bridge Repair Program", topic: 1, agency: "DOT", category: "Transportation", body: "repair bridges and culverts" },
      { name: "Library Grants", topic: 2, scope: "state", state: "MA", body: "public libraries" },
    ];
    const bytes = fixtureIndex(docs);
    const idx = decodeIndex(bytes.subarray(0));
    expect(idx.docs.map((d: any) => [d.name, d.scope, d.state])).toEqual([
      ["Bridge Repair Program", "federal", null],
      ["Library Grants", "state", "MA"],
    ]);
    expect(idx.termIds.has("bridge")).toBe(true);
    expect(idx.termIds.has("repair")).toBe(true);
    const cos = cosineScores(idx, topicVector(1));
    expect(cos[0]).toBeGreaterThan(0.98);
    expect(cos[1]).toBeLessThan(0.2);
    expect(docVectors(idx, 1)).toHaveLength(1);
  });

  it("decodes a body that starts at an odd offset", () => {
    const bytes = fixtureIndex([{ name: "A", topic: 3 }]);
    const shifted = Buffer.alloc(bytes.length + 3);
    bytes.copy(shifted, 3);
    expect(decodeIndex(shifted.subarray(3)).docs[0].name).toBe("A");
  });

  it("rejects a file that isn't an index", () => {
    expect(() => decodeIndex(Buffer.from("{}"))).toThrow(/not a search index/);
  });

  it("keeps cosine within a percent of float after int8 quantization", () => {
    const v = topicVector(5, 2);
    const q = quantize(v);
    let dot = 0;
    for (let i = 0; i < DIMS; i++) dot += v[i] * q.q[i];
    expect(dot * q.factor).toBeGreaterThan(0.99);
  });
});

describe("tokens", () => {
  it("stems plurals the same way at index and query time", () => {
    expect(stem("schools")).toBe("school");
    expect(stem("libraries")).toBe("library");
    expect(stem("business")).toBe("business");
    expect(words("Café-Owners' FY2027")).toEqual(["cafe", "owners", "fy2027"]);
  });

  it("drops search filler words from queries", () => {
    expect(queryTerms(words("housing grants for the state"))).toEqual(["housing"]);
  });

  it("finds a multi-word state in a query", () => {
    expect(findQueryState("north carolina housing")).toEqual({ code: "NC", rest: ["housing"] });
    expect(findQueryState("west virginia broadband")).toEqual({ code: "WV", rest: ["broadband"] });
    expect(findQueryState("affordable housing").code).toBeNull();
  });
});

describe("BM25", () => {
  const idx = index([
    { name: "Rural Transit Buses", topic: 1, body: "replace diesel buses with electric buses for rural transit" },
    { name: "Urban Parks", topic: 2, body: "park improvements, playgrounds, and one mention of buses" },
    { name: "Library Services", topic: 3, body: "libraries and reading programs" },
    { name: "Electric Vehicle Charging", topic: 4, body: "charging stations for electric vehicles" },
  ]);

  it("ranks the doc with the term in its name and body above a passing mention", () => {
    const scores = bm25Scores(idx, queryTerms(words("buses")));
    expect(names(idx, scores)).toEqual(["Rural Transit Buses", "Urban Parks"]);
    const [top, second] = [...scores.values()].sort((a, b) => b - a);
    expect(top).toBeLessThanOrEqual(1);
    expect(top).toBeGreaterThan(second);
  });

  it("requires 80% of the query terms", () => {
    expect(names(idx, bm25Scores(idx, queryTerms(words("electric buses rural"))))).toEqual(["Rural Transit Buses"]);
    expect(names(idx, bm25Scores(idx, queryTerms(words("electric buses"))))).toEqual(
      expect.arrayContaining(["Rural Transit Buses", "Electric Vehicle Charging", "Urban Parks"])
    );
  });

  it("forgives a typo in a long word, not in a short one", () => {
    expect(names(idx, bm25Scores(idx, ["librarie"]))).toEqual([]);
    expect(names(idx, bm25Scores(idx, queryTerms(words("playgrunds"))))).toEqual(["Urban Parks"]);
    expect(names(idx, bm25Scores(idx, queryTerms(words("bsues"))))).toEqual([]);
  });

  it("scores only allowed docs", () => {
    const scores = bm25Scores(idx, ["buse"], { allowDoc: (d: number) => idx.docs[d].name !== "Rural Transit Buses" });
    expect(names(idx, scores)).toEqual(["Urban Parks"]);
  });
});

describe("hybrid ranking", () => {
  const docs = [
    { name: "Affordable Housing Trust NC", topic: 10, scope: "state", state: "NC", category: "Housing", body: "North Carolina affordable housing rental units" },
    { name: "HOME Investment Partnerships", topic: 10, category: "Housing", body: "affordable housing for low income families" },
    { name: "Tribal Opioid Response", topic: 20, category: "Health", body: "opioid treatment; tribes in North Carolina and other states" },
    { name: "Massachusetts Housing Fund", topic: 10, scope: "state", state: "MA", category: "Housing", body: "housing in Massachusetts" },
    ...Array.from({ length: 80 }, (_, i) => ({ name: `Filler ${i}`, topic: 100 + i, body: `unrelated topic ${i}` })),
  ];
  const idx = index(docs);
  const housingQuery = topicVector(10, 0.6, 77);

  it("keeps a short state-name query on topic", () => {
    const { accepted, queryState, terms } = rankHybrid(idx, { query: "north carolina housing", embedding: housingQuery, isVisible: all });
    expect(queryState).toBe("NC");
    expect(terms).toEqual(["housing"]);
    expect(accepted[0].name).toBe("Affordable Housing Trust NC");
    expect(accepted.map((r: any) => r.name)).not.toContain("Tribal Opioid Response");
  });

  it("boosts the searching user's own state grants", () => {
    const run = (userState: string | null) =>
      Object.fromEntries(rankHybrid(idx, { query: "housing", embedding: housingQuery, isVisible: all, userState }).accepted.map((r: any) => [r.name, r.score]));
    const [ma, none] = [run("MA"), run(null)];
    expect(ma["Massachusetts Housing Fund"] - none["Massachusetts Housing Fund"]).toBeCloseTo(USER_STATE_BOOST, 2);
    expect(ma["HOME Investment Partnerships"]).toBe(none["HOME Investment Partnerships"]);
    expect(ma["Affordable Housing Trust NC"]).toBe(none["Affordable Housing Trust NC"]);
  });

  it("never scores a grant the caller can't see", () => {
    const visible = (name: string) => name !== "Affordable Housing Trust NC";
    const { accepted } = rankHybrid(idx, { query: "north carolina housing", embedding: housingQuery, isVisible: visible });
    expect(accepted.map((r: any) => r.name)).not.toContain("Affordable Housing Trust NC");
  });

  it("uses the long-query profile past three words", () => {
    expect(rankHybrid(idx, { query: "housing", embedding: housingQuery, isVisible: all }).threshold).toBe(0.46);
    expect(rankHybrid(idx, { query: "rental housing for low income families", embedding: housingQuery, isVisible: all }).threshold).toBe(0.4);
  });

  it("finds by meaning alone when no keyword matches", () => {
    const { accepted } = rankHybrid(idx, { query: "a place to live for families", embedding: housingQuery, isVisible: all });
    expect(accepted[0].reason).toBe("Matched by meaning");
    expect(["HOME Investment Partnerships", "Affordable Housing Trust NC", "Massachusetts Housing Fund"]).toContain(accepted[0].name);
  });

  it("skips the semantic side when the embedding has the wrong size", () => {
    const { accepted } = rankHybrid(idx, { query: "housing", embedding: [1, 0, 0], isVisible: all });
    expect(accepted.every((r: any) => r.semantic === 0)).toBe(true);
  });
});

describe("latency on a 2,500-grant index", () => {
  const docs = syntheticDocs(2500);

  it("loads in well under a second and ranks a query in under 50 ms", () => {
    const t0 = performance.now();
    const bytes = encodeIndex({ buildId: "bench", builtAt: "", dims: DIMS, views: ["card", "detail"], docs });
    const encodeMs = performance.now() - t0;

    const t1 = performance.now();
    const idx = decodeIndex(bytes);
    const decodeMs = performance.now() - t1;

    const queries = ["term1 term2", "term3a program", "termzz9 termab term4f term12", "massachusetts term5"];
    const times: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t = performance.now();
      rankHybrid(idx, { query: queries[i % queries.length], embedding: topicVector(i, 1, i + 5), isVisible: (n: string) => !n.endsWith("0 program"), userState: "MA" });
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)];
    const p90 = times[Math.floor(times.length * 0.9)];
    console.log(JSON.stringify({
      bench: "search-index-2500", bytes: bytes.length, mb: Math.round((bytes.length / 1e6) * 100) / 100,
      encodeMs: Math.round(encodeMs), decodeMs: Math.round(decodeMs), rankP50Ms: Math.round(p50 * 10) / 10, rankP90Ms: Math.round(p90 * 10) / 10,
    }));
    expect(bytes.length).toBeLessThan(12e6);
    expect(decodeMs).toBeLessThan(500);
    expect(p50).toBeLessThan(50);
    expect(p90).toBeLessThan(100);
  });
});

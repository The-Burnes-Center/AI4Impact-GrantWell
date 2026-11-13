import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  fuse,
  junkAt5,
  parseNeedQueries,
  rankOf,
  stateQueries,
  summarize,
  titleQueries,
} from "../../eval/search/recall-lib.mjs";
import { bm25Scores, cosineScores, decodeIndex } from "../../lib/chatbot-api/functions/landing-page/ai-grant-search/search-core.mjs";
import { fixtureIndex, topicVector } from "./search-index-helpers";

describe("search recall eval", () => {
  it("cleans fiscal years, funding numbers and codes out of titles", () => {
    expect(cleanTitle("FY 2027 Industrial Rail Access Program (IRAP)")).toBe("industrial rail access program");
    expect(cleanTitle("HHS-2026-ACF-OCS-EE-0123 Community Services Block Grant")).toBe("community services block grant");
    expect(cleanTitle("2027-28 AmeriCorps Competitive Program Grants")).toBe("americorps competitive program grants");
  });

  it("makes a title query and a rare-word query, counting same-titled grants as relevant", () => {
    const names = ["FY2026 Rural Bus Program", "FY2027 Rural Bus Program", "Urban Bus Program", "Rural Libraries"];
    const qs = titleQueries(names, ["FY2026 Rural Bus Program"]);
    expect(qs.map((q) => q.query)).toEqual(["rural bus program", "rural bus"]);
    expect(qs[0].relevant).toEqual(["FY2026 Rural Bus Program", "FY2027 Rural Bus Program"]);
  });

  it("builds state queries for states with grants and for states without", () => {
    const metas = new Map<string, any>([
      ["MA Housing", { scope: "state", state: "MA", category: "Housing" }],
      ["HOME", { category: "Housing" }],
      ["Transit", { category: "Transportation" }],
    ]);
    const qs = stateQueries(metas, { limit: 5, absent: 2 });
    expect(qs[0]).toMatchObject({ kind: "state", query: "massachusetts housing", relevant: ["MA Housing"] });
    const absent = qs.filter((q) => q.kind === "state-absent");
    expect(absent).toHaveLength(2);
    for (const q of absent) expect(q.state).not.toBe("MA");
  });

  it("parses Haiku's need queries", () => {
    expect(parseNeedQueries('1. "replace our old diesel buses with electric"\n- fix\n- money to train nurses in rural clinics', 2)).toEqual([
      "replace our old diesel buses with electric",
      "money to train nurses in rural clinics",
    ]);
  });

  it("scores ranks", () => {
    expect(rankOf(["a", "b", "c"], ["c", "x"])).toBe(3);
    expect(rankOf(["a"], ["x"])).toBeNull();
    expect(summarize([{ rank: 1 }, { rank: 4 }, { rank: null }, { rank: 40 }])).toMatchObject({
      n: 4, recall30: 50, top1: 25, top3: 25, mrr: Math.round(((1 + 0.25 + 1 / 40) / 4) * 1000) / 1000,
    });
    const metas = new Map<string, any>([["a", { category: "Housing" }], ["b", { category: "Health" }]]);
    expect(junkAt5(["a", "b"], metas, "Housing")).toBe(0.5);
  });

  it("re-fuses precomputed scores like the search does", () => {
    const idx = decodeIndex(fixtureIndex([
      { name: "Bus", topic: 1, body: "buses" },
      { name: "Parks", topic: 2, body: "parks" },
      ...Array.from({ length: 10 }, (_, i) => ({ name: `F${i}`, topic: 10 + i })),
    ]));
    const pre = { bm25: bm25Scores(idx, ["buse"]), cos: cosineScores(idx, topicVector(1)), wordCount: 1 };
    const params = { short: { bm25Weight: 0.65, semanticWeight: 0.35, threshold: 0.3 }, long: { bm25Weight: 0.4, semanticWeight: 0.6, threshold: 0.3 }, floorRank: 60 };
    expect(fuse(idx, pre, params)[0]).toBe("Bus");
  });
});

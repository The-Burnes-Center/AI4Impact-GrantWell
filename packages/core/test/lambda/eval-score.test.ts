import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const bedrock = mockClient(BedrockRuntimeClient);
const reply = (obj: object) =>
  ({ body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(obj) }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } })) }) as any;

const gold = (over: object = {}) => ({
  schemaVersion: 1,
  status: "checked",
  family: "DOJ",
  deadlines: [{ kind: "application", label: "Full application", date: "2026-11-09", time: "20:59", tzAsWritten: "ET", quote: "x" }],
  award: { ceiling: 750000 },
  sections: [
    { name: "Need", order: 1, limit: { type: "pages", value: 1 }, quote: "x" },
    { name: "Design", order: 2, limit: null, quote: "x" },
  ],
  criteria: [
    { name: "Need", scored: true, points: 30, weightPct: null, quote: "x" },
    { name: "Budget", scored: false, points: null, weightPct: null, quote: "x" },
  ],
  format: { font: "Times New Roman", other: [] },
  eligibility: [{ item: "Nonprofits", quote: "x" }],
  requiredDocuments: [{ item: "Budget narrative", userWrites: true, quote: "x" }],
  libraryRequired: ["Specific Aims"],
  ...over,
});
const summary = (over: object = {}) => ({
  EligibilityCriteria: [{ item: "Eligible", description: "Nonprofits may apply." }],
  RequiredDocuments: [{ item: "Budget", description: "A budget narrative." }],
  ProjectNarrativeSections: [
    { item: "Need", description: "Not to exceed 1 page." },
    { item: "Need statement", description: "Describe the need." },
  ],
  KeyDeadlines: [{ item: "Application", description: "November 9, 2026, 8:59 p.m. ET" }],
  application_deadline: "2026-11-09",
  ...over,
});

const stub = (pairs: Record<string, { key: number; predicted: number }[]> = {}) => ({
  pair: vi.fn(async (field: string) => pairs[field] ?? []),
  find: vi.fn(async (_field: string, keys: string[]) => keys.map((_, i) => ({ id: i, found: true, valueCorrect: true, evidence: "e" }))),
});

let h: any;
beforeAll(async () => {
  const env = await import("../../eval/lib/env.mjs");
  env.configure();
  h = {
    aws: await import("../../eval/lib/aws.mjs"),
    ...(await import("../../eval/score/extract.mjs")),
    ...(await import("../../eval/score/judge.mjs")),
    bars: await import("../../eval/score/bars.mjs"),
  };
});
beforeEach(() => {
  bedrock.reset();
  h.aws.install();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("eval scorers", () => {
  it("scores the application date in code, accepting a rolling grant with no date", async () => {
    const exact = await h.scoreExtract(gold(), { summary: summary() }, stub());
    expect(exact.counts["deadline.dateExact"]).toEqual([1, 1]);
    const wrong = await h.scoreExtract(gold(), { summary: summary({ application_deadline: "2026-11-02" }) }, stub());
    expect(wrong.counts["deadline.dateExact"]).toEqual([0, 1]);
    const rolling = gold({ deadlines: [{ kind: "application", label: "Rolling", date: null, time: null, quote: "x" }] });
    expect((await h.scoreExtract(rolling, { summary: summary({ application_deadline: null }) }, stub())).counts["deadline.dateExact"]).toEqual([1, 1]);
  });

  it("counts duplicates, library sections and only scored criteria", async () => {
    const judge = stub({ "narrative sections": [{ key: 0, predicted: 0 }, { key: 0, predicted: 1 }] });
    const r = await h.scoreExtract(gold(), { summary: summary() }, judge);
    expect(r.counts["sections.recall"]).toEqual([1, 3]);
    expect(r.counts["sections.duplicatePairs"]).toEqual([1, 1]);
    expect(r.counts["library.present"]).toEqual([0, 1]);
    expect(r.counts["criteria.recall"]).toEqual([1, 1]);
    expect(judge.find.mock.calls.find((c: any) => c[0] === "scored review criteria")[1]).toEqual(["Need (30 points)"]);
  });

  it("exempts a key with no sections from the zero-sections bar", async () => {
    const r = await h.scoreExtract(gold({ sections: [], libraryRequired: [] }), { summary: summary({ ProjectNarrativeSections: [] }) }, stub());
    expect(r.counts["sections.zeroGrants"]).toEqual([0, 1]);
    const missed = await h.scoreExtract(gold(), { summary: summary({ ProjectNarrativeSections: [] }) }, stub());
    expect(missed.counts["sections.zeroGrants"]).toEqual([1, 1]);
  });

  it("scores the Describe share of questions in code", async () => {
    const q = { questions: [{ question: "Describe the need." }, { question: "How many residents?" }] };
    expect((await h.scoreQuestions(gold(), q, stub())).counts["questions.describeShare"]).toEqual([1, 2]);
  });

  it("drops judge pairs whose evidence is not in the predicted item", async () => {
    bedrock.on(InvokeModelCommand).resolves(reply({ pairs: [{ key: 0, predicted: 0, evidence: "Nonprofits may apply" }, { key: 1, predicted: 0, evidence: "invented words" }] }));
    const j = h.judge({ haiku: "haiku", sonnet: "sonnet" });
    const { output } = await h.aws.inScope({}, () => j.pair("eligibility", ["Nonprofits", "Tribes"], ["Eligible: Nonprofits may apply."]));
    expect(output).toEqual([{ key: 0, predicted: 0, evidence: "Nonprofits may apply" }]);
  });

  it("treats a find without real evidence as not found", async () => {
    bedrock.on(InvokeModelCommand).resolves(reply({ items: [{ id: 0, found: true, evidence: "not in the text", valueCorrect: true }] }));
    const j = h.judge({ haiku: "haiku", sonnet: "sonnet" });
    const { output } = await h.aws.inScope({}, () => j.find("criteria", ["Need (30 points)"], "Need is scored at 30 points."));
    expect(output[0].found).toBe(false);
  });

  it("applies max bars and leaves untracked bars ungated", () => {
    expect(h.bars.verdict("sections.duplicatePairs", 3)).toBe(true);
    expect(h.bars.verdict("questions.describeShare", 0.5)).toBe(false);
    expect(h.bars.verdict("draft.trapsHandled", 0.1)).toBe(null);
  });
});

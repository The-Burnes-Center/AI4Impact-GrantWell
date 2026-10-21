// usage: node eval/score.mjs <run dir> [--golden <dir>] [--baseline <file>] [--concurrency 4]
// Scores a run written by eval/run.mjs against the golden answer keys; writes score.json and score.md into the run dir.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { install, inScope, withStage } = await import("./lib/aws.mjs");
const { configure } = await import("./lib/env.mjs");
const { GOLDEN_DIR, loadGrants, readOptional } = await import("./lib/golden.mjs");
const { pool } = await import("./lib/pool.mjs");
const { totals } = await import("./lib/cost.mjs");
const { BARS, verdict } = await import("./score/bars.mjs");
const { judge: makeJudge } = await import("./score/judge.mjs");
const { scoreExtract, scoreQuestions } = await import("./score/extract.mjs");
const { scoreChat, scoreDraft } = await import("./score/chat-draft.mjs");

const EVAL_DIR = path.dirname(new URL(import.meta.url).pathname);
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    golden: { type: "string", default: GOLDEN_DIR },
    baseline: { type: "string", default: path.join(EVAL_DIR, "baseline.json") },
    concurrency: { type: "string", default: "4" },
  },
});
const runDir = positionals[0];
if (!runDir || !fs.existsSync(path.join(runDir, "run.json"))) {
  console.error("usage: node eval/score.mjs <run dir>");
  process.exit(2);
}
const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
const models = configure();
install();
const judge = makeJudge(models);
const grants = new Map(loadGrants(values.golden).map((g) => [g.slug, g]));

async function scoreOne(row) {
  const grant = grants.get(row.slug);
  const gold = grant && readOptional(grant, "gold.json");
  if (!gold) return { slug: row.slug, error: "no answer key" };
  if (row.error || !row.output) return { slug: row.slug, error: `run failed: ${row.error ?? "no output"}` };
  const { output, usage, error } = await inScope({}, () =>
    withStage(`judge:${run.runner}`, async () => {
      if (run.runner === "extract") {
        const e = await scoreExtract(gold, row.output, judge);
        const q = await scoreQuestions(gold, row.output.questions, judge);
        return { counts: { ...e.counts, ...q.counts, "cost.perGrant": [row.costUsd, 1] }, notes: [...(e.notes ?? []), ...(q.error ? [q.error] : [])], audit: e.audit, error: e.error };
      }
      if (run.runner === "questions") return scoreQuestions(gold, row.output, judge);
      if (run.runner === "draft") return scoreDraft(gold, grant, row.output, judge);
      return scoreChat(gold, grant, row.output, judge);
    })
  );
  return { slug: row.slug, ...(output ?? {}), ...(error && { error }), judgeUsage: usage };
}

const rows = fs.readdirSync(runDir).filter((f) => f.endsWith(".json") && !["run.json", "score.json"].includes(f)).map((f) => JSON.parse(fs.readFileSync(path.join(runDir, f), "utf8")));
const perGrant = await pool(rows, Number(values.concurrency), scoreOne);

const pooled = {};
for (const g of perGrant) {
  for (const [m, [hit, total]] of Object.entries(g.counts ?? {})) {
    pooled[m] ??= [0, 0];
    pooled[m][0] += hit;
    pooled[m][1] += total;
  }
}
const baseline = fs.existsSync(values.baseline) ? JSON.parse(fs.readFileSync(values.baseline, "utf8"))[run.runner] ?? {} : {};
const metrics = Object.entries(pooled)
  .map(([m, [hit, total]]) => {
    const value = BARS[m]?.count ? hit : total ? Math.round((hit / total) * 1000) / 1000 : null;
    return { metric: m, label: BARS[m]?.label ?? m, value, hit, total, bar: BARS[m]?.bar ?? null, pass: verdict(m, value), baseline: baseline[m] ?? null };
  })
  .sort((a, b) => Object.keys(BARS).indexOf(a.metric) - Object.keys(BARS).indexOf(b.metric));

const judgeTotals = totals(perGrant.flatMap((g) => g.judgeUsage ?? []));
const report = {
  run: path.basename(runDir),
  runner: run.runner,
  codeSha: run.codeSha,
  models: run.models,
  judge: { models, promptHash: judge.promptHash, ...judgeTotals },
  scoredAt: new Date().toISOString(),
  grants: perGrant.length,
  errors: perGrant.filter((g) => g.error).map((g) => ({ slug: g.slug, error: g.error })),
  metrics,
  perGrant: perGrant.map(({ judgeUsage, ...g }) => g),
};
fs.writeFileSync(path.join(runDir, "score.json"), `${JSON.stringify(report, null, 1)}\n`);

const fmt = (v) => (v === null || v === undefined ? "—" : String(v));
const md = [
  `# ${run.runner} run ${report.run}`,
  "",
  `Code ${run.codeSha?.slice(0, 7)}, ${perGrant.length} grants, judge ${models.haiku.split(".").pop()} + ${models.sonnet.split(".").pop()} ($${judgeTotals.costUsd}), prompts ${judge.promptHash}.`,
  "",
  "| Metric | Value | n | Bar | Pass | Baseline |",
  "|---|---|---|---|---|---|",
  ...metrics.map((r) => `| ${r.label} | ${fmt(r.value)} | ${r.hit}/${r.total} | ${BARS[r.metric]?.max ? "≤ " : "≥ "}${fmt(r.bar)} | ${r.pass === null ? "—" : r.pass ? "yes" : "**no**"} | ${fmt(r.baseline)} |`),
  "",
  ...(report.errors.length ? ["Errors:", ...report.errors.map((e) => `- ${e.slug}: ${e.error}`), ""] : []),
  "Notes:",
  ...perGrant.filter((g) => g.notes?.length).map((g) => `- ${g.slug}: ${g.notes.join("; ")}`),
].join("\n");
fs.writeFileSync(path.join(runDir, "score.md"), `${md}\n`);
console.log(md.split("\n").slice(0, metrics.length + 6).join("\n"));

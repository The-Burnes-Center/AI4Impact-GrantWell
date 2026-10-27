// usage: node eval/run.mjs <extract|questions|draft|chat> [--grant a,b] [--from <extract run dir>]
//          [--retrieval replay|record|live] [--kb <dev KB id>] [--concurrency 2] [--golden <dir>] [--out <dir>]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { register } from "node:module";
import { parseArgs } from "node:util";

register("./lib/hooks.mjs", import.meta.url);

const { install, retrieval } = await import("./lib/aws.mjs");
const { configure } = await import("./lib/env.mjs");
const { GOLDEN_DIR, loadGrants, readOptional } = await import("./lib/golden.mjs");
const { pool } = await import("./lib/pool.mjs");
const { totals } = await import("./lib/cost.mjs");

const EVAL_DIR = path.dirname(new URL(import.meta.url).pathname);
const RUNNERS = ["extract", "questions", "draft", "chat"];
const RETRIEVES = new Set(["draft", "chat"]);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    grant: { type: "string" },
    from: { type: "string" },
    retrieval: { type: "string", default: "replay" },
    kb: { type: "string" },
    concurrency: { type: "string", default: "2" },
    golden: { type: "string", default: GOLDEN_DIR },
    out: { type: "string" },
  },
});
const runner = positionals[0];
const fail = (message) => {
  console.error(message);
  process.exit(2);
};
if (!RUNNERS.includes(runner)) fail(`runner must be one of ${RUNNERS.join(", ")}`);
if (!["replay", "record", "live"].includes(values.retrieval)) fail("--retrieval must be replay, record or live");
const kbId = values.kb ?? process.env.EVAL_KB_ID;
if (RETRIEVES.has(runner) && values.retrieval !== "replay" && !kbId) fail(`--retrieval ${values.retrieval} needs --kb or EVAL_KB_ID`);

const models = configure({ kbId });
install();
const run = (await import(`./runners/${runner}.mjs`))[runner];

const grants = loadGrants(values.golden, values.grant?.split(","));
if (grants.length === 0) fail(`no golden grants in ${values.golden}`);

const git = (...args) => execFileSync("git", args, { cwd: EVAL_DIR, encoding: "utf8" }).trim();
const startedAt = new Date().toISOString();
const outDir = values.out ?? path.join(EVAL_DIR, "out", `${runner}-${startedAt.replace(/[:.]/g, "-")}`);
fs.mkdirSync(outDir, { recursive: true });

function summaryFor(grant) {
  if (!values.from) return readOptional(grant, "summary.json");
  const file = path.join(values.from, `${grant.slug}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).output?.summary ?? null : null;
}

const results = await pool(grants, Number(values.concurrency), async (grant) => {
  const rec = retrieval(grant.recordingPath, values.retrieval);
  const t0 = Date.now();
  let result;
  try {
    result = await run(grant, { summary: summaryFor(grant), retrieval: rec });
  } catch (e) {
    result = { error: `${e.name}: ${e.message}`, usage: [] };
  }
  rec.save();
  const row = {
    slug: grant.slug,
    name: grant.name,
    runner,
    ms: Date.now() - t0,
    ...totals(result.usage),
    ...(RETRIEVES.has(runner) && { retrieval: rec.stats }),
    ...(result.error && { error: result.error }),
    output: result.output ?? null,
    usage: result.usage,
  };
  fs.writeFileSync(path.join(outDir, `${grant.slug}.json`), `${JSON.stringify(row, null, 1)}\n`);
  console.log(`${runner} ${grant.slug}: ${row.error ? `ERROR ${row.error}` : "ok"} ${Math.round(row.ms / 1000)}s $${row.costUsd}`);
  return row;
});

const manifest = {
  runner,
  startedAt,
  codeSha: git("rev-parse", "HEAD"),
  dirty: git("status", "--porcelain").length > 0,
  models,
  retrieval: RETRIEVES.has(runner) ? values.retrieval : null,
  from: values.from ?? null,
  grants: results.map(({ slug, ms, costUsd, error }) => ({ slug, ms, costUsd, ...(error && { error }) })),
  ...totals(results.flatMap((r) => r.usage)),
};
fs.writeFileSync(path.join(outDir, "run.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${runner}: ${results.filter((r) => !r.error).length}/${results.length} ok, $${manifest.costUsd}, ${outDir}`);
process.exitCode = results.some((r) => r.error) ? 1 : 0;

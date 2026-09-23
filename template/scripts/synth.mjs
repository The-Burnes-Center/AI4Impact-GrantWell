#!/usr/bin/env node
// Generates CloudFormation templates for every deployment in config/instances.ts, offline: no AWS
// credentials, no Docker (asset bundling is skipped) and placeholder secrets, so nothing real is
// written to disk. Used by upgrade.sh to show what an upgrade changes.
// Usage: node scripts/synth.mjs synth <out dir>
//        node scripts/synth.mjs compare <before dir> <after dir>
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function environments() {
  const out = execFileSync(
    process.execPath,
    ["-r", "ts-node/register/transpile-only", "-e", 'console.log(JSON.stringify(require("./config/instances").instances.map((i) => i.aws.environment)))'],
    { cwd: root, encoding: "utf8" }
  );
  return JSON.parse(out);
}

function synth(outDir) {
  const cdkJson = JSON.parse(fs.readFileSync(path.join(root, "cdk.json"), "utf8"));
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const environment of environments()) {
    console.log(`Synthesizing ${environment}`);
    const result = spawnSync(cdkJson.app, {
      shell: true,
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        ENVIRONMENT: environment,
        CDK_OUTDIR: path.join(outDir, environment),
        CDK_CONTEXT_JSON: JSON.stringify({ ...cdkJson.context, "aws:cdk:bundling-stacks": [] }),
        GRANTS_GOV_API_KEY: "PLACEHOLDER",
        TURNSTILE_SECRET_KEY: "PLACEHOLDER",
        TURNSTILE_SITE_KEY: "PLACEHOLDER",
      },
    });
    if (result.status !== 0) {
      console.error(`Synth of ${environment} failed.`);
      process.exit(1);
    }
  }
}

function compare(before, after) {
  const templates = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".template.json")) : []);
  const envs = [...new Set([...fs.readdirSync(before), ...fs.readdirSync(after)])].sort();
  for (const env of envs) {
    const a = templates(path.join(before, env));
    const b = templates(path.join(after, env));
    const lines = [...new Set([...a, ...b])]
      .sort()
      .map((f) => {
        if (!a.includes(f)) return `  added    ${f}`;
        if (!b.includes(f)) return `  removed  ${f}`;
        const same = fs.readFileSync(path.join(before, env, f)).equals(fs.readFileSync(path.join(after, env, f)));
        return same ? null : `  changed  ${f}`;
      })
      .filter(Boolean);
    console.log(`${env}: ${lines.length} of ${new Set([...a, ...b]).size} templates differ`);
    for (const line of lines) console.log(line);
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "synth" && args.length === 1) synth(path.resolve(args[0]));
else if (command === "compare" && args.length === 2) compare(path.resolve(args[0]), path.resolve(args[1]));
else {
  console.error("Usage: synth.mjs synth <out dir> | synth.mjs compare <before dir> <after dir>");
  process.exit(2);
}

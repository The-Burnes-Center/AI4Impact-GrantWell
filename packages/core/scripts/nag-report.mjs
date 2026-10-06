#!/usr/bin/env node
// Summarises the cdk-nag CSVs written by scripts/synth-ci.mjs. Findings never fail the run;
// missing reports do, because that means nag stopped running.
import * as fs from "node:fs";
import * as path from "node:path";
import { ENVS, outDir } from "./synth-ci.mjs";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const lines = ["## cdk-nag AwsSolutions (warn only)", ""];
let missing = false;

for (const env of Object.keys(ENVS)) {
  const dir = outDir(env);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^AwsSolutions-.*-NagReport\.csv$/.test(f)) : [];
  if (files.length === 0) {
    console.error(`::error::No cdk-nag reports in ${dir}`);
    missing = true;
    continue;
  }

  const findings = new Map();
  const totals = { "Non-Compliant": 0, Suppressed: 0, Compliant: 0 };
  for (const file of files) {
    const [header, ...rows] = parseCsv(fs.readFileSync(path.join(dir, file), "utf8"));
    const col = Object.fromEntries(header.map((name, i) => [name, i]));
    for (const r of rows) {
      const compliance = r[col["Compliance"]];
      totals[compliance] = (totals[compliance] ?? 0) + 1;
      if (compliance !== "Non-Compliant") continue;
      const key = `${r[col["Rule ID"]]}\t${r[col["Rule Level"]]}`;
      findings.set(key, (findings.get(key) ?? 0) + 1);
    }
  }

  lines.push(
    `### ${env} (${ENVS[env].STACK_NAME})`,
    "",
    `${totals["Non-Compliant"]} non-compliant, ${totals.Suppressed} suppressed, ${totals.Compliant} compliant across ${files.length} stacks.`,
    "",
    "| Rule | Level | Findings |",
    "|---|---|---|",
    ...[...findings]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, n]) => {
        const [rule, level] = key.split("\t");
        return `| ${rule} | ${level} | ${n} |`;
      }),
    ""
  );
}

const markdown = lines.join("\n") + "\n";
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}
console.log(markdown);
process.exit(missing ? 1 : 0);

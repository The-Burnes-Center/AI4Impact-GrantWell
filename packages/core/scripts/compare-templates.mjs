#!/usr/bin/env node
// Fails unless two app dirs synthesised by synth-ci.mjs produced byte-identical templates.
// Usage: node scripts/compare-templates.mjs <app dir A> <app dir B>
import * as fs from "node:fs";
import * as path from "node:path";
import { ENVS } from "./synth-ci.mjs";

const [a, b] = process.argv.slice(2).map((dir) => path.resolve(dir));
if (!a || !b) {
  console.error("Usage: compare-templates.mjs <app dir A> <app dir B>");
  process.exit(2);
}

const templates = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".template.json")).sort();
let failed = false;

for (const env of Object.keys(ENVS)) {
  const dirA = path.join(a, "cdk.out", `ci-${env}`);
  const dirB = path.join(b, "cdk.out", `ci-${env}`);
  const filesA = templates(dirA);
  const filesB = templates(dirB);
  const differing = [...new Set([...filesA, ...filesB])].filter(
    (f) =>
      !filesA.includes(f) ||
      !filesB.includes(f) ||
      !fs.readFileSync(path.join(dirA, f)).equals(fs.readFileSync(path.join(dirB, f)))
  );
  if (filesA.length === 0) differing.push(`(no templates in ${dirA})`);
  if (differing.length) {
    failed = true;
    console.error(`${env}: ${differing.length} template(s) differ:\n  ${differing.join("\n  ")}`);
  } else {
    console.log(`${env}: ${filesA.length} templates identical`);
  }
}

process.exit(failed ? 1 : 0);

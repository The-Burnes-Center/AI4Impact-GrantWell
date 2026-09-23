#!/usr/bin/env node
// Copies the instance.json (branding + states) from packages/core's last `npm run synth:ci` into
// src/common/generated/, so `npm run dev` shows that deployment's branding instead of the neutral default.
//
//   npm run stage-instance dev
//   npm run stage-instance prod
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.argv[2];
if (env !== "dev" && env !== "prod") {
  console.error("Usage: npm run stage-instance <dev|prod>");
  process.exit(2);
}

const source = path.join(appDir, "..", "core", "cdk.out", `ci-${env}`, "ui-build", "src", "common", "generated", "instance.json");
if (!existsSync(source)) {
  console.error(`No ${env} synth output at ${path.relative(appDir, source)}. Run \`npm run synth:ci ${env}\` in packages/core first.`);
  process.exit(1);
}

const target = path.join(appDir, "src", "common", "generated", "instance.json");
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Staged ${env} instance.json into ${path.relative(appDir, target)}`);

#!/usr/bin/env node
// Fails unless every vendor/*.tgz in an instance matches its lockfile integrity. npm ci alone
// can't be trusted for this: with the original tarball in the npm cache it installs that instead.
// Usage: node scripts/check-vendor.mjs [instance dir]   (default: the instance this script is in)
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const lock = JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8"));
const locked = new Map(
  Object.values(lock.packages ?? {})
    .filter((p) => typeof p.resolved === "string" && p.resolved.startsWith("file:vendor/"))
    .map((p) => [p.resolved.slice("file:".length), p.integrity])
);
const onDisk = fs.readdirSync(path.join(dir, "vendor")).filter((f) => f.endsWith(".tgz")).map((f) => `vendor/${f}`);

const problems = [];
if (locked.size === 0) problems.push("package-lock.json resolves nothing from vendor/");
for (const file of onDisk) {
  if (!locked.has(file)) problems.push(`${file} is not in package-lock.json`);
}
for (const [file, integrity] of locked) {
  if (!onDisk.includes(file)) {
    problems.push(`${file} is in package-lock.json but missing`);
    continue;
  }
  const actual = "sha512-" + crypto.createHash("sha512").update(fs.readFileSync(path.join(dir, file))).digest("base64");
  if (actual !== integrity) problems.push(`${file}: lockfile has ${integrity}, file is ${actual}`);
  else console.log(`${file}: ok`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error("Run `npm install ./vendor/<file>.tgz` in the instance (in the GrantWell source repo: scripts/pack.sh), and commit both.");
  process.exit(1);
}

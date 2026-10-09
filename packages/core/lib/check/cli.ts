#!/usr/bin/env node
// State contract checks: what a GrantWell release needs from an instance repo beyond a typecheck and
// a synth. Run from the instance root by install.sh, upgrade.sh and the deploy workflow's check job.
// Usage: grantwell-check <templates dir> [--before <dir>] [--placeholders warn]
//        grantwell-check --sync-scripts
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { InstanceConfig } from "../config/instance-config";
import {
  Finding,
  checkCanaryOutput,
  checkChromeCompiles,
  checkChromeTokens,
  checkChromeVersion,
  checkDeployWorkflow,
  checkPlaceholders,
  checkScripts,
  checkStateful,
  syncScripts,
} from "./checks";

const USAGE = "Usage: grantwell-check <templates dir> [--before <dir>] [--placeholders warn] | grantwell-check --sync-scripts";
const instanceDir = process.cwd();
const packageRoot = path.resolve(__dirname, "..", "..");
const version: string = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version;
// scripts/pack.sh copies template/scripts here; absent when run from a source checkout.
const shippedScripts = path.join(packageRoot, "template", "scripts");
const annotate = process.env.GITHUB_ACTIONS === "true";

function loadInstances(): InstanceConfig[] {
  const register = require.resolve("ts-node/register/transpile-only", { paths: [instanceDir, __dirname] });
  const out = execFileSync(process.execPath, ["-r", register, "-e", 'console.log(JSON.stringify(require("./config/instances").instances))'], {
    cwd: instanceDir,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

function uiAppDir(): string {
  return path.join(path.dirname(require.resolve("grantwell-ui/package.json", { paths: [instanceDir] })), "app");
}

function report(name: string, findings: Finding[] | string): boolean {
  if (typeof findings === "string") {
    console.log(`skip  ${name}: ${findings}`);
    return true;
  }
  const failed = findings.some((f) => f.level === "fail");
  console.log(`${failed ? "FAIL" : findings.length ? "warn" : "ok  "}  ${name}`);
  for (const f of findings) {
    for (const [i, line] of f.message.split("\n").entries()) {
      const prefix = i === 0 && annotate ? (f.level === "fail" ? "::error::" : "::warning::") : "";
      console.log(`      ${prefix}${line}`);
    }
  }
  return !failed;
}

function main(argv: string[]): number {
  if (argv.length === 1 && argv[0] === "--sync-scripts") {
    if (!fs.existsSync(shippedScripts)) {
      console.error(`GrantWell ${version} ships no scripts/ copy; nothing to sync.`);
      return 1;
    }
    const changed = syncScripts(instanceDir, shippedScripts);
    console.log(changed.length ? `Refreshed from GrantWell ${version}: ${changed.join(", ")}` : `scripts/ already matches GrantWell ${version}.`);
    return 0;
  }

  let templatesDir: string | undefined;
  let beforeDir: string | undefined;
  let placeholders: Finding["level"] = "fail";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--before") beforeDir = argv[++i];
    else if (argv[i] === "--placeholders" && argv[i + 1] === "warn") {
      placeholders = "warn";
      i++;
    } else if (!argv[i].startsWith("--") && !templatesDir) templatesDir = argv[i];
    else {
      console.error(USAGE);
      return 2;
    }
  }
  if (!templatesDir || (beforeDir !== undefined && !beforeDir)) {
    console.error(USAGE);
    return 2;
  }

  console.log(`GrantWell ${version} contract checks`);
  const instances = loadInstances();
  const chromeDir = path.join(instanceDir, "chrome");
  const hasChrome = fs.existsSync(path.join(chromeDir, "index.tsx"));
  const results = [
    report("chrome API version", hasChrome ? checkChromeVersion(chromeDir, uiAppDir()) : "no chrome/"),
    report("chrome theme tokens", hasChrome ? checkChromeTokens(chromeDir, uiAppDir()) : "no chrome/"),
    report("chrome type-checks", hasChrome ? checkChromeCompiles(chromeDir, uiAppDir()) : "no chrome/"),
    report("model canary output", checkCanaryOutput(path.resolve(templatesDir), instances)),
    report("scripts/", fs.existsSync(shippedScripts) ? checkScripts(instanceDir, shippedScripts, version) : "this build ships no scripts/ copy"),
    report("deploy workflow", checkDeployWorkflow(instanceDir)),
    report(
      "stateful resources kept",
      beforeDir === undefined
        ? "not an upgrade"
        : fs.existsSync(beforeDir) && fs.readdirSync(beforeDir).length
          ? checkStateful(path.resolve(beforeDir), path.resolve(templatesDir))
          : [{ level: "warn", message: "No templates from the previous version to compare with; stateful resources weren't checked." }]
    ),
    report("no template placeholders", checkPlaceholders(instances, placeholders)),
  ];
  return results.every(Boolean) ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));

#!/usr/bin/env node
// Generates CloudFormation templates for both environments without the CDK CLI:
// bundling needs Docker, and the CLI both rejects and overwrites `aws:cdk:bundling-stacks`.
// Logical IDs and resource types are exact; asset hashes are placeholders.
// Usage: [SYNTH_APP_DIR=<cdk app dir>] node scripts/synth-ci.mjs [dev|prod ...]   (default: both)
// SYNTH_APP_DIR defaults to build/generic, Generic built from this source by `scripts/pack.sh --dev`.
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appDir = path.resolve(process.env.SYNTH_APP_DIR ?? path.join(root, "..", "..", "build", "generic"));

// ENVIRONMENT selects the deployment in the instance's config/instances.ts, as in the deploy workflows.
export const ENVS = {
  dev: { ENVIRONMENT: "grantwell-burnes-staging", STACK_NAME: "grantwell-burnes-staging" },
  prod: { ENVIRONMENT: "grantwell-staging", STACK_NAME: "grantwell-staging" },
};

export const outDir = (env) => path.join(appDir, "cdk.out", `ci-${env}`);

export function synth(env) {
  if (!fs.existsSync(path.join(appDir, "node_modules"))) {
    throw new Error(`${appDir} is not an installed instance. Run scripts/pack.sh --dev (repo root) first.`);
  }
  const cdkJson = JSON.parse(fs.readFileSync(path.join(appDir, "cdk.json"), "utf8"));
  const childEnv = {
    ...process.env,
    ...ENVS[env],
    CDK_CONTEXT_JSON: JSON.stringify({ ...cdkJson.context, "aws:cdk:bundling-stacks": [] }),
    CDK_OUTDIR: outDir(env),
    CDK_NAG: "warn",
    GRANTS_GOV_API_KEY: "REDACTED-GRANTS_GOV_API_KEY",
    TURNSTILE_SECRET_KEY: "REDACTED-TURNSTILE_SECRET_KEY",
    TURNSTILE_SITE_KEY: "REDACTED-TURNSTILE_SITE_KEY",
  };
  fs.rmSync(outDir(env), { recursive: true, force: true });
  return new Promise((resolve, reject) => {
    const child = spawn(cdkJson.app, {
      shell: true,
      cwd: appDir,
      env: childEnv,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`synth ${env} exited with code ${code}`))
    );
  });
}

export async function synthAll(envs = Object.keys(ENVS)) {
  await Promise.all(envs.map(synth));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envs = process.argv.slice(2);
  const unknown = envs.filter((env) => !(env in ENVS));
  if (unknown.length) {
    console.error(`Unknown env: ${unknown.join(", ")}. Expected: ${Object.keys(ENVS).join(", ")}`);
    process.exit(2);
  }
  synthAll(envs.length ? envs : undefined).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

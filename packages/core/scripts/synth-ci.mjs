#!/usr/bin/env node
// Generates CloudFormation templates for both environments without the CDK CLI:
// bundling needs Docker, and the CLI both rejects and overwrites `aws:cdk:bundling-stacks`.
// Logical IDs and resource types are exact; asset hashes are placeholders.
// Usage: node scripts/synth-ci.mjs [dev|prod ...]   (default: both)
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Mirrors the env blocks of deploy-staging.yml and deploy-production.yml. CI has no prod domain or
// certificate; prod logical IDs, types and exports are the same without them.
export const ENVS = {
  dev: { ENVIRONMENT: "grantwell-burnes-staging", STACK_NAME: "grantwell-burnes-staging" },
  prod: { ENVIRONMENT: "grantwell-staging", STACK_NAME: "grantwell-staging" },
};

export const outDir = (env) => path.join(root, "cdk.out", `ci-${env}`);

export function synth(env) {
  const context = JSON.parse(fs.readFileSync(path.join(root, "cdk.json"), "utf8")).context;
  const childEnv = {
    ...process.env,
    ...ENVS[env],
    CDK_CONTEXT_JSON: JSON.stringify({ ...context, "aws:cdk:bundling-stacks": [] }),
    CDK_OUTDIR: outDir(env),
    CDK_NAG: "warn",
    MFA_REQUIRED: "false",
    GRANTWELL_INSTANCE: "generic",
    GRANTS_GOV_API_KEY: "REDACTED-GRANTS_GOV_API_KEY",
    TURNSTILE_SECRET_KEY: "REDACTED-TURNSTILE_SECRET_KEY",
    TURNSTILE_SITE_KEY: "REDACTED-TURNSTILE_SITE_KEY",
  };
  for (const key of ["CLOUDFRONT_CUSTOM_DOMAIN", "CLOUDFRONT_CERTIFICATE_ARN", "DEPLOYMENT_URL", "GRANTWELL_CHROME"]) {
    delete childEnv[key];
  }

  fs.rmSync(outDir(env), { recursive: true, force: true });
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["ts-node", "--prefer-ts-exts", "bin/grantwell.ts"], {
      cwd: root,
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

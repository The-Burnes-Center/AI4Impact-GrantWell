import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ENVS, appDir } from "../scripts/synth-ci.mjs";

export type Resource = { Type: string; Properties?: any };

export const resourcesIn = (dir: string): Record<string, Resource> =>
  Object.assign(
    {},
    ...fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".template.json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).Resources ?? {})
  );

/**
 * Synthesizes Generic dev with its config passed through `transform` (TypeScript, applied to each
 * instance as `i`), and returns the output directory. `env` replaces the placeholder secrets.
 */
export function synthVariant(transform: string, env: Record<string, string | undefined> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-variant-"));
  // bin/ is copied: Node resolves a symlinked bin/app.ts to its real path and would load Generic's config.
  fs.cpSync(path.join(appDir, "bin"), path.join(dir, "bin"), { recursive: true });
  for (const f of ["cdk.json", "package.json", "tsconfig.json", "public", "node_modules"]) {
    fs.symlinkSync(path.join(appDir, f), path.join(dir, f));
  }
  fs.mkdirSync(path.join(dir, "config"));
  fs.writeFileSync(
    path.join(dir, "config", "instances.ts"),
    `import type { InstanceConfig } from "grantwell-core";\n` +
      `import { instances as generic } from ${JSON.stringify(path.join(appDir, "config", "instances"))};\n` +
      `export const instances: InstanceConfig[] = generic.map((i) => (${transform}) as InstanceConfig);\n`
  );
  const out = path.join(dir, "cdk.out");
  const cdkJson = JSON.parse(fs.readFileSync(path.join(appDir, "cdk.json"), "utf8"));
  const secrets: Record<string, string | undefined> = {
    GRANTS_GOV_API_KEY: "REDACTED-GRANTS_GOV_API_KEY",
    TURNSTILE_SECRET_KEY: "REDACTED-TURNSTILE_SECRET_KEY",
    TURNSTILE_SITE_KEY: "REDACTED-TURNSTILE_SITE_KEY",
    ...env,
  };
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    ENVIRONMENT: ENVS.dev.ENVIRONMENT,
    CDK_OUTDIR: out,
    CDK_CONTEXT_JSON: JSON.stringify({ ...cdkJson.context, "aws:cdk:bundling-stacks": [] }),
  };
  for (const [k, v] of Object.entries(secrets)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  const result = spawnSync(cdkJson.app, { shell: true, cwd: dir, stdio: ["ignore", "ignore", "inherit"], env: childEnv });
  if (result.status !== 0) throw new Error(`variant synth failed (${result.status})`);
  return out;
}

export function stagedInstance(out: string): any {
  const staged = fs
    .readdirSync(out, { recursive: true, encoding: "utf8" })
    .find((f) => f.endsWith(path.join("generated", "instance.json")));
  if (!staged) throw new Error("no staged instance.json");
  return JSON.parse(fs.readFileSync(path.join(out, staged), "utf8"));
}

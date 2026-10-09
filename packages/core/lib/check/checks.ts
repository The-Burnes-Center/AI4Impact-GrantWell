import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { InstanceConfig } from "../config/instance-config";

export interface Finding {
  level: "fail" | "warn";
  message: string;
}

const fail = (message: string): Finding => ({ level: "fail", message });
const warn = (message: string): Finding => ({ level: "warn", message });

function walk(dir: string, skip: Set<string> = new Set()): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return skip.has(entry.name) ? [] : walk(full, skip);
    return [full];
  });
}

export function chromeApiVersion(uiAppDir: string): number {
  const source = fs.readFileSync(path.join(uiAppDir, "src", "common", "chrome-api.ts"), "utf8");
  const match = source.match(/export const CHROME_API_VERSION = (\d+);/);
  if (!match) throw new Error(`No CHROME_API_VERSION in ${uiAppDir}/src/common/chrome-api.ts`);
  return Number(match[1]);
}

export function checkChromeVersion(chromeDir: string, uiAppDir: string): Finding[] {
  const supported = chromeApiVersion(uiAppDir);
  const source = fs.readFileSync(path.join(chromeDir, "index.tsx"), "utf8");
  if (/apiVersion\s*:\s*CHROME_API_VERSION\b/.test(source)) return [];
  const match = source.match(/apiVersion\s*:\s*(\d+)/);
  if (!match) {
    return [fail(`chrome/index.tsx sets no apiVersion this check can read; write \`apiVersion: ${supported}\` in the exported chrome.`)];
  }
  if (Number(match[1]) !== supported) {
    return [
      fail(
        `chrome/index.tsx targets chrome API version ${match[1]}; this GrantWell release supports ${supported}. ` +
          `The site would silently fall back to GrantWell's own chrome. Update chrome/ to version ${supported} (see the UI's src/common/chrome-api.ts).`
      ),
    ];
  }
  return [];
}

const TOKEN = /--gw-[A-Za-z0-9_-]+/g;

/** Every `--gw-*` name the GrantWell UI uses or defines: the only ones a chrome may set or read. */
export function knownTokens(uiAppDir: string): Set<string> {
  const files = walk(path.join(uiAppDir, "src"), new Set(["node_modules", "instance-chrome", "generated"])).filter((f) =>
    /\.(css|scss|ts|tsx)$/.test(f)
  );
  return new Set(files.flatMap((f) => fs.readFileSync(f, "utf8").match(TOKEN) ?? []));
}

export function checkChromeTokens(chromeDir: string, uiAppDir: string): Finding[] {
  const known = knownTokens(uiAppDir);
  const findings: Finding[] = [];
  for (const file of walk(chromeDir).filter((f) => /\.(css|scss|ts|tsx)$/.test(f))) {
    const unknown = [...new Set(fs.readFileSync(file, "utf8").match(TOKEN) ?? [])].filter((t) => !known.has(t)).sort();
    if (unknown.length) {
      findings.push(
        fail(
          `chrome/${path.relative(chromeDir, file)} uses ${unknown.join(", ")}, which this GrantWell release doesn't have ` +
            `(renamed or removed?). --gw- names belong to GrantWell; give your own variables another prefix.`
        )
      );
    }
  }
  return findings;
}

export interface CompileOptions {
  /** Link this node_modules instead of running `npm ci` (tests, local runs). */
  nodeModulesDir?: string;
}

/** Type-checks chrome/ inside a copy of the shipped UI app, as the deploy's UI build does. */
export function checkChromeCompiles(chromeDir: string, uiAppDir: string, options: CompileOptions = {}): Finding[] {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grantwell-check-"));
  const app = path.join(tmp, "app");
  const skipped = new Set(["node_modules", "dist", path.join("src", "common", "generated"), path.join("src", "instance-chrome")]);
  try {
    fs.cpSync(uiAppDir, app, { recursive: true, filter: (src) => !skipped.has(path.relative(uiAppDir, src)) });
    fs.cpSync(chromeDir, path.join(app, "src", "instance-chrome"), { recursive: true });
    if (options.nodeModulesDir) {
      fs.symlinkSync(options.nodeModulesDir, path.join(app, "node_modules"), "dir");
    } else {
      const install = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], {
        cwd: app,
        encoding: "utf8",
      });
      if (install.status !== 0) {
        return [fail(`Installing the GrantWell UI's dependencies to type-check chrome/ failed:\n${install.stderr}`)];
      }
    }
    const tsc = spawnSync(process.execPath, [path.join(app, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", "tsconfig.json"], {
      cwd: app,
      encoding: "utf8",
    });
    if (tsc.status === 0) return [];
    const output = (tsc.stdout + tsc.stderr).replace(/src[\\/]instance-chrome[\\/]/g, "chrome/").trim();
    if (!/^chrome\//m.test(output)) {
      return [fail(`The GrantWell UI itself doesn't type-check, so chrome/ couldn't be checked (a problem in the release, not in chrome/):\n${output}`)];
    }
    return [fail(`chrome/ doesn't type-check against this GrantWell release's chrome API:\n${output}`)];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function rootTemplates(templatesDir: string, stackName: string): string[] {
  return walk(templatesDir, new Set(["node_modules", "ui-build", "asset-output"])).filter(
    (f) => path.basename(f) === `${stackName}.template.json`
  );
}

/** Deploy workflows read ModelCanaryFunctionName from `cdk deploy --outputs-file` to run check-models.sh. */
export function checkCanaryOutput(templatesDir: string, instances: InstanceConfig[]): Finding[] {
  const findings: Finding[] = [];
  for (const instance of instances) {
    const files = rootTemplates(templatesDir, instance.aws.stackName);
    if (files.length !== 1) {
      findings.push(fail(`Expected one ${instance.aws.stackName}.template.json under ${templatesDir}, found ${files.length}.`));
      continue;
    }
    const outputs = JSON.parse(fs.readFileSync(files[0], "utf8")).Outputs ?? {};
    if (!("ModelCanaryFunctionName" in outputs)) {
      findings.push(fail(`${instance.aws.stackName} has no ModelCanaryFunctionName output; the deploy workflow's model check can't run.`));
    }
  }
  return findings;
}

export function checkScripts(instanceDir: string, shippedDir: string, version: string): Finding[] {
  const findings: Finding[] = [];
  for (const name of fs.readdirSync(shippedDir).sort()) {
    const mine = path.join(instanceDir, "scripts", name);
    if (!fs.existsSync(mine)) findings.push(fail(`scripts/${name} is missing (GrantWell ${version} ships it).`));
    else if (!fs.readFileSync(mine).equals(fs.readFileSync(path.join(shippedDir, name)))) {
      findings.push(fail(`scripts/${name} differs from the copy GrantWell ${version} ships.`));
    }
  }
  if (findings.length) {
    findings.push(fail("scripts/ belongs to GrantWell: upgrade.sh refreshes it, or run `node_modules/.bin/grantwell-check --sync-scripts` and commit scripts/."));
  }
  return findings;
}

/** Replaces scripts/ files with the release's copies. Writes then renames, so a running upgrade.sh keeps reading its old file. */
export function syncScripts(instanceDir: string, shippedDir: string): string[] {
  const changed: string[] = [];
  fs.mkdirSync(path.join(instanceDir, "scripts"), { recursive: true });
  for (const name of fs.readdirSync(shippedDir).sort()) {
    const source = fs.readFileSync(path.join(shippedDir, name));
    const target = path.join(instanceDir, "scripts", name);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(source)) continue;
    const tmp = `${target}.grantwell-tmp`;
    fs.writeFileSync(tmp, source, { mode: name.endsWith(".sh") ? 0o755 : 0o644 });
    fs.renameSync(tmp, target);
    changed.push(`scripts/${name}`);
  }
  return changed;
}

const WORKFLOW_STEPS: [string, string][] = [
  ["check-vendor.mjs", "checks vendor/ against the lockfile"],
  ["grantwell-check", "runs these contract checks"],
  ["--outputs-file", "writes the deploy outputs the model check reads"],
  ["check-models.sh", "checks every Bedrock model answers after a deploy"],
];

export function checkDeployWorkflow(instanceDir: string): Finding[] {
  const file = path.join(instanceDir, ".github", "workflows", "deploy.yml");
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return WORKFLOW_STEPS.filter(([marker]) => !text.includes(marker)).map(([marker, what]) =>
    warn(`.github/workflows/deploy.yml has no step using ${marker} (${what}). Compare it with the template repo's deploy.yml and copy the step by hand.`)
  );
}

/** Properties whose change makes CloudFormation replace the resource, losing its data. */
const STATEFUL: Record<string, string[]> = {
  "AWS::Cognito::UserPool": ["AliasAttributes", "UsernameAttributes", "UsernameConfiguration"],
  "AWS::DynamoDB::Table": ["TableName", "KeySchema", "LocalSecondaryIndexes"],
  "AWS::DynamoDB::GlobalTable": ["TableName", "KeySchema", "LocalSecondaryIndexes"],
  "AWS::S3::Bucket": ["BucketName"],
  "AWS::OpenSearchServerless::Collection": ["Name", "Type", "StandbyReplicas", "Tags"],
  "AWS::Bedrock::KnowledgeBase": ["KnowledgeBaseConfiguration", "StorageConfiguration"],
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

type Resources = Record<string, { Type: string; Properties?: Record<string, unknown> }>;

function templates(dir: string): Map<string, Resources> {
  const out = new Map<string, Resources>();
  for (const file of walk(dir, new Set(["ui-build", "asset-output", "node_modules"])).filter((f) => f.endsWith(".template.json"))) {
    out.set(path.relative(dir, file), JSON.parse(fs.readFileSync(file, "utf8")).Resources ?? {});
  }
  return out;
}

/** Upgrade only: fails when a stateful resource in `before` is gone from, or would be replaced in, `after`. */
export function checkStateful(beforeDir: string, afterDir: string): Finding[] {
  const findings: Finding[] = [];
  const before = templates(beforeDir);
  const after = templates(afterDir);
  const deployments = (m: Map<string, Resources>) => new Set([...m.keys()].map((f) => f.split(path.sep)[0]));
  const afterDeployments = deployments(after);
  for (const deployment of deployments(before)) {
    if (!afterDeployments.has(deployment)) findings.push(warn(`${deployment} is no longer generated; its stateful resources weren't compared.`));
  }
  for (const [file, resources] of before) {
    if (!afterDeployments.has(file.split(path.sep)[0])) continue;
    const next = after.get(file) ?? {};
    for (const [id, resource] of Object.entries(resources)) {
      const replaceOn = STATEFUL[resource.Type];
      if (!replaceOn) continue;
      const other = next[id];
      if (!other || other.Type !== resource.Type) {
        findings.push(fail(`${file}: ${resource.Type} ${id} is removed by this upgrade; CloudFormation would delete it and its data.`));
        continue;
      }
      const changed = replaceOn.filter((p) => canonical(resource.Properties?.[p]) !== canonical(other.Properties?.[p]));
      if (changed.length) {
        findings.push(fail(`${file}: ${resource.Type} ${id} would be replaced (${changed.join(", ")} changed), losing its data.`));
      }
    }
  }
  return findings;
}

const PLACEHOLDERS: [RegExp, string][] = [
  [/replace-me/i, "replace-me"],
  [/\bexample\.(gov|com|org)\b/i, "an example domain"],
  [/arn:aws[^:]*:[^:]*:[^:]*:(111111111111|000000000000):/, "a placeholder account ID"],
];

function strings(value: unknown, at: string): [string, string][] {
  if (typeof value === "string") return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, at ? `${at}.${k}` : k));
  }
  return [];
}

/** The template's example values, which would deploy something that isn't yours. */
export function checkPlaceholders(instances: InstanceConfig[], level: Finding["level"] = "fail"): Finding[] {
  const findings: Finding[] = [];
  for (const instance of instances) {
    for (const [at, value] of strings(instance, "")) {
      const hit = PLACEHOLDERS.find(([re]) => re.test(value));
      if (hit) findings.push({ level, message: `${instance.id}: ${at} is still ${hit[1]} (${value}).` });
    }
    instance.states.forEach((s, i) => {
      if (s.code === "XX") findings.push({ level, message: `${instance.id}: states[${i}].code is still the placeholder "XX".` });
    });
  }
  return findings;
}

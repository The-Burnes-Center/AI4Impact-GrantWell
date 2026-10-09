import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkCanaryOutput,
  checkChromeCompiles,
  checkChromeTokens,
  checkChromeVersion,
  checkDeployWorkflow,
  checkPlaceholders,
  checkScripts,
  checkStateful,
  syncScripts,
} from "../lib/check/checks";
import type { InstanceConfig } from "../lib/config/instance-config";

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, "..");
const uiApp = path.resolve(core, "..", "ui");
const uiNodeModules = path.join(uiApp, "node_modules");
const templateScripts = path.resolve(core, "..", "..", "template", "scripts");
const fixtureChrome = path.join(here, "fixtures", "instance-check", "chrome");

let tmp: string;
let chrome: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grantwell-check-test-"));
  chrome = path.join(tmp, "chrome");
  fs.cpSync(fixtureChrome, chrome, { recursive: true });
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const edit = (file: string, from: string | RegExp, to: string) => {
  const text = fs.readFileSync(file, "utf8");
  const next = text.replace(from, to);
  expect(next).not.toBe(text);
  fs.writeFileSync(file, next);
};

const failures = (findings: { level: string; message: string }[]) => findings.filter((f) => f.level === "fail").map((f) => f.message);

const instance = (overrides: Partial<InstanceConfig> = {}): InstanceConfig =>
  ({
    id: "state-prod",
    instance: "state",
    stage: "prod",
    tenancy: "single",
    states: [{ code: "MA", name: "Massachusetts" }],
    aws: { stackName: "gw-state", environment: "gw-state", cognitoDomainPrefix: "gw-auth-state", knowledgeBaseIndexName: "kb-index" },
    siteUrl: "https://grants.state.gov",
    auth: { mfaRequired: false },
    email: { cognitoDefault: true },
    scraper: { dailySchedule: true },
    monitoring: { dailyBrief: false },
    tags: {},
    branding: {
      appName: "GrantWell",
      orgName: "State",
      postalAddress: "1 Main St",
      supportEmail: "help@state.gov",
      colors: { primary: "#000000" },
      logo: "/images/logo.svg",
      favicon: "/images/favicon.svg",
      footer: { partners: [] },
      omniPartners: [],
    },
    ...overrides,
  }) as InstanceConfig;

const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

describe("chrome API version", () => {
  it("passes the neutral fixture", () => {
    expect(checkChromeVersion(chrome, uiApp)).toEqual([]);
  });

  it("fails a chrome written for version 2", () => {
    edit(path.join(chrome, "index.tsx"), "apiVersion: 1", "apiVersion: 2");
    expect(failures(checkChromeVersion(chrome, uiApp))).toEqual([expect.stringContaining("targets chrome API version 2")]);
  });
});

describe("chrome theme tokens", () => {
  it("passes the neutral fixture", () => {
    expect(checkChromeTokens(chrome, uiApp)).toEqual([]);
  });

  it("fails a token GrantWell doesn't have", () => {
    edit(path.join(chrome, "theme.css"), "--gw-color-primary-hover", "--gw-color-primary-hovered");
    expect(failures(checkChromeTokens(chrome, uiApp))).toEqual([expect.stringContaining("theme.css uses --gw-color-primary-hovered")]);
  });
});

describe.skipIf(!fs.existsSync(uiNodeModules))("chrome type-checks (needs packages/ui/node_modules)", () => {
  it("passes the neutral fixture", () => {
    expect(checkChromeCompiles(chrome, uiApp, { nodeModulesDir: uiNodeModules })).toEqual([]);
  }, 120_000);

  it("fails a chrome using a renamed slot prop", () => {
    edit(path.join(chrome, "index.tsx"), /signOut/g, "logOut");
    const [message] = failures(checkChromeCompiles(chrome, uiApp, { nodeModulesDir: uiNodeModules }));
    expect(message).toMatch(/chrome\/index\.tsx\(\d+,\d+\): error TS2339: Property 'logOut' does not exist on type 'HeaderProps'/);
  }, 120_000);

  it("fails a chrome written for version 2", () => {
    edit(path.join(chrome, "index.tsx"), "apiVersion: 1", "apiVersion: 2");
    expect(failures(checkChromeCompiles(chrome, uiApp, { nodeModulesDir: uiNodeModules }))).toEqual([
      expect.stringContaining("Type '2' is not assignable to type '1'"),
    ]);
  }, 120_000);
});

describe("instance config type-check (the existing typecheck gate)", () => {
  it("fails a config using a renamed field", () => {
    const dir = path.join(tmp, "instance");
    fs.mkdirSync(path.join(dir, "config"), { recursive: true });
    writeJson(path.join(dir, "tsconfig.json"), {
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        baseUrl: ".",
        paths: { "grantwell-core": [path.join(core, "lib", "config", "instance-config.ts")] },
      },
      include: ["config/*.ts"],
    });
    const config = `import type { InstanceConfig } from "grantwell-core";\nexport const auth: InstanceConfig["auth"] = { requireMfa: false };\n`;
    fs.writeFileSync(path.join(dir, "config", "instances.ts"), config);
    const tsc = spawnSync(process.execPath, [path.join(core, "node_modules", "typescript", "bin", "tsc"), "-p", dir], { encoding: "utf8" });
    expect(tsc.status).not.toBe(0);
    expect(tsc.stdout).toContain("'requireMfa' does not exist");
  }, 60_000);
});

describe("model canary output", () => {
  const out = () => path.join(tmp, "cdk.out");

  it("passes a root template with the output", () => {
    writeJson(path.join(out(), "gw-state", "gw-state.template.json"), { Outputs: { ModelCanaryFunctionName: { Value: "fn" } } });
    expect(checkCanaryOutput(out(), [instance()])).toEqual([]);
  });

  it("fails a root template without it", () => {
    writeJson(path.join(out(), "gw-state", "gw-state.template.json"), { Outputs: {} });
    expect(failures(checkCanaryOutput(out(), [instance()]))).toEqual([expect.stringContaining("gw-state has no ModelCanaryFunctionName output")]);
  });

  it("fails when the deployment wasn't generated", () => {
    expect(failures(checkCanaryOutput(out(), [instance()]))).toEqual([expect.stringContaining("found 0")]);
  });
});

describe("scripts/", () => {
  const instanceDir = () => path.join(tmp, "instance");
  beforeEach(() => fs.cpSync(templateScripts, path.join(instanceDir(), "scripts"), { recursive: true }));

  it("passes the template's own scripts", () => {
    expect(checkScripts(instanceDir(), templateScripts, "9.9.9")).toEqual([]);
  });

  it("fails a stale or missing script, and --sync-scripts fixes it", () => {
    fs.appendFileSync(path.join(instanceDir(), "scripts", "upgrade.sh"), "\n# local edit\n");
    fs.rmSync(path.join(instanceDir(), "scripts", "check-models.sh"));
    expect(failures(checkScripts(instanceDir(), templateScripts, "9.9.9"))).toEqual([
      "scripts/check-models.sh is missing (GrantWell 9.9.9 ships it).",
      "scripts/upgrade.sh differs from the copy GrantWell 9.9.9 ships.",
      expect.stringContaining("--sync-scripts"),
    ]);
    expect(syncScripts(instanceDir(), templateScripts)).toEqual(["scripts/check-models.sh", "scripts/upgrade.sh"]);
    expect(checkScripts(instanceDir(), templateScripts, "9.9.9")).toEqual([]);
    expect(fs.statSync(path.join(instanceDir(), "scripts", "check-models.sh")).mode & 0o111).not.toBe(0);
  });
});

describe("deploy workflow", () => {
  it("passes the template's deploy.yml", () => {
    expect(checkDeployWorkflow(path.resolve(core, "..", "..", "template"))).toEqual([]);
  });

  it("only warns about a workflow missing the model check", () => {
    const dir = path.join(tmp, "instance");
    fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".github", "workflows", "deploy.yml"), "run: node scripts/check-vendor.mjs && grantwell-check\nrun: npx cdk deploy --all\n");
    const findings = checkDeployWorkflow(dir);
    expect(findings.map((f) => f.level)).toEqual(["warn", "warn"]);
    expect(findings.map((f) => f.message).join("\n")).toMatch(/--outputs-file[\s\S]*check-models\.sh/);
  });
});

describe("stateful resources kept", () => {
  const pool = { Type: "AWS::Cognito::UserPool", Properties: { UsernameAttributes: ["email"] } };
  const table = { Type: "AWS::DynamoDB::Table", Properties: { KeySchema: [{ AttributeName: "id", KeyType: "HASH" }] } };
  const write = (side: string, resources: Record<string, unknown>) =>
    writeJson(path.join(tmp, side, "gw-state", "gw-state.template.json"), { Resources: resources });
  const run = () => checkStateful(path.join(tmp, "before"), path.join(tmp, "after"));

  it("passes when stateful resources only change in place", () => {
    write("before", { UserPool: pool, Table: table, Fn: { Type: "AWS::Lambda::Function" } });
    write("after", { UserPool: { ...pool, Properties: { ...pool.Properties, MfaConfiguration: "ON" } }, Table: table });
    expect(run()).toEqual([]);
  });

  it("fails a replaced user pool and a removed table", () => {
    write("before", { UserPool: pool, Table: table });
    write("after", { UserPool: { ...pool, Properties: { UsernameAttributes: ["phone_number"] } } });
    expect(failures(run())).toEqual([
      expect.stringContaining("AWS::Cognito::UserPool UserPool would be replaced (UsernameAttributes changed)"),
      expect.stringContaining("AWS::DynamoDB::Table Table is removed"),
    ]);
  });

  it("fails a pool whose logical ID moved", () => {
    write("before", { UserPool: pool });
    write("after", { UserPoolV2: pool });
    expect(failures(run())).toEqual([expect.stringContaining("UserPool is removed")]);
  });
});

describe("no template placeholders", () => {
  it("passes a real config", () => {
    expect(checkPlaceholders([instance()])).toEqual([]);
  });

  it("fails the template's example values", () => {
    const example = instance({
      siteUrl: "https://grants.example.gov",
      customDomain: { domainName: "grants.example.gov", certificateArn: "arn:aws:acm:us-east-1:111111111111:certificate/replace-me" },
      states: [{ code: "XX", name: "Example State" }],
    } as Partial<InstanceConfig>);
    const messages = failures(checkPlaceholders([example]));
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("siteUrl is still an example domain"),
        expect.stringContaining("customDomain.certificateArn is still replace-me"),
        expect.stringContaining('states[0].code is still the placeholder "XX"'),
      ])
    );
  });

  it("only warns when asked to (install.sh)", () => {
    const example = instance({ siteUrl: "https://grants.example.gov" });
    expect(checkPlaceholders([example], "warn").map((f) => f.level)).toEqual(["warn"]);
  });
});

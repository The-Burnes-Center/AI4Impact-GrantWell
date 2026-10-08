import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { ossPolicyNamesFor } from "../lib/chatbot-api/opensearch/opensearch";

type Resource = { Type: string; Properties?: any };

const resourcesIn = (dir: string): Record<string, Resource> =>
  Object.assign(
    {},
    ...fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".template.json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).Resources ?? {})
  );

// Generic dev, switched to Cognito's sender: the only difference from the dev synth the other tests use.
let variantOut: string;
let instances: InstanceConfig[];
beforeAll(async () => {
  instances = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-cognito-email-"));
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
      `export const instances: InstanceConfig[] = generic.map((i) => ({ ...i, email: { cognitoDefault: true } }));\n`
  );
  variantOut = path.join(dir, "cdk.out");
  const cdkJson = JSON.parse(fs.readFileSync(path.join(appDir, "cdk.json"), "utf8"));
  const result = spawnSync(cdkJson.app, {
    shell: true,
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      ENVIRONMENT: ENVS.dev.ENVIRONMENT,
      CDK_OUTDIR: variantOut,
      CDK_CONTEXT_JSON: JSON.stringify({ ...cdkJson.context, "aws:cdk:bundling-stacks": [] }),
      GRANTS_GOV_API_KEY: "REDACTED-GRANTS_GOV_API_KEY",
      TURNSTILE_SECRET_KEY: "REDACTED-TURNSTILE_SECRET_KEY",
      TURNSTILE_SITE_KEY: "REDACTED-TURNSTILE_SITE_KEY",
    },
  });
  expect(result.status).toBe(0);
}, 300_000);

describe("email.cognitoDefault", () => {
  it("is one of the two email shapes", () => {
    const dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
    expect(() => validateInstanceConfig({ ...dev, email: { cognitoDefault: true } })).not.toThrow();
    expect(() => validateInstanceConfig({ ...dev, email: { cognitoDefault: false } as any })).toThrow(/email must be/);
    expect(() =>
      validateInstanceConfig({ ...dev, email: { sender: "a@b.c", manageSenderIdentity: false, cognitoDefault: true } as any })
    ).toThrow(/email must be/);
  });

  it("sends auth mail with Cognito's sender, replying to the support address", () => {
    const pool = Object.values(resourcesIn(variantOut)).find((r) => r.Type === "AWS::Cognito::UserPool")!;
    expect(pool.Properties.EmailConfiguration).toEqual({
      EmailSendingAccount: "COGNITO_DEFAULT",
      ReplyToEmailAddress: instances[0].branding.supportEmail,
    });
  });

  it("leaves out the digest schedules, SES sending, the auth configuration set and the email and digest alarms", () => {
    const variant = resourcesIn(variantOut);
    const dev = resourcesIn(outDir("dev"));
    const types = (rs: Record<string, Resource>) => Object.values(rs).map((r) => r.Type);
    expect(types(dev)).toContain("AWS::Scheduler::Schedule");
    const schedules = Object.values(variant).filter((r) => r.Type === "AWS::Scheduler::Schedule");
    expect(schedules.map((s) => s.Properties.Description)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/digest/i)])
    );
    const actions = Object.values(variant)
      .filter((r) => r.Type === "AWS::IAM::Policy")
      .flatMap((p) => p.Properties.PolicyDocument.Statement as any[])
      .flatMap((s) => [s.Action].flat());
    expect(actions).not.toContain("ses:SendEmail");
    const configSets = Object.values(variant)
      .filter((r) => r.Type === "AWS::SES::ConfigurationSet")
      .map((r) => r.Properties.Name);
    expect(configSets).not.toContain(`${ENVS.dev.ENVIRONMENT}-auth`);
    const alarms = Object.keys(variant).filter((id) => variant[id].Type === "AWS::CloudWatch::Alarm");
    for (const gone of ["DigestStoppedAlarm", "DigestFailingAlarm", "AuthEmailNotDeliveredAlarm"]) {
      expect(Object.keys(dev).some((id) => id.startsWith(gone))).toBe(true);
      expect(alarms.some((id) => id.startsWith(gone))).toBe(false);
    }
  });

  it("only removes resources: every other logical ID matches the SES synth", () => {
    const variant = resourcesIn(variantOut);
    const added = Object.keys(variant).filter((id) => !(id in resourcesIn(outDir("dev"))));
    expect(added).toEqual([]);
  });

  it("tells the UI to hide digest settings", () => {
    const staged = fs
      .readdirSync(variantOut, { recursive: true, encoding: "utf8" })
      .find((f) => f.endsWith(path.join("generated", "instance.json")));
    expect(staged).toBeDefined();
    expect(JSON.parse(fs.readFileSync(path.join(variantOut, staged!), "utf8")).emailDigest).toBe(false);
  });
});

describe("live OpenSearch policy names", () => {
  it("keeps MA staging's", () => {
    expect(ossPolicyNamesFor("gw-eoanf-staging")).toEqual({
      enc: "gw-eoanf-s-oss-enc-policy",
      network: "gw-eoanf-s-oss-network-policy",
      access: "gw-eoanf-s-oss-access-policy",
    });
  });

  it("keeps MA prod's", () => {
    expect(ossPolicyNamesFor("gw-stack-prod")).toEqual({
      enc: "gw-stack-p-oss-enc-policy",
      network: "gw-stack-p-oss-network-policy",
      access: "gw-stack-p-oss-access-policy",
    });
  });
});

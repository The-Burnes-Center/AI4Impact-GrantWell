// The e2e Turnstile bypass must never reach prod. Checked on the synthesized templates, with the dev
// side asserted too so the prod check can't pass because nothing was ever wired.
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";

type Resource = { Type: string; Properties?: any };

let instances: InstanceConfig[];
beforeAll(async () => {
  instances = (await import(path.join(appDir, "config", "instances.ts"))).instances;
});

const configFor = (env: keyof typeof ENVS) => instances.find((i) => i.aws.environment === ENVS[env].ENVIRONMENT)!;

function templateTexts(env: keyof typeof ENVS): string[] {
  const dir = outDir(env);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".template.json"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
}

const resources = (env: keyof typeof ENVS): Resource[] =>
  templateTexts(env).flatMap((t) => Object.values(JSON.parse(t).Resources ?? {}) as Resource[]);

const functions = (env: keyof typeof ENVS) => resources(env).filter((r) => r.Type === "AWS::Lambda::Function");

const signUpTrigger = (env: keyof typeof ENVS) => {
  const found = functions(env).filter((f) => "TURNSTILE_SECRET_KEY" in (f.Properties?.Environment?.Variables ?? {}));
  expect(found).toHaveLength(1);
  return found[0];
};

const statementsNaming = (env: keyof typeof ENVS, needle: string) =>
  resources(env)
    .filter((r) => r.Type === "AWS::IAM::Policy")
    .flatMap((p) => p.Properties.PolicyDocument.Statement as any[])
    .filter((s) => JSON.stringify(s.Resource ?? "").includes(needle));

describe("prod template", () => {
  it("has no e2e config", () => {
    expect(configFor("prod").e2e).toBeUndefined();
  });

  it("gives no function an E2E_ environment variable", () => {
    expect(functions("prod").length).toBeGreaterThanOrEqual(20);
    const offenders = functions("prod").filter((f) =>
      Object.keys(f.Properties?.Environment?.Variables ?? {}).some((k) => k.startsWith("E2E_"))
    );
    expect(offenders).toEqual([]);
  });

  it("never names the bypass parameter or a test address, so no IAM grant either", () => {
    for (const text of templateTexts("prod")) {
      expect(text).not.toContain("e2e/turnstile-bypass");
      expect(text).not.toContain("grantwell.invalid");
    }
  });
});

describe("dev template", () => {
  it("wires the bypass into the sign-in trigger", () => {
    const vars = signUpTrigger("dev").Properties.Environment.Variables;
    expect(vars.E2E_BYPASS_PARAM).toBe("/grantwell-generic-dev/e2e/turnstile-bypass");
    expect(vars.E2E_TEST_EMAILS).toBe(configFor("dev").e2e!.testEmails.join(","));
  });

  it("grants ssm:GetParameter on that one parameter and nothing wider", () => {
    const statements = statementsNaming("dev", "turnstile-bypass");
    expect(statements).toHaveLength(1);
    expect(statements[0].Action).toBe("ssm:GetParameter");
    expect(JSON.stringify(statements[0].Resource)).toContain("parameter/grantwell-generic-dev/e2e/turnstile-bypass\"");
    expect(JSON.stringify(statements[0].Resource)).not.toContain("*");
  });
});

describe("e2e config validation", () => {
  const withE2E = (env: keyof typeof ENVS, testEmails: string[]): InstanceConfig => ({
    ...configFor(env),
    e2e: { testEmails },
  });

  it("rejects e2e on a prod deployment", () => {
    expect(() => validateInstanceConfig(withE2E("prod", ["e2e-dev@grantwell.invalid"]))).toThrow(
      /e2e must not be set on a prod deployment/
    );
  });

  it("rejects test addresses outside @grantwell.invalid", () => {
    expect(() => validateInstanceConfig(withE2E("dev", ["someone@grantwell.us"]))).toThrow(/must end in @grantwell.invalid/);
  });

  it("rejects an empty allowlist", () => {
    expect(() => validateInstanceConfig(withE2E("dev", []))).toThrow(/testEmails is empty/);
  });

  it("accepts Generic dev as configured", () => {
    expect(() => validateInstanceConfig(configFor("dev"))).not.toThrow();
  });
});

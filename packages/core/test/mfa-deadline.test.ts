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

const resources = (env: keyof typeof ENVS): Resource[] =>
  fs
    .readdirSync(outDir(env))
    .filter((f) => f.endsWith(".template.json"))
    .flatMap((f) => Object.values(JSON.parse(fs.readFileSync(path.join(outDir(env), f), "utf8")).Resources ?? {}) as Resource[]);

describe("auth.mfaDeadline", () => {
  it("is midnight Eastern on 2026-11-02 for Generic prod, which keeps MFA optional until then", () => {
    expect(configFor("prod").auth.mfaDeadline).toBe("2026-11-02T00:00:00-05:00");
    expect(Date.parse(configFor("prod").auth.mfaDeadline!)).toBe(Date.UTC(2026, 10, 2, 5));
    expect(configFor("prod").auth.mfaRequired).toBe(false);
  });

  it("must parse and carry an offset", () => {
    const base = configFor("prod");
    const withDeadline = (mfaDeadline: string) => ({ ...base, auth: { ...base.auth, mfaDeadline } });
    expect(() => validateInstanceConfig(withDeadline("2026-11-02T00:00:00Z"))).not.toThrow();
    expect(() => validateInstanceConfig(withDeadline("2026-11-02T00:00:00"))).toThrow(/mfaDeadline/);
    expect(() => validateInstanceConfig(withDeadline("November 2"))).toThrow(/mfaDeadline/);
  });
});

describe.each(["prod", "dev"] as const)("MFA reset on %s", (env) => {
  it("lets the user-management function delete authenticators and sign users out", () => {
    const actions = resources(env)
      .filter((r) => r.Type === "AWS::IAM::Policy")
      .flatMap((p) => p.Properties.PolicyDocument.Statement as any[])
      .flatMap((s) => [s.Action].flat())
      .filter((a) => typeof a === "string");
    expect(actions).toContain("cognito-idp:AdminDeleteSoftwareToken");
    expect(actions).toContain("cognito-idp:AdminUserGlobalSignOut");
  });

  it("routes POST /user-management/users/{username}/mfa-reset through the authorizer", () => {
    const route = resources(env).find(
      (r) => r.Type === "AWS::ApiGatewayV2::Route" && r.Properties.RouteKey === "POST /user-management/users/{username}/mfa-reset"
    );
    expect(route).toBeDefined();
    expect(route!.Properties.AuthorizationType).toBe("JWT");
  });
});

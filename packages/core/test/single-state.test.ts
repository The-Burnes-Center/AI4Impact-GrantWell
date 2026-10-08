import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { resourcesIn, stagedInstance, synthVariant } from "./variant-synth";

// Generic dev as a single-state deployment without Turnstile, as MA runs, synthesized with no Turnstile keys.
let variantOut: string;
let dev: InstanceConfig;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  dev = instances.find((i) => i.id === "generic-dev")!;
  variantOut = synthVariant(
    `(({ e2e, ...rest }) => ({ ...rest, tenancy: "single", states: [{ code: "MA", name: "Massachusetts" }], auth: { mfaRequired: false, mfa: "off", turnstile: false } }))(i as any)`,
    { TURNSTILE_SECRET_KEY: undefined, TURNSTILE_SITE_KEY: undefined }
  );
}, 300_000);

const functionsWith = (dir: string, variable: string) =>
  Object.entries(resourcesIn(dir))
    .filter(([, r]) => r.Type === "AWS::Lambda::Function" && r.Properties.Environment?.Variables?.[variable] !== undefined)
    .map(([id, r]) => [id.replace(/[0-9A-F]{8}$/, ""), r.Properties.Environment.Variables[variable]]);

describe("auth.turnstile: false", () => {
  it("synthesizes without TURNSTILE keys and tells the trigger to skip the check", () => {
    expect(functionsWith(variantOut, "TURNSTILE_DISABLED")).toEqual([["AuthorizationSignUpTriggerFunction", "true"]]);
    expect(functionsWith(variantOut, "TURNSTILE_SECRET_KEY")).toEqual([]);
  });

  it("keeps all three sign-in triggers attached", () => {
    const pool = Object.values(resourcesIn(variantOut)).find((r) => r.Type === "AWS::Cognito::UserPool")!;
    expect(Object.keys(pool.Properties.LambdaConfig).sort()).toEqual(["PostConfirmation", "PreAuthentication", "PreSignUp"]);
  });

  it("leaves out the Turnstile alarms but keeps the other sign-in alarms", () => {
    const alarms = Object.keys(resourcesIn(variantOut)).filter((id) => resourcesIn(variantOut)[id].Type === "AWS::CloudWatch::Alarm");
    expect(alarms.some((id) => id.startsWith("Turnstile"))).toBe(false);
    for (const kept of ["SignInTriggerSlowAlarm", "SignUpRejectionsAlarm", "AccountSetupFailedAlarm"]) {
      expect(alarms.some((id) => id.startsWith(kept))).toBe(true);
    }
  });

  it("must be a boolean, and can't be combined with the e2e bypass", () => {
    expect(() => validateInstanceConfig({ ...dev, auth: { ...dev.auth, turnstile: "no" as any } })).toThrow(/auth.turnstile/);
    expect(() => validateInstanceConfig({ ...dev, auth: { ...dev.auth, turnstile: false } })).toThrow(/e2e only bypasses Turnstile/);
  });
});

describe("tenancy: single", () => {
  it("puts SINGLE_STATE on the sign-in trigger and the user-management function only", () => {
    expect(functionsWith(variantOut, "SINGLE_STATE").sort()).toEqual([
      ["AuthorizationSignUpTriggerFunction", "MA"],
      ["ChatbotAPIManageUsersFunction", "MA"],
    ]);
  });

  it("tells the UI it's single-state, has no bot check and no MFA", () => {
    expect(stagedInstance(variantOut)).toMatchObject({ tenancy: "single", turnstile: false, mfa: "off" });
  });

  it("changes nothing on multi-state Generic", () => {
    expect(functionsWith(outDir("dev"), "SINGLE_STATE")).toEqual([]);
    expect(functionsWith(outDir("dev"), "TURNSTILE_DISABLED")).toEqual([]);
    expect(functionsWith(outDir("dev"), "TURNSTILE_SECRET_KEY")).toHaveLength(1);
  });
});

describe('auth.mfa: "off"', () => {
  it("turns the pool's MFA off", () => {
    const pool = Object.values(resourcesIn(variantOut)).find((r) => r.Type === "AWS::Cognito::UserPool")!;
    expect(pool.Properties.MfaConfiguration).toBe("OFF");
    expect(pool.Properties.EnabledMfas).toBeUndefined();
  });

  it("can't be combined with required MFA or a deadline", () => {
    const off = { ...dev, e2e: undefined, auth: { mfaRequired: false, mfa: "off" as const } };
    expect(() => validateInstanceConfig(off)).not.toThrow();
    expect(() => validateInstanceConfig({ ...off, auth: { ...off.auth, mfaRequired: true } })).toThrow(/mfa "off"/);
    expect(() => validateInstanceConfig({ ...off, auth: { ...off.auth, mfaDeadline: "2026-11-02T00:00:00-05:00" } })).toThrow(/mfa "off"/);
    expect(() => validateInstanceConfig({ ...off, auth: { ...off.auth, mfa: "on" as any } })).toThrow(/can only be "off"/);
  });

  it("leaves Generic's pool optional", () => {
    const pool = Object.values(resourcesIn(outDir("dev"))).find((r) => r.Type === "AWS::Cognito::UserPool")!;
    expect(pool.Properties.MfaConfiguration).toBe("OPTIONAL");
  });
});


import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { stagedInstance, synthVariant } from "./variant-synth";

let dev: InstanceConfig;
let variantOut: string;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
  variantOut = synthVariant("({ ...i, whatsNew: { legacyNotes: true } })");
}, 300_000);

describe("whatsNew.legacyNotes", () => {
  it("is off unless set, so Generic stages nothing", () => {
    expect(stagedInstance(outDir("dev"))).not.toHaveProperty("legacyReleaseNotes");
    expect(stagedInstance(outDir("prod"))).not.toHaveProperty("legacyReleaseNotes");
  });

  it("stages legacyReleaseNotes for the UI when true", () => {
    expect(stagedInstance(variantOut).legacyReleaseNotes).toBe(true);
  });

  it("takes only a boolean legacyNotes", () => {
    const withWhatsNew = (whatsNew: unknown) => ({ ...dev, whatsNew }) as InstanceConfig;
    expect(() => validateInstanceConfig(withWhatsNew({ legacyNotes: false }))).not.toThrow();
    expect(() => validateInstanceConfig(withWhatsNew({}))).not.toThrow();
    expect(() => validateInstanceConfig(withWhatsNew({ legacyNotes: "yes" }))).toThrow(/whatsNew.legacyNotes must be true or false/);
    expect(() => validateInstanceConfig(withWhatsNew({ legacy: true }))).toThrow(/whatsNew only takes legacyNotes/);
    expect(() => validateInstanceConfig(withWhatsNew(true))).toThrow(/whatsNew must be an object/);
  });
});

// States with their own GrantWell site: off unless the multi-state config lists them; then the sign-up
// trigger refuses those states.
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig, type StateSite } from "../lib/config/instance-config";
import { resourcesIn, synthVariant, type Resource } from "./variant-synth";

const COLORADO: StateSite[] = [{ state: "CO", url: "https://colorado.grantwell.us" }];

let dev: InstanceConfig;
let variantOut: string;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
  variantOut = synthVariant(`({ ...i, stateSites: ${JSON.stringify(COLORADO)} })`);
}, 300_000);

const triggerVars = (all: Record<string, Resource>) =>
  Object.entries(all).find(([id, r]) => r.Type === "AWS::Lambda::Function" && id.includes("SignUpTriggerFunction"))![1].Properties
    .Environment.Variables;

describe("validation", () => {
  it("accepts one of the deployment's states with an https origin", () => {
    expect(() => validateInstanceConfig({ ...dev, stateSites: COLORADO })).not.toThrow();
  });

  it.each<[string, StateSite[]]>([
    ["a state the deployment doesn't have", [{ state: "ZZ", url: "https://x.grantwell.us" }]],
    ["an http URL", [{ state: "CO", url: "http://colorado.grantwell.us" }]],
    ["a URL with a path", [{ state: "CO", url: "https://colorado.grantwell.us/" }]],
    ["the same state twice", [...COLORADO, ...COLORADO]],
  ])("rejects %s", (_name, stateSites) => {
    expect(() => validateInstanceConfig({ ...dev, stateSites })).toThrow(/stateSites/);
  });

  it("is only for multi-state deployments", () => {
    const single = { ...dev, tenancy: "single", states: [dev.states.find((s) => s.code === "CO")!], stateSites: COLORADO } as InstanceConfig;
    expect(() => validateInstanceConfig(single)).toThrow(/multi-state/);
  });
});

describe("wiring", () => {
  it.each(Object.keys(ENVS) as (keyof typeof ENVS)[])("gives the %s sign-up trigger no state sites by default", (env) => {
    expect(triggerVars(resourcesIn(outDir(env)))).not.toHaveProperty("STATE_SITES");
  });

  it("gives the sign-up trigger the list when the config sets it", () => {
    expect(JSON.parse(triggerVars(resourcesIn(variantOut)).STATE_SITES)).toEqual(COLORADO);
  });
});

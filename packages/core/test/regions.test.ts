// The Region question: off unless the instance lists regions; then the profile function enforces the
// list and the admin user list reads regions from profile rows.
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { resourcesIn, synthVariant, type Resource } from "./variant-synth";

const REGIONS = ["Region 1", "Region 2", "Region 3"];

let dev: InstanceConfig;
let variantOut: string;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
  variantOut = synthVariant(`({ ...i, regions: ${JSON.stringify(REGIONS)} })`);
}, 300_000);

const functions = (all: Record<string, Resource>) =>
  Object.entries(all).filter(([, r]) => r.Type === "AWS::Lambda::Function");
const fn = (all: Record<string, Resource>, prefix: string) => functions(all).find(([id]) => id.startsWith(prefix))![1];
const vars = (r: Resource) => r.Properties.Environment?.Variables ?? {};

const actionsOf = (all: Record<string, Resource>, f: Resource) => {
  const roleRef = f.Properties.Role["Fn::GetAtt"][0];
  return Object.values(all)
    .filter((p) => p.Type === "AWS::IAM::Policy" && p.Properties.Roles.some((r: any) => r.Ref === roleRef))
    .flatMap((p) => p.Properties.PolicyDocument.Statement)
    .flatMap((s: any) => [s.Action].flat());
};

describe("validation", () => {
  it("accepts a list of distinct, trimmed names", () => {
    expect(() => validateInstanceConfig({ ...dev, regions: REGIONS })).not.toThrow();
    expect(() => validateInstanceConfig({ ...dev, regions: [] })).not.toThrow();
  });

  it.each([[["Region 1", "region 1"]], [[" Region 1"]], [[""]], [["x".repeat(201)]]])("rejects %j", (regions) => {
    expect(() => validateInstanceConfig({ ...dev, regions })).toThrow(/regions/);
  });
});

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(env, () => {
    it("wires the Region question exactly when the config lists regions", async () => {
      const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
      const listed = instances.find((i) => i.aws.environment === ENVS[env].ENVIRONMENT)!.regions ?? [];
      const all = resourcesIn(outDir(env));
      const profileVars = vars(fn(all, "ChatbotAPIUserProfileFunction"));
      const users = fn(all, "ChatbotAPIManageUsersFunction");
      if (listed.length) {
        expect(JSON.parse(profileVars.REGIONS)).toEqual(listed);
        expect(vars(users).REGIONS_ENABLED).toBe("true");
      } else {
        expect(profileVars).not.toHaveProperty("REGIONS");
        expect(vars(users)).not.toHaveProperty("REGIONS_ENABLED");
        expect(actionsOf(all, users)).not.toContain("dynamodb:BatchGetItem");
      }
    });
  });
}

describe("with regions", () => {
  let all: Record<string, Resource>;
  beforeAll(() => {
    all = resourcesIn(variantOut);
  });

  it("gives the profile function the list", () => {
    expect(JSON.parse(vars(fn(all, "ChatbotAPIUserProfileFunction")).REGIONS)).toEqual(REGIONS);
  });

  it("lets the user-management function read profile rows", () => {
    const users = fn(all, "ChatbotAPIManageUsersFunction");
    expect(vars(users).REGIONS_ENABLED).toBe("true");
    expect(actionsOf(all, users)).toContain("dynamodb:BatchGetItem");
  });
});

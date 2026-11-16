// The structured profile step: off unless the instance sets profileForm; then the profile function
// checks answers against its lists and the admin user list reads them from profile rows.
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig, type ProfileForm } from "../lib/config/instance-config";
import { resourcesIn, synthVariant, type Resource } from "./variant-synth";

const FORM: ProfileForm = {
  title: "Tell us who you represent",
  lead: "We use this information to tell us who is using GrantWell.",
  applicantTypes: [
    { name: "State Government / Agency", organization: "entity", location: false },
    { name: "501(c)(3) Nonprofit", organization: "name", location: true },
    { name: "Individual / Public", organization: "none", location: true, defaultRole: "Individual / Community Member" },
  ],
  entities: { label: "State entity", choices: ["Department of Transportation (CDOT)", "Department of Revenue (DOR)"] },
  locations: { label: "County", all: "Statewide / Multi-County", choices: ["Adams", "Denver"] },
};

let dev: InstanceConfig;
let variantOut: string;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
  variantOut = synthVariant(`({ ...i, profileForm: ${JSON.stringify(FORM)} })`);
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
  const withForm = (form: unknown, extra: Partial<InstanceConfig> = {}) => () =>
    validateInstanceConfig({ ...dev, ...extra, profileForm: form as ProfileForm });

  it("accepts a complete form", () => {
    expect(withForm(FORM)).not.toThrow();
  });

  it.each([
    ["no applicant types", { ...FORM, applicantTypes: [] }, /applicantTypes/],
    ["a duplicate type", { ...FORM, applicantTypes: [FORM.applicantTypes[1], { ...FORM.applicantTypes[1], name: "501(c)(3) nonprofit" }] }, /duplicates/],
    ["an unknown organization mode", { ...FORM, applicantTypes: [{ ...FORM.applicantTypes[0], organization: "list" }] }, /organization must be/],
    ["entities missing for an entity type", { ...FORM, entities: undefined }, /entities/],
    ["entities nobody uses", { ...FORM, applicantTypes: [FORM.applicantTypes[1]] }, /entities is set/],
    ["locations missing for a location type", { ...FORM, locations: undefined }, /locations/],
    ["the all option repeated as a choice", { ...FORM, locations: { ...FORM.locations!, choices: ["Adams", "statewide / multi-county"] } }, /repeat the all option/],
    ["an untrimmed title", { ...FORM, title: " Tell us" }, /title/],
  ])("rejects %s", (_, form, message) => {
    expect(withForm(form)).toThrow(message);
  });

  it("can't be combined with regions", () => {
    expect(withForm(FORM, { regions: ["Region 1"] })).toThrow(/remove regions/);
  });

  it("rejects lists too long for the profile function's environment", () => {
    const choices = Array.from({ length: 200 }, (_, i) => `Location number ${i}`);
    expect(withForm({ ...FORM, locations: { ...FORM.locations!, choices } })).toThrow(/too large/);
  });
});

describe("with profileForm", () => {
  let all: Record<string, Resource>;
  beforeAll(() => {
    all = resourcesIn(variantOut);
  });

  it("gives the profile function the lists, not the copy", () => {
    const env = JSON.parse(vars(fn(all, "ChatbotAPIUserProfileFunction")).PROFILE_FORM);
    expect(env).toEqual({
      types: [
        ["State Government / Agency", "entity", false],
        ["501(c)(3) Nonprofit", "name", true],
        ["Individual / Public", "none", true],
      ],
      entities: FORM.entities!.choices,
      all: "Statewide / Multi-County",
      locations: ["Adams", "Denver"],
    });
  });

  it("lets the user-management function read profile rows", () => {
    const users = fn(all, "ChatbotAPIManageUsersFunction");
    expect(vars(users).PROFILE_FORM_ENABLED).toBe("true");
    expect(actionsOf(all, users)).toContain("dynamodb:BatchGetItem");
  });
});

import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { ossPolicyNamesFor } from "../lib/chatbot-api/opensearch/opensearch";
import { resourcesIn, stagedInstance, synthVariant, type Resource } from "./variant-synth";

// Generic dev, switched to Cognito's sender: the only difference from the dev synth the other tests use.
let variantOut: string;
let instances: InstanceConfig[];
beforeAll(async () => {
  instances = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  variantOut = synthVariant("{ ...i, email: { cognitoDefault: true } }");
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
    expect(stagedInstance(variantOut).emailDigest).toBe(false);
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

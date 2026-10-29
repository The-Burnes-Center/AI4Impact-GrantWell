import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { resourcesIn, stagedInstance, synthVariant } from "./variant-synth";

const SENDER = "no-reply.grantwell@example.gov";

// Generic dev, sending from an address identity on a domain it doesn't own.
let variantOut: string;
let instances: InstanceConfig[];
beforeAll(async () => {
  instances = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  variantOut = synthVariant(`{ ...i, email: { sender: "${SENDER}", identity: "address", manageSenderIdentity: false } }`);
}, 300_000);

describe('email.identity "address"', () => {
  it("must leave the identity to be verified by hand", () => {
    const dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
    const email = { sender: SENDER, identity: "address" as const };
    expect(() => validateInstanceConfig({ ...dev, email: { ...email, manageSenderIdentity: false } })).not.toThrow();
    expect(() => validateInstanceConfig({ ...dev, email: { ...email, manageSenderIdentity: true } })).toThrow(
      /needs manageSenderIdentity: false/
    );
    expect(() =>
      validateInstanceConfig({ ...dev, email: { sender: SENDER, identity: "mailbox", manageSenderIdentity: false } as any })
    ).toThrow(/email.identity must be/);
  });

  it("points Cognito at the address identity", () => {
    const pool = Object.values(resourcesIn(variantOut)).find((r) => r.Type === "AWS::Cognito::UserPool")!;
    const { EmailConfiguration } = pool.Properties;
    expect(EmailConfiguration.EmailSendingAccount).toBe("DEVELOPER");
    expect(EmailConfiguration.From).toBe(`GrantWell <${SENDER}>`);
    expect(JSON.stringify(EmailConfiguration.SourceArn)).toContain(`:identity/${SENDER}`);
  });

  it("creates no SES identity and keeps the digest", () => {
    const types = Object.values(resourcesIn(variantOut)).map((r) => r.Type);
    expect(types).not.toContain("AWS::SES::EmailIdentity");
    expect(stagedInstance(variantOut).emailDigest).not.toBe(false);
  });
});

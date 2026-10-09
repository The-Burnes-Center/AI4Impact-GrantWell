// The weekday processing-queue email: on only where configured, at 09:00 Eastern on weekdays, and
// able to read exactly one SSM parameter that CDK never creates.
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

const templates = (env: keyof typeof ENVS) =>
  fs
    .readdirSync(outDir(env))
    .filter((f) => f.endsWith(".template.json"))
    .map((f) => fs.readFileSync(path.join(outDir(env), f), "utf8"));

const resources = (env: keyof typeof ENVS): Record<string, Resource> =>
  Object.assign({}, ...templates(env).map((t) => JSON.parse(t).Resources ?? {}));

const PARAM = "/grantwell-generic-prod/queue-email/recipients";

function queueEmailFunction(env: keyof typeof ENVS) {
  return Object.entries(resources(env)).filter(
    ([, r]) => r.Type === "AWS::Lambda::Function" && r.Properties?.Environment?.Variables?.RECIPIENTS_PARAMETER
  );
}

describe("prod (processingQueueEmail on)", () => {
  it("is turned on in config", () => {
    expect(configFor("prod").notifications?.processingQueueEmail).toBe(true);
  });

  it("has one function reading the recipients from the deployment's parameter", () => {
    const found = queueEmailFunction("prod");
    expect(found).toHaveLength(1);
    const vars = found[0][1].Properties.Environment.Variables;
    expect(vars).toMatchObject({
      RECIPIENTS_PARAMETER: PARAM,
      NOTIFICATION_SENDER: "no-reply@grantwell.us",
      DEPLOYMENT_URL: "https://grantwell.us",
      DEPLOYMENT_ID: "generic-prod",
    });
    expect(found[0][1].Properties.Runtime).toBe("nodejs24.x");
  });

  it("runs at 09:00 America/New_York on weekdays, through Scheduler so DST doesn't shift it", () => {
    const [fnId] = queueEmailFunction("prod")[0];
    const schedules = Object.values(resources("prod")).filter(
      (r) => r.Type === "AWS::Scheduler::Schedule" && JSON.stringify(r.Properties.Target.Arn).includes(fnId)
    );
    expect(schedules).toHaveLength(1);
    expect(schedules[0].Properties).toMatchObject({
      ScheduleExpression: "cron(0 9 ? * MON-FRI *)",
      ScheduleExpressionTimezone: "America/New_York",
      State: "ENABLED",
    });
  });

  it("may read exactly that parameter and send only from the deployment's sender", () => {
    const all = resources("prod");
    const [fnId, fn] = queueEmailFunction("prod")[0];
    const roleId = fn.Properties.Role["Fn::GetAtt"][0];
    const statements = Object.values(all)
      .filter((r) => r.Type === "AWS::IAM::Policy" && r.Properties.Roles.some((role: any) => role.Ref === roleId))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as any[]);

    const ssm = statements.filter((s) => [s.Action].flat().some((a: string) => a.startsWith("ssm:")));
    expect(ssm).toHaveLength(1);
    expect(ssm[0].Action).toBe("ssm:GetParameter");
    const resource = JSON.stringify(ssm[0].Resource);
    expect(resource).toContain(`:parameter${PARAM}"`);
    expect(resource).not.toContain("*");

    const sesStatements = statements.filter((s) => [s.Action].flat().some((a: string) => a.startsWith("ses:")));
    expect(sesStatements).toHaveLength(1);
    expect(sesStatements[0].Action).toBe("ses:SendEmail");
    expect(sesStatements[0].Condition).toEqual({ StringEquals: { "ses:FromAddress": "no-reply@grantwell.us" } });

    const writes = statements.flatMap((s) => [s.Action].flat()).filter((a: string) => /Put|Update|Delete|Write/.test(a));
    expect(writes, fnId).toEqual([]);
  });

  it("never creates the recipients parameter or names an address beyond the sender", () => {
    const parameters = Object.values(resources("prod"))
      .filter((r) => r.Type === "AWS::SSM::Parameter")
      .map((r) => r.Properties.Name);
    expect(parameters).not.toContain(PARAM);
    const vars = JSON.stringify(queueEmailFunction("prod")[0][1].Properties.Environment.Variables);
    expect(vars.match(/[\w.+-]+@[\w-]+\.[\w.]+/g)).toEqual(["no-reply@grantwell.us"]);
  });
});

describe("dev (processingQueueEmail off)", () => {
  it("leaves the option unset", () => {
    expect(configFor("dev").notifications?.processingQueueEmail).toBeUndefined();
  });

  it("has no function, schedule or permission for it", () => {
    expect(queueEmailFunction("dev")).toEqual([]);
    for (const text of templates("dev")) {
      expect(text).not.toContain("queue-email/recipients");
      expect(text).not.toContain("MON-FRI");
    }
  });
});

describe("processingQueueEmail config validation", () => {
  it("rejects it on a deployment that sends with Cognito's default sender", () => {
    const prod = configFor("prod");
    expect(() => validateInstanceConfig(prod)).not.toThrow();
    expect(() => validateInstanceConfig({ ...prod, email: { cognitoDefault: true } })).toThrow(
      /notifications\.processingQueueEmail needs SES, but email is \{ cognitoDefault: true \}/
    );
    expect(() =>
      validateInstanceConfig({ ...prod, email: { cognitoDefault: true }, notifications: { processingQueueEmail: false } })
    ).not.toThrow();
  });

  it("only takes true or false", () => {
    const prod = configFor("prod");
    expect(() => validateInstanceConfig({ ...prod, notifications: { processingQueueEmail: "yes" as any } })).toThrow(
      /processingQueueEmail must be true or false/
    );
  });
});

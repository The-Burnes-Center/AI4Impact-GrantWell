// Abuse and cost limits: stage-wide API throttling, the chat Lambda's reserved concurrency, and
// the per-user daily caps with their counter table. Defaults apply unless the instance overrides them.
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { DEFAULT_LIMITS, limits, validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { resourcesIn, synthVariant, type Resource } from "./variant-synth";

let dev: InstanceConfig;
let variantOut: string;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
  variantOut = synthVariant(
    `({ ...i, limits: { chatMessagesPerDay: 40, applicationsPerDay: 3, chatConcurrency: 12, httpApiThrottle: { rateLimit: 20, burstLimit: 30 }, websocketThrottle: { rateLimit: 5, burstLimit: 8 } } })`
  );
}, 300_000);

const ofType = (all: Record<string, Resource>, type: string) => Object.entries(all).filter(([, r]) => r.Type === type);

const chatFunction = (all: Record<string, Resource>) =>
  ofType(all, "AWS::Lambda::Function").find(([id]) => id.startsWith("ChatbotAPIChatHandlerFunction"))![1];
const draftStartFunction = (all: Record<string, Resource>) =>
  ofType(all, "AWS::Lambda::Function").find(([id]) => id.startsWith("ChatbotAPIDraftGeneratorAPIFunction"))![1];

const httpStage = (all: Record<string, Resource>) =>
  ofType(all, "AWS::ApiGatewayV2::Stage").find(([, r]) => r.Properties.StageName === "$default")![1];
const wsStage = (all: Record<string, Resource>) =>
  ofType(all, "AWS::ApiGatewayV2::Stage").find(([, r]) => r.Properties.StageName === "prod")![1];

const updateItemGrantedOn = (all: Record<string, Resource>, fn: Resource) => {
  const roleRef = fn.Properties.Role["Fn::GetAtt"][0];
  return ofType(all, "AWS::IAM::Policy")
    .filter(([, p]) => p.Properties.Roles.some((r: any) => r.Ref === roleRef))
    .flatMap(([, p]) => p.Properties.PolicyDocument.Statement)
    .filter((s: any) => [s.Action].flat().includes("dynamodb:UpdateItem"))
    .map((s: any) => JSON.stringify(s.Resource));
};

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} defaults`, () => {
    let all: Record<string, Resource>;
    beforeAll(() => {
      all = resourcesIn(outDir(env));
    });

    it("throttles the HTTP API's stage at 200 requests a second, bursts of 400", () => {
      expect(httpStage(all).Properties.DefaultRouteSettings).toEqual({ ThrottlingRateLimit: 200, ThrottlingBurstLimit: 400 });
    });

    it("throttles the WebSocket API's stage at 50 messages a second, bursts of 100", () => {
      expect(wsStage(all).Properties.DefaultRouteSettings).toEqual({ ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 });
    });

    it("reserves 25 concurrent executions for chat", () => {
      expect(chatFunction(all).Properties.ReservedConcurrentExecutions).toBe(25);
    });

    it("keeps the daily counters in a retained, recoverable table that expires its rows", () => {
      const [, table] = ofType(all, "AWS::DynamoDB::Table").find(([id]) => id.startsWith("DailyUsageTable"))!;
      expect(table.Properties).toMatchObject({
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        BillingMode: "PAY_PER_REQUEST",
        TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        DeletionProtectionEnabled: true,
      });
      expect((table as any).DeletionPolicy).toBe("Retain");
      expect((table as any).UpdateReplacePolicy).toBe("Retain");
    });

    it("gives chat and the application start their caps, and UpdateItem on the counter table", () => {
      const chat = chatFunction(all);
      expect(chat.Properties.Environment.Variables).toMatchObject({ CHAT_MESSAGES_PER_DAY: "100" });
      expect(chat.Properties.Environment.Variables.DAILY_USAGE_TABLE_NAME).toBeDefined();
      const start = draftStartFunction(all);
      expect(start.Properties.Environment.Variables).toMatchObject({ APPLICATIONS_PER_DAY: "10" });
      expect(start.Properties.Environment.Variables.DAILY_USAGE_TABLE_NAME).toBeDefined();
      for (const fn of [chat, start]) {
        const grants = updateItemGrantedOn(all, fn);
        expect(grants.some((r) => r.includes("DailyUsageTable"))).toBe(true);
      }
    });
  });
}

describe("limits overridden in the instance config", () => {
  let all: Record<string, Resource>;
  beforeAll(() => {
    all = resourcesIn(variantOut);
  });

  it("uses the configured throttles, concurrency and caps", () => {
    expect(httpStage(all).Properties.DefaultRouteSettings).toEqual({ ThrottlingRateLimit: 20, ThrottlingBurstLimit: 30 });
    expect(wsStage(all).Properties.DefaultRouteSettings).toEqual({ ThrottlingRateLimit: 5, ThrottlingBurstLimit: 8 });
    expect(chatFunction(all).Properties.ReservedConcurrentExecutions).toBe(12);
    expect(chatFunction(all).Properties.Environment.Variables.CHAT_MESSAGES_PER_DAY).toBe("40");
    expect(draftStartFunction(all).Properties.Environment.Variables.APPLICATIONS_PER_DAY).toBe("3");
  });
});

describe("limits config", () => {
  it("defaults every key, and lets an instance override any one", () => {
    expect(limits({ ...dev, limits: undefined })).toEqual(DEFAULT_LIMITS);
    expect(limits({ ...dev, limits: { chatMessagesPerDay: 40 } })).toEqual({ ...DEFAULT_LIMITS, chatMessagesPerDay: 40 });
  });

  it("accepts valid overrides", () => {
    expect(() =>
      validateInstanceConfig({
        ...dev,
        limits: { chatMessagesPerDay: 1, applicationsPerDay: 1, chatConcurrency: 1, httpApiThrottle: { rateLimit: 0.5, burstLimit: 1 } },
      })
    ).not.toThrow();
  });

  it.each([
    [{ chatMessagesPerDay: 0 }, /limits.chatMessagesPerDay must be a positive whole number/],
    [{ applicationsPerDay: 2.5 }, /limits.applicationsPerDay must be a positive whole number/],
    [{ chatConcurrency: "25" }, /limits.chatConcurrency must be a positive whole number/],
    [{ httpApiThrottle: { rateLimit: 0, burstLimit: 10 } }, /limits.httpApiThrottle must be/],
    [{ websocketThrottle: { rateLimit: 10 } }, /limits.websocketThrottle must be/],
    [{ chatMessages: 100 }, /limits has unknown keys: chatMessages/],
  ])("rejects %j", (given, problem) => {
    expect(() => validateInstanceConfig({ ...dev, limits: given as any })).toThrow(problem);
  });
});

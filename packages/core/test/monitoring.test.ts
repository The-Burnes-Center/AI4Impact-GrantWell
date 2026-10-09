// Pins the alarm set. An alarm that can't fire looks exactly like a system that never breaks, so
// every property whose silent loss would leave Slack quiet during an outage is asserted here.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";
import { LOG_MARKERS } from "../lib/monitoring/monitoring-stack";

type Resource = { Type: string; Properties?: any; DependsOn?: string[] };

const PREFIX = { dev: "grantwell-generic-dev", prod: "grantwell-generic-prod" } as const;

// [name suffix, severity, threshold]
const COMMON_ALARMS: [string, string, number][] = [
  ["alerting itself is broken", "critical", 1],
  ["alerts are not reaching the formatter", "critical", 1],
  ["site returning errors", "critical", 10],
  ["API returning 5xx", "critical", 5],
  ["chat is failing", "critical", 3],
  ["chat cannot connect", "critical", 3],
  ["chat throttled", "critical", 1],
  ["sign-up bot check unreachable", "critical", 3],
  ["sign-up bot check not configured", "critical", 1],
  ["sign-in slow: trigger nearing Cognito's 5-second limit", "critical", 3000],
  ["sign-ups being rejected in bulk", "medium", 10],
  ["account setup step failed", "medium", 1],
  ["sign-in emails not delivered", "medium", 3],
  ["chat cannot search NOFOs", "medium", 3],
  ["grant search returning nothing", "medium", 3],
  ["uploaded documents not indexed", "medium", 1],
  ["document index sync failing", "medium", 3],
  ["draft history not being saved", "medium", 1],
  ["draft history records lost", "medium", 1],
  ["NOFO processing failed outright", "medium", 1],
  ["NOFO processing timed out", "medium", 1],
  // One failing NOFO is 1 + retries Errors (ExtractText retries TaskFailed twice), so these mean more than one NOFO.
  ["NOFO step failing: text extraction", "medium", 4],
  ["NOFO step failing: analysis", "medium", 2],
  ["NOFO step failing: synthesis", "medium", 2],
  ["NOFO step failing: content check", "medium", 2],
  ["NOFO uploads not starting", "medium", 5],
  ["draft generation failing", "medium", 1],
  ["draft sections failing", "medium", 4],
  ["PDF exports failing", "medium", 2],
  ["grants.gov scrape failed", "medium", 1],
  ["failed-NOFO sweep has stopped", "medium", 1],
  ["failed-NOFO sweep failing", "medium", 2],
  ["notification digest has stopped", "medium", 1],
  ["notification digest failing", "medium", 1],
  ["expired-NOFO archiving failing", "low", 1],
  ["a GrantWell function is failing to start", "medium", 1],
  ["the function start-up check has stopped", "medium", 1],
  ["AI models not responding", "critical", 1],
  ["the daily AI model check has stopped", "medium", 1],
];

// Prod only: the SES identity owner, the scheduled scrape, the daily brief and the processing-queue email.
const PROD_ONLY_ALARMS: [string, string, number][] = [
  ["SES bounce rate heading for a sending pause", "medium", 0.05],
  ["processing-queue email failing", "low", 1],
  ["daily grants.gov scrape has stopped", "medium", 1],
  ["the daily health brief has stopped running", "low", 1],
  ["the daily health brief is failing", "medium", 1],
];

const DAILY_HEARTBEATS = [
  "daily grants.gov scrape has stopped",
  "notification digest has stopped",
  "the daily health brief has stopped running",
  "the daily AI model check has stopped",
];
const HEARTBEATS = [...DAILY_HEARTBEATS, "failed-NOFO sweep has stopped", "the function start-up check has stopped"];

// The canary runs once a day: NOT_BREACHING would read the empty hours after a failed run as recovered.
const HOLDS_STATE = ["AI models not responding"];

// Generic dev has the processing-queue email off, so nothing there logs this marker.
const PROD_ONLY_MARKERS = ["queueEmailSendFailed"];

const DIRECT_TO_ALERTS = ["alerting itself is broken", "alerts are not reaching the formatter"];

function monitoringTemplate(env: keyof typeof ENVS): Record<string, Resource> {
  const dir = outDir(env);
  const file = fs.readdirSync(dir).find((f) => /ChatbotAPIMonitoringStack[0-9A-F]{8}\.nested\.template\.json$/.test(f));
  if (!file) throw new Error(`No monitoring nested template in ${dir}`);
  return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).Resources;
}

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} monitoring`, () => {
    const resources = monitoringTemplate(env);
    const ofType = (type: string) => Object.entries(resources).filter(([, r]) => r.Type === type);
    const prefix = PREFIX[env];
    const topicId = (name: string) => {
      const found = ofType("AWS::SNS::Topic").find(([, r]) => r.Properties.TopicName === name);
      if (!found) throw new Error(`No topic ${name}`);
      return found[0];
    };
    const alarmTopic = topicId(`${prefix}-alarms`);
    const alertTopic = topicId(`${prefix}-alerts`);
    const alarms = ofType("AWS::CloudWatch::Alarm").map(([, r]) => r.Properties);
    const byName = (suffix: string) => {
      const found = alarms.find((a) => a.AlarmName === `${prefix} ${suffix}`);
      if (!found) throw new Error(`No alarm "${suffix}"`);
      return found;
    };
    const expected = env === "prod" ? [...COMMON_ALARMS, ...PROD_ONLY_ALARMS] : COMMON_ALARMS;

    it("has exactly the expected alarms", () => {
      expect(alarms.map((a) => a.AlarmName).sort()).toEqual(expected.map(([n]) => `${prefix} ${n}`).sort());
    });

    it("pins each alarm's severity and threshold", () => {
      for (const [name, severity, threshold] of expected) {
        const alarm = byName(name);
        expect(alarm.AlarmDescription.startsWith(`[${severity}] `), name).toBe(true);
        expect(alarm.Threshold, name).toBe(threshold);
      }
    });

    it("keeps every description short enough for a Slack card", () => {
      for (const alarm of alarms) expect(alarm.AlarmDescription.length, alarm.AlarmName).toBeLessThanOrEqual(250);
    });

    it("sends ALARM to the formatter, except the formatter's own alarms, and OK always to the formatter", () => {
      for (const alarm of alarms) {
        const suffix = alarm.AlarmName.slice(prefix.length + 1);
        const target = DIRECT_TO_ALERTS.includes(suffix) ? alertTopic : alarmTopic;
        expect(alarm.AlarmActions, suffix).toEqual([{ Ref: target }]);
        expect(alarm.OKActions, suffix).toEqual([{ Ref: alarmTopic }]);
      }
    });

    it("treats missing data as breaching on heartbeats only, and holds state only on the canary", () => {
      for (const alarm of alarms) {
        const suffix = alarm.AlarmName.slice(prefix.length + 1);
        const expected = HEARTBEATS.includes(suffix) ? "breaching" : HOLDS_STATE.includes(suffix) ? "ignore" : "notBreaching";
        expect(alarm.TreatMissingData, suffix).toBe(expected);
      }
    });

    it("evaluates daily heartbeats over 24 one-hour periods, never one period over a day", () => {
      for (const suffix of DAILY_HEARTBEATS) {
        if (!alarms.some((a) => a.AlarmName === `${prefix} ${suffix}`)) continue;
        const alarm = byName(suffix);
        expect(alarm.Period, suffix).toBe(3600);
        expect(alarm.EvaluationPeriods, suffix).toBe(24);
        expect(alarm.DatapointsToAlarm, suffix).toBe(24);
        expect(alarm.ComparisonOperator, suffix).toBe("LessThanThreshold");
      }
    });

    it("subscribes the formatter to the alarms topic and points it at the alerts topic", () => {
      const subs = ofType("AWS::SNS::Subscription").map(([, r]) => r.Properties);
      expect(subs).toHaveLength(1);
      expect(subs[0].TopicArn).toEqual({ Ref: alarmTopic });
      const formatter = ofType("AWS::Lambda::Function").find(([id]) => id.startsWith("AlertFormatterFunction"));
      expect(formatter?.[1].Properties.Environment.Variables).toMatchObject({
        ALERT_TOPIC_ARN: { Ref: alertTopic },
        STAGE: env,
        ALARM_PREFIX: `${prefix} `,
      });
    });

    it("counts exactly the pinned log markers, each after its log group is ensured", () => {
      const filters = ofType("AWS::Logs::MetricFilter");
      const patterns = filters.map(([, r]) => r.Properties.FilterPattern).sort();
      const quote = (s: string) => `"${s}"`;
      const expectedPatterns = Object.entries(LOG_MARKERS)
        .filter(([key]) => env === "prod" || !PROD_ONLY_MARKERS.includes(key))
        .map(([, phrases]) => (phrases.length === 1 ? quote(phrases[0]) : phrases.map((p) => `?${quote(p)}`).join(" ")))
        .sort();
      expect(patterns).toEqual(expectedPatterns);
      for (const [id, filter] of filters) {
        expect(filter.Properties.MetricTransformations[0].MetricNamespace, id).toBe(prefix);
        const deps = filter.DependsOn ?? [];
        expect(deps.some((d) => resources[d]?.Type === "Custom::AWS"), id).toBe(true);
      }
    });

    it("builds the daily brief only where configured", () => {
      const parameters = ofType("AWS::SSM::Parameter").map(([, r]) => r.Properties.Name);
      const rules = ofType("AWS::Events::Rule").map(([, r]) => r.Properties.ScheduleExpression).sort();
      const always = ["cron(30 12 * * ? *)", "rate(15 minutes)"];
      if (env === "prod") {
        expect(parameters).toEqual([`/${prefix}/daily-brief/components`]);
        expect(rules).toEqual(["cron(0 13 * * ? *)", ...always].sort());
      } else {
        expect(parameters).toEqual([]);
        expect(rules).toEqual(always);
      }
    });

    const fnNamed = (name: string) => {
      const found = ofType("AWS::Lambda::Function").find(([, r]) => r.Properties.FunctionName === name);
      if (!found) throw new Error(`No function ${name}`);
      return found;
    };
    const policyOf = (fnId: string) => {
      const roleId = resources[fnId].Properties.Role["Fn::GetAtt"][0];
      const policy = ofType("AWS::IAM::Policy").find(([, r]) => r.Properties.Roles.some((role: any) => role.Ref === roleId));
      return policy![1].Properties.PolicyDocument.Statement as any[];
    };

    it("scans every Lambda log group under the stack name, publishing only to its own namespace", () => {
      const [id, scan] = fnNamed(`${prefix}-init-error-scan`);
      expect(scan.Properties.Runtime).toBe("nodejs24.x");
      expect(scan.Properties.Environment.Variables).toMatchObject({
        LOG_GROUP_PREFIX: `/aws/lambda/${ENVS[env].STACK_NAME}-`,
        METRIC_NAMESPACE: prefix,
        METRIC_NAME: "LambdaInitErrors",
      });
      const statements = policyOf(id);
      const startQuery = statements.find((s) => s.Action === "logs:StartQuery");
      expect(JSON.stringify(startQuery.Resource)).toContain(`:log-group:/aws/lambda/${ENVS[env].STACK_NAME}-*`);
      const put = statements.find((s) => s.Action === "cloudwatch:PutMetricData");
      expect(put.Condition).toEqual({ StringEquals: { "cloudwatch:namespace": prefix } });
      const alarm = byName("a GrantWell function is failing to start");
      expect([alarm.Namespace, alarm.MetricName, alarm.Statistic]).toEqual([prefix, "LambdaInitErrors", "Sum"]);
    });

    it("gives the model canary every Bedrock model and only InvokeModel on them", () => {
      const [id, canary] = fnNamed(`${prefix}-model-canary`);
      expect(canary.Properties.Runtime).toBe("nodejs24.x");
      const models = JSON.stringify(canary.Properties.Environment.Variables.MODELS);
      for (const profile of ["SonnetChat", "SonnetNofo", "SonnetDraft", "HaikuNofo", "HaikuScraper", "TitanSearch"]) {
        expect(models, profile).toMatch(new RegExp(`ChatbotAPI${profile}InferenceProfile[0-9A-F]{8}InferenceProfileArn`));
      }
      expect(models).not.toContain("amazon.titan-embed-text-v2:0");
      expect(models).toContain("cohere.rerank-v3-5:0");
      const actions = policyOf(id).map((s) => s.Action).sort();
      expect(actions).toEqual(["bedrock:InvokeModel", "bedrock:Rerank"]);
      expect(policyOf(id).find((s) => s.Action === "bedrock:InvokeModel").Resource).not.toContain("*");
    });

    it("names the canary in a root stack output, without an export, for the deploy step", () => {
      const app = JSON.parse(fs.readFileSync(path.join(outDir(env), `${ENVS[env].STACK_NAME}.template.json`), "utf8"));
      expect(app.Outputs.ModelCanaryFunctionName).toMatchObject({ Value: `${prefix}-model-canary` });
      expect(app.Outputs.ModelCanaryFunctionName.Export).toBeUndefined();
    });
  });
}

// The per-grant search index: who may read and write it, what rebuilds it, and that grant search no
// longer touches OpenSearch or the Knowledge Base.
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";
import { resourcesIn, type Resource } from "./variant-synth";

const statementsOf = (all: Record<string, Resource>, fnId: string) => {
  const roleRef = all[fnId].Properties.Role["Fn::GetAtt"][0];
  return Object.values(all)
    .filter((r) => r.Type === "AWS::IAM::Policy" && r.Properties.Roles.some((x: any) => x.Ref === roleRef))
    .flatMap((p) => p.Properties.PolicyDocument.Statement);
};
const actionsOf = (statements: any[]) => statements.flatMap((s) => [s.Action].flat());
const resourcesFor = (statements: any[], action: string) =>
  statements.filter((s) => [s.Action].flat().includes(action)).map((s) => JSON.stringify(s.Resource));

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} search index`, () => {
    const all = resourcesIn(outDir(env));
    const fnId = (prefix: string) => Object.keys(all).find((id) => id.startsWith(prefix) && all[id].Type === "AWS::Lambda::Function")!;
    const searchId = fnId("ChatbotAPIAIGrantSearchFunction");
    const builderId = fnId("ChatbotAPISearchIndexBuilderFunction");
    const search = statementsOf(all, searchId);
    const builder = statementsOf(all, builderId);

    it("gives grant search no OpenSearch, Knowledge Base or rerank access", () => {
      expect(actionsOf(search).filter((a) => /^aoss:|Retrieve|Rerank/.test(a))).toEqual([]);
      expect(Object.keys(all[searchId].Properties.Environment.Variables).filter((k) => k.startsWith("OPENSEARCH"))).toEqual([]);
      expect(JSON.stringify(search)).not.toMatch(/cohere|knowledge-base/);
    });

    it("lets grant search read only the index prefix and invoke only Titan", () => {
      expect(resourcesFor(search, "s3:GetObject")).toEqual([expect.stringContaining('"/_search/*"')]);
      expect(actionsOf(search).filter((a) => a.startsWith("s3:")).sort()).toEqual(["s3:GetObject", "s3:ListBucket"]);
      expect(resourcesFor(search, "bedrock:InvokeModel").join()).toMatch(/TitanSearchInferenceProfile/);
      expect(resourcesFor(search, "bedrock:InvokeModel").join()).not.toMatch(/Haiku|anthropic/);
    });

    it("lets only the builder write the index, and only under _search/", () => {
      for (const action of ["s3:PutObject", "s3:DeleteObject"]) {
        expect(resourcesFor(builder, action)).toEqual([expect.stringContaining('"/_search/*"')]);
      }
      expect(resourcesFor(builder, "bedrock:InvokeModel").join()).toMatch(/HaikuSearchInferenceProfile.*TitanSearchInferenceProfile|TitanSearchInferenceProfile.*HaikuSearchInferenceProfile/);
      expect(actionsOf(builder).filter((a) => a.startsWith("dynamodb:"))).toEqual(["dynamodb:Scan"]);
    });

    it("rebuilds on summary.json changes through a queue, nightly at 06:30 UTC and once on deploy", () => {
      const [, notifications] = Object.entries(all).find(([id, r]) => id.startsWith("ChatbotAPIGrantArtifactsBucketNotifications") && r.Type === "Custom::S3BucketNotifications")!;
      const queues = notifications.Properties.NotificationConfiguration.QueueConfigurations.filter((q: any) =>
        q.Filter.Key.FilterRules.some((r: any) => r.Value === "/summary.json")
      );
      expect(queues.map((q: any) => [q.Events, q.Filter.Key.FilterRules])).toEqual([
        [["s3:ObjectCreated:*"], [{ Name: "suffix", Value: "/summary.json" }]],
        [["s3:ObjectRemoved:*"], [{ Name: "suffix", Value: "/summary.json" }]],
      ]);
      const mapping = Object.values(all).find((r) => r.Type === "AWS::Lambda::EventSourceMapping" && r.Properties.FunctionName.Ref === builderId)!;
      expect(mapping.Properties).toMatchObject({ BatchSize: 100, MaximumBatchingWindowInSeconds: 60, ScalingConfig: { MaximumConcurrency: 2 } });

      const rule = Object.values(all).find((r) => r.Type === "AWS::Events::Rule" && r.Properties.Targets?.some((t: any) => JSON.stringify(t.Arn).includes(builderId)))!;
      expect(rule.Properties.ScheduleExpression).toBe("cron(30 6 * * ? *)");
      expect(JSON.parse(rule.Properties.Targets[0].Input)).toEqual({ full: true });

      const initial = Object.entries(all).find(([id]) => id.startsWith("ChatbotAPISearchIndexInitialBuild") && all[id].Type === "Custom::AWS")!;
      expect(JSON.stringify(initial[1].Properties.Create)).toContain("sendMessage");
    });

    it("starts the pipeline on a live grant's new version staged under _pending/, and lets admins upload it there", () => {
      const [, notifications] = Object.entries(all).find(([id, r]) => id.startsWith("ChatbotAPIGrantArtifactsBucketNotifications") && r.Type === "Custom::S3BucketNotifications")!;
      const config = notifications.Properties.NotificationConfiguration;
      const rules = (c: any) => Object.fromEntries(c.Filter.Key.FilterRules.map((r: any) => [r.Name, r.Value]));
      const staged = config.QueueConfigurations.map(rules).filter((r: any) => r.prefix === "_pending/");
      expect(staged.map((r: any) => r.suffix).sort()).toEqual(["NOFO-File-PDF", "NOFO-File-TXT"]);
      expect(config.LambdaFunctionConfigurations.map(rules)).toEqual([{ prefix: "_pending/", suffix: "NOFO-File-DOCX" }]);
      const [, bucket] = Object.entries(all).find(([id, r]) => id.startsWith("ChatbotAPIGrantArtifactsBucket") && r.Type === "AWS::S3::Bucket")!;
      expect(bucket.Properties.CorsConfiguration.CorsRules).toEqual([expect.objectContaining({ AllowedMethods: ["PUT"] })]);
    });

    it("expires old index versions in the versioned artifacts bucket", () => {
      const [, bucket] = Object.entries(all).find(([id, r]) => id.startsWith("ChatbotAPIGrantArtifactsBucket") && r.Type === "AWS::S3::Bucket")!;
      expect(bucket.Properties.LifecycleConfiguration.Rules).toEqual([
        expect.objectContaining({ Prefix: "_search/", NoncurrentVersionExpiration: { NoncurrentDays: 1 }, Status: "Enabled" }),
      ]);
    });
  });
}

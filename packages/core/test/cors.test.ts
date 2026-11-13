import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { allowedOrigins, type InstanceConfig } from "../lib/config/instance-config";

type Resource = { Type: string; Properties?: any };

let instances: InstanceConfig[];
beforeAll(async () => {
  instances = (await import(path.join(appDir, "config", "instances.ts"))).instances;
});

const configFor = (env: keyof typeof ENVS) => instances.find((i) => i.aws.environment === ENVS[env].ENVIRONMENT)!;

function resources(env: keyof typeof ENVS): Resource[] {
  const dir = outDir(env);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".template.json"))
    .flatMap((f) => Object.values(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).Resources ?? {}) as Resource[]);
}

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} CORS`, () => {
    it("lets only the site's own origins call the API and the buckets", () => {
      const expected = allowedOrigins(configFor(env));
      const all = resources(env);
      const buckets = all.filter((r) => r.Type === "AWS::S3::Bucket" && r.Properties?.CorsConfiguration);
      expect(buckets.length).toBe(3);
      for (const b of buckets) {
        for (const rule of b.Properties.CorsConfiguration.CorsRules) expect(rule.AllowedOrigins).toEqual(expected);
      }
      const apis = all.filter((r) => r.Type === "AWS::ApiGatewayV2::Api" && r.Properties?.CorsConfiguration);
      expect(apis.length).toBe(1);
      expect(apis[0].Properties.CorsConfiguration.AllowOrigins).toEqual(expected);
    });

    it("allows localhost only on dev", () => {
      const origins = allowedOrigins(configFor(env));
      expect(origins.some((o) => o.startsWith("http://localhost"))).toBe(env === "dev");
      expect(origins[0]).toBe(configFor(env).siteUrl);
    });
  });
}

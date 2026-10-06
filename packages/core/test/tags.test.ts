// The vector collection's tags are create-only: any change replaces it, and under its fixed name
// that fails the deploy. Pins them, and the core tags everything else carries.
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { coreTags, validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";

type Resource = { Type: string; Properties?: any };
type Tag = { Key?: string; Value?: string; key?: string; value?: string };

const COLLECTION = "AWS::OpenSearchServerless::Collection";

let instances: InstanceConfig[];
beforeAll(async () => {
  instances = (await import(path.join(appDir, "config", "instances.ts"))).instances;
});

const configFor = (env: keyof typeof ENVS) => instances.find((i) => i.aws.environment === ENVS[env].ENVIRONMENT)!;

const tagMap = (tags: Tag[] | Record<string, string>): Record<string, string> =>
  Array.isArray(tags) ? Object.fromEntries(tags.map((t) => [t.Key ?? t.key, t.Value ?? t.value])) : tags;

function templates(env: keyof typeof ENVS): Record<string, Record<string, Resource>> {
  const dir = outDir(env);
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".template.json"))
      .map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).Resources ?? {}])
  );
}

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} tags`, () => {
    it("pins the collection's tags to aws.collectionTags", () => {
      const config = configFor(env);
      const collections = Object.values(templates(env))
        .flatMap((r) => Object.values(r))
        .filter((r) => r.Type === COLLECTION);
      expect(collections).toHaveLength(1);
      expect(tagMap(collections[0].Properties.Tags)).toEqual(config.aws.collectionTags ?? coreTags(config));
    });

    it("puts exactly the core tags plus config.tags on every other tagged resource", () => {
      const config = configFor(env);
      const expected = { ...config.tags, ...coreTags(config) };
      const wrong: string[] = [];
      for (const [file, resources] of Object.entries(templates(env))) {
        for (const [id, r] of Object.entries(resources)) {
          const tags = r.Properties?.Tags ?? r.Properties?.UserPoolTags;
          if (!tags || r.Type === COLLECTION) continue;
          const own = Object.fromEntries(
            Object.entries(tagMap(tags)).filter(([k]) => !k.startsWith("aws-cdk:") && k !== "Component")
          );
          if (JSON.stringify(own, Object.keys(own).sort()) !== JSON.stringify(expected, Object.keys(expected).sort())) {
            wrong.push(`${file} ${id}: ${JSON.stringify(own)}`);
          }
        }
      }
      expect(wrong).toEqual([]);
    });

    it("tags every stack with the core tags plus config.tags", () => {
      const config = configFor(env);
      const manifest = JSON.parse(fs.readFileSync(path.join(outDir(env), "manifest.json"), "utf8"));
      const stacks = Object.values<any>(manifest.artifacts).filter((a) => a.type === "aws:cloudformation:stack");
      expect(stacks.length).toBeGreaterThan(0);
      for (const stack of stacks) expect(stack.properties.tags).toEqual({ ...config.tags, ...coreTags(config) });
    });
  });
}

describe("validateInstanceConfig", () => {
  it.each(["Project", "Instance", "Stage"])("rejects %s in config.tags", (key) => {
    const config = { ...configFor("dev"), tags: { [key]: "x" } };
    expect(() => validateInstanceConfig(config)).toThrow(`tags must not set ${key}`);
  });
});

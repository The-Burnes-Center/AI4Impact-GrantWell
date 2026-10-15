// Every DynamoDB table can be restored to a point in time, and no stack change can delete one.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";

type Resource = { Type: string; Properties?: any; DeletionPolicy?: string; UpdateReplacePolicy?: string };

function tables(env: keyof typeof ENVS): Record<string, Resource> {
  const dir = outDir(env);
  const found: Record<string, Resource> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".template.json"))) {
    const resources: Record<string, Resource> = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).Resources ?? {};
    for (const [id, r] of Object.entries(resources)) {
      if (r.Type.startsWith("AWS::DynamoDB::")) found[`${file}:${id}`] = r;
    }
  }
  return found;
}

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} DynamoDB tables`, () => {
    const all = tables(env);

    it("finds every table", () => {
      expect(Object.keys(all).length).toBeGreaterThanOrEqual(12);
      expect(Object.values(all).every((r) => r.Type === "AWS::DynamoDB::Table")).toBe(true);
    });

    it("has point-in-time recovery, deletion protection and Retain on every table", () => {
      const wrong = Object.entries(all)
        .filter(
          ([, r]) =>
            r.Properties?.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled !== true ||
            r.Properties?.DeletionProtectionEnabled !== true ||
            r.DeletionPolicy !== "Retain" ||
            r.UpdateReplacePolicy !== "Retain"
        )
        .map(([id]) => id);
      expect(wrong).toEqual([]);
    });
  });
}

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";

type Resource = { Type: string; Properties?: any };

function functions(env: keyof typeof ENVS): Resource[] {
  const dir = outDir(env);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".template.json"))
    .flatMap((f) => Object.values(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).Resources ?? {}) as Resource[])
    .filter((r) => r.Type === "AWS::Lambda::Function");
}

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} requirement checks`, () => {
    it("give both functions that run the meaning check the Sonnet model", () => {
      for (const handler of ["verify-summary/index.handler", "cite-requirements/index.handler"]) {
        const fn = functions(env).find((r) => r.Properties.Handler === handler);
        expect(fn, handler).toBeDefined();
        expect(fn!.Properties.Environment.Variables.SONNET_MODEL_ID, handler).toBeDefined();
      }
    });
  });
}

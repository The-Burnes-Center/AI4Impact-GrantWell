// Logical IDs are what CloudFormation keys resources on: a changed ID means delete + recreate,
// which loses data for tables, buckets and user pools. Update snapshots only on purpose:
// `npm run test:update`.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const snapshotDir = (env: string) => path.join(here, "__snapshots__", "logical-ids", env);

// Same naming and format as ~/grantwell-restructure/baseline/snapshot.py.
function shortName(file: string, appStack: string): string {
  const base = path.basename(file).replace(/(\.nested)?\.template\.json$/, "");
  if (base === appStack) return "App";
  const m = base.match(/ChatbotAPI([A-Za-z]+?)(?:Stack)?(?:NestedStack|[0-9A-F]{8}$)/);
  return (m ? m[1] : base).replace(/Stack/g, "");
}

function logicalIds(templatePath: string): { text: string; resources: number } {
  const t = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  const resources: Record<string, { Type: string }> = t.Resources ?? {};
  const outputs: Record<string, { Export?: { Name: unknown } }> = t.Outputs ?? {};
  const byKey = (a: [string, unknown], b: [string, unknown]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const lines = [
    ...Object.entries(resources).sort(byKey).map(([id, r]) => `${id}\t${r.Type}`),
    ...Object.entries(outputs)
      .sort(byKey)
      .filter(([, o]) => o.Export)
      .map(([id, o]) => `EXPORT\t${id}\t${JSON.stringify(o.Export!.Name)}`),
  ];
  return { text: lines.join("\n") + "\n", resources: Object.keys(resources).length };
}

function stacks(env: keyof typeof ENVS): Record<string, string> {
  const dir = outDir(env);
  const result: Record<string, string> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".template.json"))) {
    const { text, resources } = logicalIds(path.join(dir, file));
    // Empty stack artifacts (Bucket, KnowledgeBase, LambdaFunctions, OpenSearch) are never deployed.
    if (resources === 0) continue;
    const name = shortName(file, ENVS[env].STACK_NAME);
    if (result[name]) throw new Error(`Two templates map to stack name "${name}" in ${dir}`);
    result[name] = text;
  }
  return result;
}

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} logical IDs`, () => {
    const current = stacks(env);

    it("synthesised the app stack", () => {
      expect(Object.keys(current)).toContain("App");
    });

    it("has no snapshot for a stack that no longer exists", () => {
      const dir = snapshotDir(env);
      const snapshotted = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.replace(/\.txt$/, "")) : [];
      expect(snapshotted.filter((name) => !(name in current))).toEqual([]);
    });

    for (const [name, text] of Object.entries(current)) {
      it(name, async () => {
        await expect(text).toMatchFileSnapshot(path.join(snapshotDir(env), `${name}.txt`));
      });
    }
  });
}

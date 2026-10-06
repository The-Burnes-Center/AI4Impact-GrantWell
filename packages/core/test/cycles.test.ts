// CDK synth doesn't catch a circular dependency inside a stack; CloudFormation only rejects it when
// the deploy creates the changeset, after every asset is published. Graph the templates instead.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";

type Resource = { Properties?: unknown; DependsOn?: string | string[] };

function references(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => references(n, found));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.Ref === "string") found.add(obj.Ref);
    const getAtt = obj["Fn::GetAtt"];
    if (Array.isArray(getAtt)) found.add(String(getAtt[0]));
    else if (typeof getAtt === "string") found.add(getAtt.split(".")[0]);
    const sub = obj["Fn::Sub"];
    const text = Array.isArray(sub) ? sub[0] : sub;
    if (typeof text === "string") {
      for (const [, name] of text.matchAll(/\$\{([^}!]+)\}/g)) found.add(name.split(".")[0]);
    }
    Object.values(obj).forEach((v) => references(v, found));
  }
}

function findCycle(resources: Record<string, Resource>): string[] | undefined {
  const edges = new Map<string, string[]>();
  for (const [id, r] of Object.entries(resources)) {
    const found = new Set<string>();
    references(r.Properties, found);
    [r.DependsOn ?? []].flat().forEach((d) => found.add(d));
    edges.set(id, [...found].filter((d) => d !== id && d in resources));
  }
  const state = new Map<string, "open" | "done">();
  const trail: string[] = [];
  const visit = (id: string): string[] | undefined => {
    state.set(id, "open");
    trail.push(id);
    for (const next of edges.get(id)!) {
      if (state.get(next) === "open") return [...trail.slice(trail.indexOf(next)), next];
      if (!state.has(next)) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    trail.pop();
    state.set(id, "done");
    return undefined;
  };
  for (const id of edges.keys()) {
    if (!state.has(id)) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return undefined;
}

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(`${env} templates`, () => {
    const dir = outDir(env);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".template.json"))) {
      it(`${file} has no circular dependency`, () => {
        const resources = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).Resources ?? {};
        expect(findCycle(resources)).toBeUndefined();
      });
    }
  });
}

// Handlers use the AWS SDK that ships inside the nodejs24.x runtime. A named import that SDK lacks
// kills the function at init (Runtime.UserCodeSyntaxError), and no unit test that resolves the
// devDependency SDK can see it.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

type Manifest = {
  sdkVersion: string;
  packages: Record<string, { version: string; exports?: string[]; reexports?: string[] }>;
};
type SdkImport = { file: string; line: number; spec: string; names: string[] | null };

const LIB = path.join(__dirname, "../lib");
const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/lambda-runtime-sdk-nodejs24.json"), "utf8")
);

const ALLOWED = new Map([
  [
    "chatbot-api/functions/knowledge-management/create-metadata/index.mjs|@aws-sdk/client-bedrock-agent|listIngestionJobs",
    "dead destructure of a dynamic import: yields undefined, doesn't fail init",
  ],
]);

const FIX_HINT =
  "ship it in the function (see users/vendor) or re-run scripts/lambda-runtime-sdk.mjs after a runtime update";

function handlerFiles(dir = LIB, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "vendor" || e.name === "cdk.out") continue;
      if (e.name === "node_modules") {
        const firstParty = path.join(p, "grantwell-shared");
        if (fs.existsSync(firstParty)) handlerFiles(firstParty, out);
        continue;
      }
      handlerFiles(p, out);
    } else if (/\.(mjs|cjs)$/.test(e.name) || (e.name.endsWith(".js") && !fs.existsSync(p.slice(0, -3) + ".ts"))) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^[ \t]*\/\/.*$/gm, blank);
}

const bindingNames = (list: string, renameSep: RegExp) =>
  list
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("..."))
    .map((s) => s.split(renameSep)[0].split("=")[0].trim());

export function extractSdkImports(source: string, file: string): SdkImport[] {
  const src = stripComments(source);
  const found: SdkImport[] = [];
  const add = (index: number, spec: string, names: string[] | null) => {
    if (spec.startsWith("@aws-sdk/")) {
      found.push({ file, line: src.slice(0, index).split("\n").length, spec, names });
    }
  };
  for (const m of src.matchAll(/\bimport\s+(?:[\w$]+\s*,?\s*)?(?:\{([^}]*)\}|\*\s*as\s+[\w$]+)?\s*from\s*(["'])([^"']+)\2/g)) {
    add(m.index!, m[3], m[1] === undefined ? null : bindingNames(m[1], /\s+as\s+/));
  }
  for (const m of src.matchAll(/\bimport\s*(["'])([^"']+)\1/g)) add(m.index!, m[2], null);
  for (const m of src.matchAll(
    /(?:\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?)?\b(?:import|require)\s*\(\s*(["'])([^"']+)\2\s*\)/g
  )) {
    add(m.index!, m[3], m[1] === undefined ? null : bindingNames(m[1], /\s*:\s*/));
  }
  return found.sort((a, b) => a.line - b.line);
}

export function checkSdkImports(imports: SdkImport[], mf: Manifest, allowed = ALLOWED) {
  const violations: string[] = [];
  const allowedUsed = new Set<string>();
  for (const { file, line, spec, names } of imports) {
    const at = `${file}:${line}`;
    const pkgName = spec.split("/").slice(0, 2).join("/");
    const pkg = mf.packages[pkgName];
    if (spec !== pkgName) {
      violations.push(`${at} ${spec}: subpath imports aren't covered by the runtime SDK manifest`);
    } else if (!pkg) {
      violations.push(`${at} ${spec}: package not in the runtime SDK ${mf.sdkVersion}; ${FIX_HINT}`);
    } else if (names?.length && !pkg.exports) {
      violations.push(`${at} ${spec}@${pkg.version}: export names not recorded; re-run scripts/lambda-runtime-sdk.mjs`);
    } else {
      for (const name of names ?? []) {
        if (pkg.exports!.includes(name)) continue;
        const key = `${file}|${spec}|${name}`;
        if (allowed.has(key)) {
          allowedUsed.add(key);
          continue;
        }
        violations.push(`${at} ${spec}@${pkg.version}: '${name}' is not exported by the runtime SDK; ${FIX_HINT}`);
      }
    }
  }
  return { violations, allowedUsed };
}

describe("handler imports against the Lambda nodejs24.x runtime SDK", () => {
  const files = handlerFiles();
  const imports = files.flatMap((f) =>
    extractSdkImports(fs.readFileSync(f, "utf8"), path.relative(LIB, f).split(path.sep).join("/"))
  );

  it("scans the handler tree, including the shared layer", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.includes("grantwell-shared"))).toBe(true);
    expect(files.some((f) => f.includes(`${path.sep}vendor${path.sep}`))).toBe(false);
    expect(imports.filter((i) => i.names?.length).length).toBeGreaterThan(100);
  });

  it("only uses names the runtime SDK exports", () => {
    const { violations } = checkSdkImports(imports, manifest);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("has no stale allowlist entries", () => {
    expect([...checkSdkImports(imports, manifest).allowedUsed].sort()).toEqual([...ALLOWED.keys()].sort());
  });
});

describe("runtime SDK import checker", () => {
  it("rejects a static import of a command newer than the runtime SDK", () => {
    const src = `import {\n  CognitoIdentityProviderClient,\n  AdminDeleteSoftwareTokenCommand,\n} from "@aws-sdk/client-cognito-identity-provider";\n`;
    const { violations } = checkSdkImports(extractSdkImports(src, "users/index.mjs"), manifest);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("users/index.mjs:1 @aws-sdk/client-cognito-identity-provider@");
    expect(violations[0]).toContain("'AdminDeleteSoftwareTokenCommand'");
    expect(violations[0]).toContain("users/vendor");
  });

  it("reads every import form the handlers use", () => {
    const src = [
      `import { ListUsersCommand as L, BogusA } from '@aws-sdk/client-cognito-identity-provider';`,
      `import * as s3 from "@aws-sdk/client-s3";`,
      `import ddb, { BogusB } from "@aws-sdk/client-dynamodb";`,
      `// import { BogusCommented } from "@aws-sdk/client-s3";`,
      `/* import { BogusBlock } from "@aws-sdk/client-s3"; */`,
      `const { SSMClient: C, BogusC } = await import("@aws-sdk/client-ssm");`,
      `const { BogusD } = require("@aws-sdk/client-sqs");`,
      `await import("@aws-sdk/client-nope");`,
      `import { X } from "@aws-sdk/core/client";`,
      `import { marshall } from "./local.mjs";`,
    ].join("\n");
    const imports = extractSdkImports(src, "f.mjs");
    expect(imports.map((i) => [i.line, i.spec, i.names])).toEqual([
      [1, "@aws-sdk/client-cognito-identity-provider", ["ListUsersCommand", "BogusA"]],
      [2, "@aws-sdk/client-s3", null],
      [3, "@aws-sdk/client-dynamodb", ["BogusB"]],
      [6, "@aws-sdk/client-ssm", ["SSMClient", "BogusC"]],
      [7, "@aws-sdk/client-sqs", ["BogusD"]],
      [8, "@aws-sdk/client-nope", null],
      [9, "@aws-sdk/core/client", ["X"]],
    ]);
    const { violations } = checkSdkImports(imports, manifest);
    expect(violations.map((v) => v.split(" ")[0])).toEqual(["f.mjs:1", "f.mjs:3", "f.mjs:6", "f.mjs:7", "f.mjs:8", "f.mjs:9"]);
  });
});

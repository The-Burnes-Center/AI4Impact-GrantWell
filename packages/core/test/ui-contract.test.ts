// The UI keeps its own copies of core's contract types and defines the chrome API instance repos
// build against; these pin both, since nothing else connects the two packages at compile time.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const coreTypes = path.resolve(here, "..", "lib", "config", "instance-config.ts");
const uiBranding = path.resolve(here, "..", "..", "ui", "src", "common", "branding.tsx");
const chromeApi = path.resolve(here, "..", "..", "ui", "src", "common", "chrome-api.ts");

/** Type errors in `source` only; react is unresolved here and errors in the imported files are ignored. */
function typeErrors(source: string): string[] {
  const file = path.join(here, "__ui-contract-check__.ts");
  const options: ts.CompilerOptions = { strict: true, noEmit: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX, types: [] };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile;
  host.readFile = (f) => (path.resolve(f) === file ? source : readFile(f));
  host.fileExists = ((exists) => (f: string) => path.resolve(f) === file || exists(f))(host.fileExists);
  const program = ts.createProgram([file], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file && path.resolve(d.file.fileName) === file)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

const imports = `
import type { Branding as CoreBranding, Link as CoreLink, LogoLink as CoreLogoLink } from ${JSON.stringify(coreTypes.replace(/\.ts$/, ""))};
import type { Branding as UiBranding, Link as UiLink, LogoLink as UiLogoLink } from ${JSON.stringify(uiBranding.replace(/\.tsx$/, ""))};
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
`;

describe("UI Branding copy", () => {
  it("matches core's Branding, Link and LogoLink exactly", () => {
    const source = `${imports}
export const branding: Equals<CoreBranding, UiBranding> = true;
export const link: Equals<CoreLink, UiLink> = true;
export const logoLink: Equals<CoreLogoLink, UiLogoLink> = true;
`;
    expect(typeErrors(source)).toEqual([]);
  });

  it("would catch a field that differs", () => {
    const source = `${imports}
export const branding: Equals<Omit<CoreBranding, "govHeader">, UiBranding> = true;
`;
    expect(typeErrors(source)).toEqual([expect.stringContaining("Type 'true' is not assignable to type 'false'")]);
  });
});

/** chrome-api.ts without comments or formatting: what a chrome compiles against. */
function chromeApiShape(): { version: number; shape: string } {
  const text = fs.readFileSync(chromeApi, "utf8");
  const sourceFile = ts.createSourceFile(chromeApi, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const shape = ts.createPrinter({ removeComments: true }).printFile(sourceFile);
  const version = Number(text.match(/export const CHROME_API_VERSION = (\d+);/)?.[1]);
  return { version, shape };
}

describe("chrome API", () => {
  // A change here can break every instance's chrome/. If existing chromes still compile and behave the
  // same (a new optional prop or slot), update this version's snapshot on purpose (`npm run test:update`);
  // otherwise bump CHROME_API_VERSION, which starts a new snapshot.
  it("keeps the shape recorded for its version", async () => {
    const { version, shape } = chromeApiShape();
    expect(Number.isInteger(version)).toBe(true);
    await expect(shape).toMatchFileSnapshot(path.join("__snapshots__", "chrome-api", `v${version}.ts.snap`));
  });
});

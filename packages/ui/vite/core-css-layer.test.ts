import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Plugin } from "vite";
import { coreCssLayer, inCoreLayer } from "./core-css-layer";

const root = "/app";
const plugin = coreCssLayer() as Plugin & {
  configResolved: (c: { root: string }) => void;
  transform: (code: string, id: string) => { code: string } | undefined;
};
plugin.configResolved({ root });
const transformed = (id: string) => plugin.transform(".a{color:red}", id)?.code;

describe("core CSS layer", () => {
  it("puts core stylesheets, vendor CSS included, in the layer", () => {
    for (const id of [
      path.join(root, "src/styles/dashboard.css"),
      path.join(root, "src/styles/bootstrap-subset.scss"),
      "/app/node_modules/react-json-view-lite/dist/index.css",
    ]) {
      expect(transformed(id)).toBe("@layer gw-core {\n.a{color:red}\n}\n");
    }
  });

  it("leaves the instance's chrome CSS unlayered so it wins", () => {
    expect(transformed(path.join(root, "src/instance-chrome/theme.css"))).toBeUndefined();
    expect(transformed(path.join(root, "src/instance-chrome/public-home.css"))).toBeUndefined();
  });

  it("skips non-CSS modules and CSS imported as a string or URL", () => {
    expect(transformed(path.join(root, "src/main.tsx"))).toBeUndefined();
    expect(transformed(path.join(root, "src/styles/tokens.css?inline"))).toBeUndefined();
    expect(transformed(path.join(root, "src/styles/tokens.css?url"))).toBeUndefined();
    expect(transformed(path.join(root, "src/styles/tokens.css?direct"))).toContain("@layer gw-core");
  });

  it("keeps @charset and external @import outside the layer", () => {
    const out = inCoreLayer('@charset "UTF-8";\n@import url("https://x/y.css");\n.a{}');
    expect(out.indexOf("@charset")).toBe(0);
    expect(out.indexOf("@import")).toBeLessThan(out.indexOf("@layer"));
    expect(out).toMatch(/@layer gw-core \{\n\s*\n?\s*\.a\{\}\n\}/);
  });
});

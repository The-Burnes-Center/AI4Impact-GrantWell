import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const components = fs.readFileSync(path.join(__dirname, "../src/styles/components.css"), "utf8");
const bootstrap = fs.readFileSync(path.join(__dirname, "../node_modules/bootstrap/dist/css/bootstrap.css"), "utf8");

const block = (css: string, selector: string) => {
  const bodies: string[] = [];
  for (let at = css.indexOf(`\n${selector} {`); at > -1; at = css.indexOf(`\n${selector} {`, at + 1)) {
    bodies.push(css.slice(at, css.indexOf("}", at)));
  }
  expect(bodies.length).toBeGreaterThan(0);
  return bodies.join("\n");
};
const vars = (body: string) => new Set(body.match(/--bs-btn-[\w-]+(?=:)/g) ?? []);

describe("primary button over Bootstrap's .btn", () => {
  it("overrides every colour Bootstrap's .btn-primary sets", () => {
    const bootstrapVars = [...vars(block(bootstrap, ".btn-primary"))].filter(
      (name) => !name.endsWith("-shadow-rgb") && name !== "--bs-btn-active-shadow",
    );
    const ours = vars(block(components, ".gw-btn.gw-btn--primary"));
    expect(bootstrapVars.length).toBeGreaterThan(10);
    expect(bootstrapVars.filter((name) => !ours.has(name))).toEqual([]);
    expect(ours.has("--bs-btn-focus-box-shadow")).toBe(true);
  });

  it("keeps the busy colours on hover, keyboard focus and press", () => {
    const busy = block(components, '.gw-btn.gw-btn--primary:is(:disabled, [aria-disabled="true"])');
    for (const state of ["", "hover-", "active-"]) {
      expect(busy).toContain(`--bs-btn-${state}bg: var(--gw-color-disabled-bg)`);
      expect(busy).toContain(`--bs-btn-${state}color: var(--gw-color-disabled-text)`);
    }
    expect(components.indexOf(busy)).toBeGreaterThan(
      components.indexOf(block(components, ".gw-btn.gw-btn--primary:hover")),
    );
  });
});

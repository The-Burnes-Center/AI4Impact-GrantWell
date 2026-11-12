import fs from "node:fs";
import path from "node:path";
import postcss, { type Rule } from "postcss";
import * as sass from "sass";
import { describe, expect, it } from "vitest";

const dir = path.join(__dirname, "../src/styles");
const sheets = [
  sass.compile(path.join(dir, "app.scss")).css,
  ...fs.readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(path.join(dir, f), "utf8")),
];

const specificity = (selector: string): number => {
  const s = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "").replace(/:(not|is)\(/g, "(");
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (s.replace(/\[[^\]]*\]/g, "").match(/(^|[\s>+~(])[a-z][\w-]*|::[\w-]+/gi) ?? []).length;
  return ids * 10000 + classes * 100 + types;
};

/** The outline-offsets of the most specific rules that match `el` when focused by keyboard. */
function focusedOffsets(el: Element): string[] {
  const matches: { spec: number; value: string }[] = [];
  for (const css of sheets) {
    postcss.parse(css).walkDecls("outline-offset", (decl) => {
      const rule = decl.parent as Rule;
      if (rule.type !== "rule") return;
      for (const selector of rule.selectors) {
        if (!/:focus(-visible)?/.test(selector)) continue;
        try {
          if (el.matches(selector.replace(/:focus(-visible)?/g, ""))) matches.push({ spec: specificity(selector), value: decl.value });
        } catch {
          /* selectors jsdom can't parse */
        }
      }
    });
  }
  const top = Math.max(...matches.map((m) => m.spec));
  return [...new Set(matches.filter((m) => m.spec === top).map((m) => m.value))];
}

describe("focus rings on menu items", () => {
  it.each([
    ["row and grant actions", `<div role="menu" class="actions-dropdown-menu"><button role="menuitem" class="dropdown-menu-item">Delete</button></div>`],
    ["the Export menu", `<div role="menu" class="ra-export-dropdown__menu"><button role="menuitem" class="ra-export-dropdown__item">PDF</button></div>`],
    ["the legacy row menu", `<div role="menu" class="actions-menu"><button role="menuitem" class="menu-item">Edit</button></div>`],
    ["the grant filter", `<div role="menu" class="filter-menu"><div role="group"><button role="menuitemradio" class="filter-option">All</button></div></div>`],
  ])("sit inside %s, which clips its overflow", (_name, html) => {
    document.body.innerHTML = html;
    expect(focusedOffsets(document.querySelector('[role^="menuitem"]')!)).toEqual(["calc(-1 * var(--gw-focus-width))"]);
  });

  it("keeps the outset ring on an ordinary button", () => {
    document.body.innerHTML = `<button>Save</button>`;
    const offsets = focusedOffsets(document.querySelector("button")!);
    expect(offsets.length).toBeGreaterThan(0);
    expect(offsets.some((v) => v.startsWith("calc(-1"))).toBe(false);
  });
});

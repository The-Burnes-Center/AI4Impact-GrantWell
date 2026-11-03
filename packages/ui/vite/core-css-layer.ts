import path from "path";
import type { Plugin } from "vite";

export const CORE_LAYER = "gw-core";

/** Wraps a compiled stylesheet in the core layer; @charset and any remaining @import must stay outside it. */
export function inCoreLayer(css: string): string {
  const hoisted: string[] = [];
  const body = css
    .replace(/^\s*@charset\s+[^;]+;/, (rule) => {
      hoisted.push(rule.trim());
      return "";
    })
    .replace(/@import\s+[^;]+;/g, (rule) => {
      hoisted.push(rule);
      return "";
    });
  return [...hoisted, `@layer ${CORE_LAYER} {`, body, "}", ""].join("\n");
}

/**
 * Puts every stylesheet except the instance's chrome/ in one cascade layer. Unlayered rules beat
 * layered ones whatever their order, so an instance's theme.css and chrome CSS win over core CSS,
 * lazy route chunks included, while core's own cascade is unchanged.
 */
export function coreCssLayer(): Plugin {
  let chromeDir = "";
  return {
    name: "core-css-layer",
    configResolved(config) {
      chromeDir = path.join(config.root, "src", "instance-chrome") + path.sep;
    },
    transform(code, id) {
      const [file, query = ""] = id.split("?");
      if (!/\.(css|scss)$/.test(file) || /(^|&)(inline|raw|url)(&|=|$)/.test(query)) return;
      if (path.normalize(file).startsWith(chromeDir)) return;
      return { code: inCoreLayer(code), map: null };
    },
  };
}

import fs from "node:fs";
import path from "node:path";

export const GOLDEN_DIR = new URL("../golden/", import.meta.url).pathname;

/**
 * golden/<slug>/grant.json {name, agency?}: name is the grant's NOFO folder in the dev bucket and KB.
 * source/raw.txt is the extracted text; summary.json, draft.json, chat.json and recorded/ are optional.
 */
export function loadGrants(dir = GOLDEN_DIR, only) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "grant.json")))
    .filter((e) => !only || only.includes(e.name))
    .map((e) => {
      const root = path.join(dir, e.name);
      return {
        slug: e.name,
        dir: root,
        ...JSON.parse(fs.readFileSync(path.join(root, "grant.json"), "utf8")),
        rawPath: path.join(root, "source", "raw.txt"),
        recordingPath: path.join(root, "recorded", "retrieval.json"),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function readOptional(grant, file) {
  const p = path.join(grant.dir, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

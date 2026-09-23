import * as fs from "node:fs";
import * as path from "node:path";
import { Branding } from "../config/instance-config";

// Placeholders git and Finder leave behind; copying them would change the UI asset hash for nothing.
const SKIPPED = new Set([".gitkeep", ".DS_Store"]);

function listFiles(dir: string, rel = ""): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) return listFiles(dir, child);
    return SKIPPED.has(entry.name) ? [] : [child];
  });
}

/**
 * Copies an instance's own files into the UI project's public/. A file the UI already ships is
 * never replaced: an upgrade could otherwise change it underneath the instance without notice.
 */
export function applyPublicOverlay(appPath: string, publicDir: string): void {
  const target = path.join(appPath, "public");
  const files = listFiles(publicDir);
  const clashes = files.filter((f) => fs.existsSync(path.join(target, f)));
  if (clashes.length) {
    throw new Error(
      `public/ files clash with files the GrantWell UI already ships; rename them and update config/branding.ts:\n` +
        clashes.map((f) => `  ${path.join(publicDir, f)}`).join("\n")
    );
  }
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
    fs.copyFileSync(path.join(publicDir, f), path.join(target, f));
  }
}

/** Fails the synth when a branding image isn't served by the site, instead of a broken image in production. */
export function checkBrandingImages(appPath: string, branding: Branding): void {
  const images: [string, string | undefined][] = [
    ["logo", branding.logo],
    ["favicon", branding.favicon],
    ["footer.wordmark", branding.footer.wordmark],
    ["footer.madeBy.logo", branding.footer.madeBy?.logo],
    ...branding.footer.partners.map((p, i): [string, string | undefined] => [`footer.partners[${i}].logo`, p.logo]),
  ];
  const publicRoot = path.join(appPath, "public");
  const served = (url: string) => {
    const file = path.join(publicRoot, url);
    return url.startsWith("/") && file.startsWith(publicRoot + path.sep) && fs.statSync(file, { throwIfNoEntry: false })?.isFile();
  };
  const missing = images
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .filter(([, url]) => !served(url))
    .map(([field, url]) => `  ${field}: ${url}`);
  if (missing.length) {
    throw new Error(
      `Branding images must be site-root paths to a file in the GrantWell UI or the instance's public/ folder. Not found:\n` +
        missing.join("\n")
    );
  }
}

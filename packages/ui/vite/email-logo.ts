import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";
import type { Branding } from "../src/common/branding";

/** Core points DIGEST_LOGO_URL here (EMAIL_LOGO_PNG_PATH); test/ui-contract.test.ts pins the two together. */
export const EMAIL_LOGO_PATH = "/images/email/logo.png";
// Twice the 28 px the email shows, for sharp text on high-density screens.
const HEIGHT = 56;

/** The email wordmark as a PNG: Gmail and desktop Outlook don't show SVG images. */
export function emailLogo(stagedInstancePath: string): Plugin {
  let outDir = "";
  return {
    name: "email-logo",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      if (!fs.existsSync(stagedInstancePath)) return;
      const branding: Branding = JSON.parse(fs.readFileSync(stagedInstancePath, "utf8")).branding;
      const url = branding?.footer?.wordmark ?? branding?.logo;
      const source = url ? path.join(outDir, url) : "";
      if (!source || !fs.existsSync(source)) return;
      const target = path.join(outDir, EMAIL_LOGO_PATH);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await sharp(source, { density: 600 }).resize({ height: HEIGHT }).png({ compressionLevel: 9 }).toFile(target);
    },
  };
}

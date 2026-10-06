import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPublicOverlay, checkBrandingImages } from "../lib/user-interface/public-overlay";
import type { Branding } from "../lib/config/instance-config";

let tmp: string;
let appPath: string;
let publicDir: string;

const write = (file: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, path.basename(file));
};

const branding = (overrides: Partial<Branding> = {}): Branding => ({
  appName: "GrantWell",
  orgName: "Org",
  postalAddress: "Address",
  supportEmail: "a@example.gov",
  colors: { primary: "#000000" },
  logo: "/images/logo.svg",
  favicon: "/images/favicon.svg",
  footer: { partners: [] },
  omniPartners: [],
  ...overrides,
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "overlay-"));
  appPath = path.join(tmp, "ui-build");
  publicDir = path.join(tmp, "instance", "public");
  write(path.join(appPath, "public", "images", "logo.svg"));
  write(path.join(appPath, "public", "images", "favicon.svg"));
  fs.mkdirSync(publicDir, { recursive: true });
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("applyPublicOverlay", () => {
  it("adds instance files under the UI's public/", () => {
    write(path.join(publicDir, "brand", "state-logo.svg"));
    applyPublicOverlay(appPath, publicDir);
    expect(fs.readFileSync(path.join(appPath, "public", "brand", "state-logo.svg"), "utf8")).toBe("state-logo.svg");
  });

  it("skips .gitkeep and .DS_Store", () => {
    write(path.join(publicDir, ".gitkeep"));
    write(path.join(publicDir, "brand", ".DS_Store"));
    applyPublicOverlay(appPath, publicDir);
    expect(fs.existsSync(path.join(appPath, "public", ".gitkeep"))).toBe(false);
    expect(fs.existsSync(path.join(appPath, "public", "brand"))).toBe(false);
  });

  it("fails on a file the UI already ships and copies nothing", () => {
    write(path.join(publicDir, "images", "logo.svg"));
    write(path.join(publicDir, "brand", "state-logo.svg"));
    expect(() => applyPublicOverlay(appPath, publicDir)).toThrow(/images\/logo\.svg/);
    expect(fs.readFileSync(path.join(appPath, "public", "images", "logo.svg"), "utf8")).toBe("logo.svg");
    expect(fs.existsSync(path.join(appPath, "public", "brand"))).toBe(false);
  });
});

describe("checkBrandingImages", () => {
  it("passes when every image is served", () => {
    write(path.join(appPath, "public", "brand", "partner.png"));
    expect(() =>
      checkBrandingImages(appPath, branding({ footer: { partners: [{ label: "P", href: "https://p", logo: "/brand/partner.png" }] } }))
    ).not.toThrow();
  });

  it("names every missing, relative, external or escaping path", () => {
    const b = branding({
      logo: "/images/missing.svg",
      favicon: "images/favicon.svg",
      footer: {
        wordmark: "https://cdn.example.gov/w.svg",
        madeBy: { label: "M", href: "https://m", logo: "/../outside.svg" },
        partners: [{ label: "P", href: "https://p" }],
      },
    });
    write(path.join(appPath, "outside.svg"));
    expect(() => checkBrandingImages(appPath, b)).toThrow(
      /logo: \/images\/missing\.svg\n {2}favicon: images\/favicon\.svg\n {2}footer\.wordmark: https:\/\/cdn\.example\.gov\/w\.svg\n {2}footer\.madeBy\.logo: \/\.\.\/outside\.svg$/
    );
  });

  it("rejects a directory", () => {
    expect(() => checkBrandingImages(appPath, branding({ logo: "/images" }))).toThrow(/logo: \/images/);
  });
});

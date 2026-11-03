// The email header logo is drawn at 28 px high with a fixed width; core measures the wordmark at synth
// so a wide or narrow instance lockup isn't stretched.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { emailLogoWidth, imageSize } from "../lib/user-interface/image-size";
import type { Branding } from "../lib/config/instance-config";

const genericPublic = path.join(__dirname, "..", "..", "..", "instances", "generic", "public");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gw-image-size-"));
const write = (name: string, data: string | Buffer) => {
  fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true });
  fs.writeFileSync(path.join(tmp, name), data);
  return path.join(tmp, name);
};
const png = (width: number, height: number) => {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
};
const branding = (wordmark: string | undefined, logo = "") => ({ logo, footer: { wordmark, partners: [] } }) as unknown as Branding;

describe("imageSize", () => {
  it("reads an SVG's width and height, or its viewBox", () => {
    expect(imageSize(path.join(genericPublic, "images", "marketing", "grantwell-wordmark-footer.svg"))).toEqual({ width: 352, height: 70 });
    expect(imageSize(write("viewbox.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 583.9 70"></svg>'))).toEqual({
      width: 583.9,
      height: 70,
    });
  });

  it("reads a PNG's header", () => {
    expect(imageSize(write("logo.png", png(852, 198)))).toEqual({ width: 852, height: 198 });
  });

  it("is undefined for anything it can't measure", () => {
    expect(imageSize(write("no-size.svg", "<svg></svg>"))).toBeUndefined();
    expect(imageSize(write("logo.webp", "RIFF0000WEBP"))).toBeUndefined();
  });
});

describe("emailLogoWidth", () => {
  it("scales the wordmark to 28 px high, searching the instance's public/ before the UI's", () => {
    write("images/wide.svg", '<svg width="583.9" height="70"></svg>');
    expect(emailLogoWidth(branding("/images/wide.svg"), [tmp, genericPublic])).toBe(234);
    expect(emailLogoWidth(branding("/images/marketing/grantwell-wordmark-footer.svg"), [undefined, tmp, genericPublic])).toBe(141);
  });

  it("falls back to the logo, then to 141 px when nothing can be measured", () => {
    write("images/logo.png", png(426, 99));
    expect(emailLogoWidth(branding(undefined, "/images/logo.png"), [tmp])).toBe(120);
    expect(emailLogoWidth(branding("/images/missing.svg"), [tmp])).toBe(141);
    expect(emailLogoWidth(branding(undefined, ""), [tmp])).toBe(141);
  });
});

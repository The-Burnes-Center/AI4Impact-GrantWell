import * as fs from "node:fs";
import * as path from "node:path";
import type { Branding } from "../config/instance-config";

/** Pixel size of an SVG (width/height, else its viewBox) or a PNG; undefined for anything else. */
export function imageSize(file: string): { width: number; height: number } | undefined {
  const data = fs.readFileSync(file);
  if (data.subarray(1, 4).toString("latin1") === "PNG") {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  const svg = data.toString("utf8").match(/<svg\b[^>]*>/i)?.[0];
  if (!svg) return undefined;
  const number = (name: string) => {
    const value = svg.match(new RegExp(`\\s${name}="\\s*([\\d.]+)(px)?\\s*"`))?.[1];
    return value ? Number(value) : undefined;
  };
  const [, , viewWidth, viewHeight] = (svg.match(/\sviewBox="([^"]+)"/)?.[1] ?? "").trim().split(/[\s,]+/).map(Number);
  const width = number("width") ?? viewWidth;
  const height = number("height") ?? viewHeight;
  return width > 0 && height > 0 ? { width, height } : undefined;
}

const EMAIL_LOGO_HEIGHT = 28;
const DEFAULT_EMAIL_LOGO_WIDTH = 141;

/**
 * Width of the email header logo at 28 px high, keeping the wordmark's proportions. `publicDirs` are
 * searched in order for the site-root path; the default width stands when the file can't be measured.
 */
export function emailLogoWidth(branding: Branding, publicDirs: (string | undefined)[]): number {
  const url = branding.footer.wordmark ?? branding.logo;
  const file = url
    ? publicDirs.filter((d): d is string => !!d).map((d) => path.join(d, url)).find((f) => fs.existsSync(f))
    : undefined;
  const size = file ? imageSize(file) : undefined;
  if (!size) return DEFAULT_EMAIL_LOGO_WIDTH;
  return Math.min(400, Math.max(EMAIL_LOGO_HEIGHT, Math.round((EMAIL_LOGO_HEIGHT * size.width) / size.height)));
}

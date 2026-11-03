import { derivedTints, resolvePalette, type BrandColor, type BrandColors } from "./palette";

/** How the brand colours reach the page, shared by BrandingProvider and the build's static HTML. */
export const TINTS_STYLE_ID = "gw-derived-tints";

/** Maps branding.colors onto the --gw-color-* CSS variables defined in tokens.css. */
const COLOR_VARS: Record<BrandColor, string> = {
  primary: "--gw-color-primary",
  primaryHover: "--gw-color-primary-hover",
  primaryActive: "--gw-color-primary-active",
  primaryLight: "--gw-color-primary-light",
  accent: "--gw-color-accent",
  accentHover: "--gw-color-accent-hover",
};

/** The six brand variables, set inline on <html> so they win over any stylesheet. */
export function brandColorVars(colors: BrandColors): [string, string][] {
  const palette = resolvePalette(colors);
  return (Object.keys(COLOR_VARS) as BrandColor[]).map((key) => [COLOR_VARS[key], palette[key]]);
}

/** The derived tints, in the core layer so an instance's theme.css can still set them. */
export function brandTintsCss(primary: string): string | undefined {
  const tints = derivedTints(primary);
  return tints && `@layer gw-core { :root { ${Object.entries(tints).map(([k, v]) => `${k}: ${v};`).join(" ")} } }`;
}

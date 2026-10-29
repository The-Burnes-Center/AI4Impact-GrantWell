/**
 * Brand palette: missing shades derived from the primary, and the WCAG contrast rules every palette
 * must clear. Mirrored in packages/core/lib/config/palette.ts (grantwell-check); both copies are
 * pinned by packages/core/test/fixtures/palette.json.
 */
export interface BrandColors {
  primary: string;
  primaryHover?: string;
  primaryActive?: string;
  primaryLight?: string;
  accent?: string;
  accentHover?: string;
}

export type BrandColor = keyof BrandColors;

/** tokens.css's hand-tuned palette; a palette on this primary keeps it instead of derived shades. */
export const DEFAULT_COLORS: Required<BrandColors> = {
  primary: "#23776C",
  primaryHover: "#195C53",
  primaryActive: "#244140",
  primaryLight: "#DFECE0",
  accent: "#388557",
  accentHover: "#32784E",
};

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const toHex = (channels: number[]) =>
  "#" + channels.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** `weight` of `b` mixed into `a`, in sRGB. */
export const mix = (a: string, b: string, weight: number): string => {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * weight));
};

const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Every brand color, with the ones the palette leaves out derived from its primary. */
export function resolvePalette(colors: BrandColors): Required<BrandColors> {
  if (same(colors.primary, DEFAULT_COLORS.primary)) return { ...DEFAULT_COLORS, ...colors };
  const accent = colors.accent ?? colors.primary;
  return {
    primary: colors.primary,
    primaryHover: colors.primaryHover ?? mix(colors.primary, "#000000", 0.2),
    primaryActive: colors.primaryActive ?? mix(colors.primary, "#000000", 0.45),
    primaryLight: colors.primaryLight ?? mix(colors.primary, "#FFFFFF", 0.88),
    accent,
    accentHover: colors.accentHover ?? mix(accent, "#000000", 0.15),
  };
}

/** tokens.css's extra primary tints, derived for a non-default primary; undefined keeps tokens.css's own. */
export function derivedTints(primary: string): Record<string, string> | undefined {
  if (same(primary, DEFAULT_COLORS.primary)) return undefined;
  return {
    "--gw-color-primary-deep": mix(primary, "#000000", 0.22),
    "--gw-color-primary-border": mix(primary, "#FFFFFF", 0.75),
    "--gw-color-primary-muted": mix(primary, "#333333", 0.5),
    "--gw-color-primary-alt": mix(primary, "#000000", 0.04),
    "--gw-color-primary-soft": mix(primary, "#FFFFFF", 0.5),
    "--gw-color-primary-mid": mix(primary, "#FFFFFF", 0.25),
  };
}

const relativeLuminance = (hex: string): number => {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Every brand-colour pair the UI actually paints, with the WCAG threshold it must clear (4.5:1 for
 * text, 3:1 for borders and focus rings).
 */
export const CONTRAST_RULES: { fg: BrandColor | "white"; bg: BrandColor | "white"; min: number; usage: string }[] = [
  { fg: "primaryHover", bg: "primaryLight", min: 4.5, usage: "text on the brand tint (hover/active rows, tabs, sort headers)" },
  { fg: "primary", bg: "white", min: 4.5, usage: "primary text and links" },
  { fg: "primaryActive", bg: "white", min: 4.5, usage: "heading text" },
  { fg: "accentHover", bg: "white", min: 4.5, usage: "accent text" },
  { fg: "white", bg: "primary", min: 4.5, usage: "label on filled primary buttons" },
  { fg: "primary", bg: "white", min: 3.0, usage: "focus ring on light surfaces" },
  { fg: "primary", bg: "primaryLight", min: 3.0, usage: "focus ring on the brand tint" },
  { fg: "accent", bg: "white", min: 3.0, usage: "accent borders and outlines" },
];

export interface ContrastFailure {
  usage: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
}

/** The rules a palette breaks once its missing shades are derived. */
export function findContrastFailures(colors: BrandColors): ContrastFailure[] {
  const palette = resolvePalette(colors);
  const resolve = (k: BrandColor | "white") => (k === "white" ? "#FFFFFF" : palette[k]);
  return CONTRAST_RULES.flatMap(({ fg, bg, min, usage }) => {
    const ratio = contrastRatio(resolve(fg), resolve(bg));
    return ratio >= min ? [] : [{ usage, fg: resolve(fg), bg: resolve(bg), ratio: Math.floor(ratio * 100) / 100, required: min }];
  });
}

import { createContext, useContext, useLayoutEffect, ReactNode } from "react";

/**
 * Copy of the Branding contract in packages/core/lib/config/instance-config.ts; keep the two in
 * step. The deployed value is staged by core at synth (see common/instance.ts); `defaultBranding`
 * is the neutral fallback for builds with nothing staged.
 */
export interface Link {
  label: string;
  href: string;
}

export interface LogoLink extends Link {
  logo?: string;
  /** Optional CSS modifier class for per-partner styling (e.g. layout tweaks). */
  className?: string;
}

export interface Branding {
  appName: string;
  orgName: string;
  postalAddress: string;
  supportEmail: string;
  colors: {
    primary: string;
    primaryHover?: string;
    primaryActive?: string;
    primaryLight?: string;
    accent?: string;
    accentHover?: string;
  };
  logo: string;
  favicon: string;
  footer: {
    /** Footer wordmark image; omit to fall back to `logo`. */
    wordmark?: string;
    /** "Made by" attribution (e.g. ai4impact), if any. */
    madeBy?: LogoLink;
    /** Partner/consortium links + logos. Empty for neutral core. */
    partners: LogoLink[];
  };
  /**
   * Text links for the "This is a tool by:" strip (OmniHeader) on landing/login. Distinct from
   * footer.partners (text, not logos). Empty for neutral core — the strip renders nothing.
   */
  omniPartners: Link[];
  analyticsId?: string;
}

/** Neutral core default — no instance identity. Real look comes from an injected config. */
export const defaultBranding: Branding = {
  appName: "GrantWell",
  orgName: "",
  postalAddress: "",
  supportEmail: "",
  colors: {
    primary: "#23776C",
    primaryHover: "#195C53",
    primaryActive: "#244140",
    primaryLight: "#DFECE0",
    accent: "#388557",
    accentHover: "#32784E",
  },
  logo: "/images/marketing/grantwell-wordmark-dark.svg",
  favicon: "/images/marketing/favicon.svg",
  footer: {
    partners: [],
  },
  omniPartners: [],
};

const BrandingContext = createContext<Branding>(defaultBranding);

type BrandColor = keyof Branding["colors"];

const relativeLuminance = (hex: string): number => {
  const h = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Every brand-colour pair the UI actually paints, with the WCAG threshold it must clear
 * (4.5:1 for text, 3:1 for borders and focus rings). Because these six variables are
 * swapped per instance at runtime, a rebrand can invalidate a ratio that was certified
 * against the default palette — this is what catches that.
 */
const CONTRAST_RULES: { fg: BrandColor | "white"; bg: BrandColor | "white"; min: number; usage: string }[] = [
  { fg: "primaryHover", bg: "primaryLight", min: 4.5, usage: "text on the brand tint (hover/active rows, tabs, sort headers)" },
  { fg: "primary", bg: "white", min: 4.5, usage: "primary text and links" },
  { fg: "primaryActive", bg: "white", min: 4.5, usage: "heading text" },
  { fg: "accentHover", bg: "white", min: 4.5, usage: "accent text" },
  { fg: "white", bg: "primary", min: 4.5, usage: "label on filled primary buttons" },
  { fg: "primary", bg: "white", min: 3.0, usage: "focus ring on light surfaces" },
  { fg: "primary", bg: "primaryLight", min: 3.0, usage: "focus ring on the brand tint" },
  { fg: "accent", bg: "white", min: 3.0, usage: "accent borders and outlines" },
];

/**
 * Checks a palette against CONTRAST_RULES. Exported so an instance can assert its own
 * branding at build time rather than discovering the problem in an audit.
 */
export function findBrandingContrastFailures(
  colors: Branding["colors"]
): { usage: string; ratio: number; required: number }[] {
  const resolve = (k: BrandColor | "white") => (k === "white" ? "#ffffff" : colors[k]);
  return CONTRAST_RULES.flatMap(({ fg, bg, min, usage }) => {
    const a = resolve(fg);
    const b = resolve(bg);
    if (!a || !b) return [];
    const ratio = contrastRatio(a, b);
    return ratio >= min ? [] : [{ usage, ratio: Math.round(ratio * 100) / 100, required: min }];
  });
}

/** Maps branding.colors onto the --gw-color-* CSS variables defined in tokens.css. */
const COLOR_VARS: Record<BrandColor, string> = {
  primary: "--gw-color-primary",
  primaryHover: "--gw-color-primary-hover",
  primaryActive: "--gw-color-primary-active",
  primaryLight: "--gw-color-primary-light",
  accent: "--gw-color-accent",
  accentHover: "--gw-color-accent-hover",
};

export function BrandingProvider({
  value = defaultBranding,
  children,
}: {
  value?: Branding;
  children: ReactNode;
}) {
  // Push brand colors onto the CSS variables so token-based styles rebrand without
  // touching component code. tokens.css keeps its defaults if a value is omitted.
  useLayoutEffect(() => {
    const root = document.documentElement;
    (Object.keys(COLOR_VARS) as BrandColor[]).forEach((key) => {
      const color = value.colors[key];
      if (color) root.style.setProperty(COLOR_VARS[key], color);
    });
  }, [value]);

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;
    const failures = findBrandingContrastFailures(value.colors);
    if (failures.length === 0) return;
    console.warn(
      `[branding] ${value.appName || "This"} palette fails WCAG contrast in ${failures.length} place(s):\n` +
        failures.map((f) => `  ${f.ratio}:1 (needs ${f.required}:1) — ${f.usage}`).join("\n")
    );
  }, [value]);

  // Load Google Analytics from branding.analyticsId — only when configured, so neutral core
  // (and any instance without an id) ships no analytics. Replaces the old static gtag script.
  useLayoutEffect(() => {
    const id = value.analyticsId;
    if (!id || document.getElementById("ga-gtag")) return;
    const s = document.createElement("script");
    s.id = "ga-gtag";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    // gtag pushes its raw arguments onto dataLayer; the typed window.gtag wrapper is used
    // elsewhere for page-view config calls (see App.tsx).
    const push = (...args: unknown[]) => window.dataLayer.push(args as unknown as Record<string, unknown>);
    window.gtag = ((command: string, targetId: string, config?: unknown) =>
      push(command, targetId, config)) as typeof window.gtag;
    push("js", new Date());
    push("config", id);
  }, [value.analyticsId]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

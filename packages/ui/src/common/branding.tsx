import { createContext, useContext, useLayoutEffect, ReactNode } from "react";
import { findContrastFailures } from "./palette";
import { brandColorVars, brandTintsCss, TINTS_STYLE_ID } from "./brand-style";

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

/** A line of text with optional links, e.g. ["Developed by ", { label: "AI for Impact", href }, "."]. */
export type RichLine = (string | Link)[];

export interface HomeCopy {
  /** "state" for tenancy "single", otherwise "marketing". A chrome PublicHome replaces both. */
  layout?: "state" | "marketing";
  tagline?: string;
  description?: string;
  /** Exactly three cards, in the order of their icons: discover, understand, draft. */
  features?: { title: string; text: string }[];
  trust?: { title: string; text: string };
  /** Replaces the default credit and support-email lines. */
  attribution?: RichLine[];
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
  shortName?: string;
  home?: HomeCopy;
  footer: {
    /** Footer wordmark image; omit to fall back to `logo`. */
    wordmark?: string;
    /** "Made by" attribution (e.g. ai4impact), if any. */
    madeBy?: LogoLink;
    /** Partner/consortium links + logos. Empty for neutral core. */
    partners: LogoLink[];
    links?: Link[];
    /** Holder in the "© <year> <holder>" line. */
    copyright?: string;
    disclaimer?: string;
  };
  /**
   * Text links for the "This is a tool by:" strip (OmniHeader) on landing/login. Distinct from
   * footer.partners (text, not logos). Empty for neutral core — the strip renders nothing.
   */
  omniPartners: Link[];
  /** A government deployment's identity: a strip above every page (logo + label, linking to href) and the logo beside the app logo. */
  govHeader?: { logo: string; label: string; href: string; sealBesideLogo?: boolean };
  analyticsId?: string;
  seo?: {
    title?: string;
    description?: string;
    ogImage?: { path: string; alt: string };
  };
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
  // No images: every instance brings its own. BrandLogo shows appName as text.
  logo: "",
  favicon: "",
  footer: {
    partners: [],
  },
  omniPartners: [],
};

const BrandingContext = createContext<Branding>(defaultBranding);

export function BrandingProvider({
  value = defaultBranding,
  analytics = false,
  children,
}: {
  value?: Branding;
  /** Load Google Analytics (when branding has an id). */
  analytics?: boolean;
  children: ReactNode;
}) {
  // Push brand colors onto the CSS variables so token-based styles rebrand without
  // touching component code; shades the palette leaves out are derived from its primary.
  useLayoutEffect(() => {
    const root = document.documentElement;
    brandColorVars(value.colors).forEach(([name, color]) => root.style.setProperty(name, color));
  }, [value]);

  // The extra tints go in the core layer, not inline, so an instance's theme.css can still set them.
  useLayoutEffect(() => {
    document.getElementById(TINTS_STYLE_ID)?.remove();
    const css = brandTintsCss(value.colors.primary);
    if (!css) return;
    const style = document.createElement("style");
    style.id = TINTS_STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }, [value.colors.primary]);

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;
    const failures = findContrastFailures(value.colors);
    if (failures.length === 0) return;
    console.warn(
      `[branding] ${value.appName || "This"} palette fails WCAG contrast in ${failures.length} place(s):\n` +
        failures.map((f) => `  ${f.ratio}:1 (needs ${f.required}:1) — ${f.usage}`).join("\n")
    );
  }, [value]);

  // Load Google Analytics from branding.analyticsId — only when enabled and configured, so dev,
  // neutral core and any instance without an id ship no analytics.
  useLayoutEffect(() => {
    const id = value.analyticsId;
    if (!analytics || !id || document.getElementById("ga-gtag")) return;
    const s = document.createElement("script");
    s.id = "ga-gtag";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    // gtag pushes its raw arguments onto dataLayer; the typed window.gtag wrapper is used
    // elsewhere for page-view config calls (see App.tsx), which send every page view, the first included.
    const push = (...args: unknown[]) => window.dataLayer.push(args as unknown as Record<string, unknown>);
    window.gtag = ((command: string, targetId: string, config?: unknown) =>
      push(command, targetId, config)) as typeof window.gtag;
    push("js", new Date());
    push("config", id, { send_page_view: false });
  }, [value.analyticsId, analytics]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

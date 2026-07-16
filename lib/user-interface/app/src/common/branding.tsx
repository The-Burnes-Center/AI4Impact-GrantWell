import { createContext, useContext, useLayoutEffect, ReactNode } from "react";

/**
 * Frontend branding surface. Mirrors BrandingConfig from the shared InstanceConfig contract
 * (lib/shared/config.ts) — kept as a local type so the app has no build-time dependency on the
 * infra source tree. Each deployment injects its own value.
 *
 * `defaultBranding` is the NEUTRAL core default — no partners, placeholder wordmark. Real
 * instances supply their own value from `config/instances/<id>.ts`, selected at build time and
 * injected via BrandingProvider. Nothing instance-specific is baked into the core.
 */
export interface FooterLink {
  label: string;
  href: string;
  logo?: string;
  /** Optional CSS modifier class for per-partner styling (e.g. layout tweaks). */
  className?: string;
}

export interface Branding {
  appName: string;
  orgName: string;
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
    madeBy?: { label: string; href: string; logo?: string };
    /** Partner/consortium links + logos. Empty for neutral core. */
    partners: FooterLink[];
  };
  /**
   * Text links for the "This is a tool by:" strip (OmniHeader) on landing/login. Distinct from
   * footer.partners (text, not logos). Empty for neutral core — the strip renders nothing.
   */
  omniPartners: { label: string; href: string }[];
  analyticsId?: string;
  contactEmail?: string;
}

/** Neutral core default — no instance identity. Real look comes from an injected config. */
export const defaultBranding: Branding = {
  appName: "GrantWell",
  orgName: "",
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

/** Maps branding.colors onto the --gw-color-* CSS variables defined in tokens.css. */
const COLOR_VARS: Record<keyof Branding["colors"], string> = {
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
    (Object.keys(COLOR_VARS) as (keyof Branding["colors"])[]).forEach((key) => {
      const color = value.colors[key];
      if (color) root.style.setProperty(COLOR_VARS[key], color);
    });
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

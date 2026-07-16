import { createContext, useContext, useLayoutEffect, ReactNode } from "react";

/**
 * Frontend branding surface. Mirrors BrandingConfig from the shared InstanceConfig contract
 * (lib/shared/config.ts) — kept as a local type so the app has no build-time dependency on the
 * infra source tree. Each deployment injects its own value.
 *
 * `defaultBranding` is the NEUTRAL core default — no partners, placeholder wordmark. Real
 * instances supply their own: `genericBranding` (the Burnes multi-state product) and, later,
 * per-state configs (MA, etc.). Nothing instance-specific is baked into the core default.
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
};

/**
 * The Burnes-owned multi-state product's branding (today's `generic` instance). Lives here as a
 * preset until real per-instance config wiring exists; will move into generic-config on freeze.
 */
export const genericBranding: Branding = {
  appName: "GrantWell",
  orgName: "Burnes Center for Social Change",
  colors: defaultBranding.colors,
  logo: "/images/marketing/grantwell-wordmark-dark.svg",
  favicon: "/images/marketing/favicon.svg",
  footer: {
    wordmark: "/images/marketing/grantwell-wordmark-footer.svg",
    madeBy: {
      label: "ai4impact",
      href: "https://ai4impact.ai/",
      logo: "/images/marketing/footer-heart.svg",
    },
    partners: [
      { label: "InnovateUS", href: "https://innovate-us.org/", logo: "/images/marketing/footer-innovateus.svg", className: "marketing__partner--innovateus" },
      { label: "Burnes Center for Social Change, Northeastern University", href: "https://burnes.northeastern.edu", logo: "/images/marketing/footer-burnes.png", className: "marketing__partner--burnes" },
      { label: "Reboot Democracy", href: "https://www.rebootdemocracy.ai", logo: "/images/marketing/footer-reboot.svg", className: "marketing__partner--reboot" },
      { label: "The GovLab", href: "https://thegovlab.org", logo: "/images/marketing/footer-govlab.png", className: "marketing__partner--govlab" },
    ],
  },
};

const BrandingContext = createContext<Branding>(genericBranding);

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
  value = genericBranding,
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

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

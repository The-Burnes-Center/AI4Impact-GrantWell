import { createContext, useContext, useLayoutEffect, ReactNode } from "react";

/**
 * Frontend branding surface. Mirrors BrandingConfig from the shared InstanceConfig contract
 * (lib/shared/config.ts) — kept as a local type so the app has no build-time dependency on the
 * infra source tree. A deployment injects its own value; defaultBranding reproduces today's look.
 */
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
  logoFooter?: string;
  favicon: string;
  footerLinks: { label: string; href: string }[];
  analyticsId?: string;
  contactEmail?: string;
}

/** Current production values — swapping these is what rebrands the app. */
export const defaultBranding: Branding = {
  appName: "GrantWell",
  orgName: "Burnes Center for Social Change",
  colors: {
    primary: "#23776C",
    primaryHover: "#195C53",
    primaryActive: "#244140",
    primaryLight: "#DFECE0",
    accent: "#388557",
    accentHover: "#32784E",
  },
  logo: "/images/marketing/grantwell-wordmark-dark.svg",
  logoFooter: "/images/marketing/grantwell-wordmark-footer.svg",
  favicon: "/images/marketing/favicon.svg",
  footerLinks: [],
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

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

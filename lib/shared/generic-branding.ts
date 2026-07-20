// Plain branding values for the "generic" (Burnes multi-state) instance.
// Lives in lib/shared — not the ESM app package — so both the CDK stack (CJS
// ts-node, for the backend digest at synth) and the frontend app can import it.
export const genericBrandingData = {
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
  favicon: "/images/marketing/favicon.svg",
  analyticsId: "G-K27MB9Y26C",
} as const;

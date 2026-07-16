import { Branding } from "../../src/common/branding";

// Throwaway demo state (B4) — a fictional instance proving branding swaps fully on the neutral
// engine: distinct name, palette, org, and its own omni strip, with no MA/generic identity. Not a
// real deployment; safe to delete.
export const branding: Branding = {
  appName: "GrantBridge",
  orgName: "State of Example",
  colors: {
    primary: "#6B2D5C",
    primaryHover: "#571F4A",
    primaryActive: "#3F1637",
    primaryLight: "#F0E3EC",
    accent: "#C4622D",
    accentHover: "#A8501F",
  },
  logo: "/images/marketing/grantwell-wordmark-dark.svg",
  favicon: "/images/marketing/favicon.svg",
  footer: {
    partners: [],
  },
  omniPartners: [
    { label: "State of Example", href: "https://example.gov" },
  ],
};

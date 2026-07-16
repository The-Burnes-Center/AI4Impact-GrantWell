import { Branding } from "../../../src/common/branding";

// TEMPLATE — not an active instance of this (generic) engine. Copied into the separate grantwell-ma
// deliverable repo as config/instances/ma.ts. MA ships its own Mayflower chrome (config/chrome), so
// the footer/omni partner lists here stay empty — MA's chrome renders its own header/footer.
// Values carried from the MA prod branch (main).
export const branding: Branding = {
  appName: "GrantWell",
  orgName: "Commonwealth of Massachusetts",
  colors: {
    // TODO(ma): replace with Mayflower brand tokens when chrome is ported.
    primary: "#23776C",
    primaryHover: "#195C53",
    primaryActive: "#244140",
    primaryLight: "#DFECE0",
    accent: "#388557",
    accentHover: "#32784E",
  },
  logo: "/images/marketing/grantwell-wordmark-dark.svg",
  favicon: "/images/marketing/favicon.svg",
  analyticsId: "G-DY905CMNJN",
  footer: {
    partners: [],
  },
  omniPartners: [],
};

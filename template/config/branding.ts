import type { Branding } from "grantwell-core";

// Image paths are site-root URLs: a file the GrantWell UI ships, or one of yours in public/.
export const branding: Branding = {
  appName: "GrantWell",
  orgName: "Example State Agency",
  postalAddress: "1 State House Way, Capital City, XX 00000",
  supportEmail: "grants@example.gov",
  colors: {
    primary: "#23776C",
  },
  logo: "/images/marketing/grantwell-wordmark-dark.svg",
  favicon: "/images/marketing/favicon.svg",
  footer: {
    partners: [],
  },
  omniPartners: [],
};

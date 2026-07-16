import { Branding } from "../../src/common/branding";

// The Burnes-owned multi-state product ("generic" instance). Moved out of core (branding.tsx)
// so the core carries no instance identity. This IS the instance-specific value the picker
// deployment ships with.
export const branding: Branding = {
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
  omniPartners: [
    { label: "The Burnes Center for Social Change", href: "https://burnes.northeastern.edu" },
    { label: "Reboot Democracy", href: "https://www.rebootdemocracy.ai" },
    { label: "AI for Impact", href: "https://ai4impact.ai/" },
    { label: "The Gov Lab", href: "https://thegovlab.org" },
    { label: "Community-Centered AI", href: "https://communitycentered.ai/" },
  ],
};

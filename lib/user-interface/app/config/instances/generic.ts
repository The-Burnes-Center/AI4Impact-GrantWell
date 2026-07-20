import { Branding } from "../../src/common/branding";
import { genericBrandingData } from "../../../../shared/generic-branding";

// The Burnes-owned multi-state product ("generic" instance). Moved out of core (branding.tsx)
// so the core carries no instance identity. This IS the instance-specific value the picker
// deployment ships with. Plain branding values come from generic.branding.ts (shared with the
// backend digest at synth); the UI-only footer/omniPartners stay here.
export const branding: Branding = {
  ...genericBrandingData,
  footer: {
    wordmark: genericBrandingData.footerLogo,
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

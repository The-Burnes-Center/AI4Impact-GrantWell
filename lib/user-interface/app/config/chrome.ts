// The app's page chrome (header/nav/footer) resolves through this barrel so a delivered instance
// can swap it wholesale. vite aliases `@chrome` here by default (the neutral core chrome); a
// deliverable whose design system differs — e.g. MA's Mayflower — points the alias at its own
// config/chrome instead (see GRANTWELL_CHROME in vite.config.ts). The export surface below is the
// contract any replacement must satisfy.
export {
  OmniHeader,
  LandingNavbar,
  AppNavbar,
  LandingFooter,
} from "../src/pages/landing/chrome";

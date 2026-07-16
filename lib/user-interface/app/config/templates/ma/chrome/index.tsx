// MA chrome barrel — satisfies the @chrome contract (OmniHeader/LandingNavbar/AppNavbar/
// LandingFooter) by adapting MA's Mayflower components. Selected via GRANTWELL_CHROME=ma-chrome.
//
// Mapping onto the core contract:
//   OmniHeader    -> BrandBanner  (the "official website of the Commonwealth" strip)
//   LandingNavbar -> MdsHeader    without sign-out (public pages)
//   AppNavbar     -> MdsHeader    with sign-out (authenticated app)
//   LandingFooter -> MdsFooter
import "./ma-chrome.css";
import BrandBanner from "./BrandBanner";
import MdsHeader from "./MdsHeader";
import MdsFooter from "./MdsFooter";

// BrandBanner renders once; the core calls OmniHeader twice (top + bottom). Only render at top so
// the Commonwealth banner isn't duplicated at the page foot.
export function OmniHeader({ position = "top" }: { position?: "top" | "bottom" }) {
  if (position !== "top") return null;
  return <BrandBanner />;
}

export function LandingNavbar() {
  return <MdsHeader showSignOut={false} />;
}

export function AppNavbar() {
  return <MdsHeader showSignOut={true} />;
}

export function LandingFooter() {
  return <MdsFooter />;
}

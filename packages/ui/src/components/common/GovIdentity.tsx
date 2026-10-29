import { useBranding } from "../../common/branding";
import "../../styles/gov-identity.css";
import { GovBannerView } from "./GovBannerView";

/** Above everything on every page, for government deployments; renders nothing otherwise. */
export function GovBanner() {
  const { govHeader } = useBranding();
  return govHeader ? <GovBannerView govHeader={govHeader} /> : null;
}

/** The government seal beside the app logo; decorative, since GovBanner already names it. */
export function GovSeal() {
  const { govHeader } = useBranding();
  if (!govHeader || govHeader.sealBesideLogo === false) return null;
  return <img className="gov-seal" src={govHeader.logo} alt="" />;
}

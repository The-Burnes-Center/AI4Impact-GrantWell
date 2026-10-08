import { useBranding } from "../../common/branding";
import "../../styles/gov-identity.css";

/** Above everything on every page, for government deployments; renders nothing otherwise. */
export function GovBanner() {
  const { govHeader } = useBranding();
  if (!govHeader) return null;

  return (
    <aside className="gov-banner" aria-label="Official website">
      <a className="gov-banner__link" href={govHeader.href} target="_blank" rel="noreferrer noopener">
        <img className="gov-banner__logo" src={govHeader.logo} alt="" />
        <span>{govHeader.label}</span>
        <span className="visually-hidden"> (opens in new tab)</span>
      </a>
    </aside>
  );
}

/** The government seal beside the app logo; decorative, since GovBanner already names it. */
export function GovSeal() {
  const { govHeader } = useBranding();
  if (!govHeader) return null;
  return <img className="gov-seal" src={govHeader.logo} alt="" />;
}

import type { Branding } from "../../common/branding";

/** GovBanner's markup without its stylesheet, so the build can render it into the static page. */
export function GovBannerView({ govHeader }: { govHeader: NonNullable<Branding["govHeader"]> }) {
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

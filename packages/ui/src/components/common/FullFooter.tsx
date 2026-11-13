import React, { useEffect, useState } from "react";
import { LuArrowUp } from "react-icons/lu";
import { useBranding, type Link } from "../../common/branding";
import { BrandLogo } from "./BrandLogo";
import "../../styles/full-footer.css";

const NARROW = "(max-width: 640px)";

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(NARROW).matches === true);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW);
    if (!query) return;
    const onChange = () => setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

const isExternal = (href: string) => /^https?:/.test(href);

function FooterLink({ link }: { link: Link }) {
  return isExternal(link.href) ? (
    <a href={link.href} target="_blank" rel="noreferrer noopener">
      {link.label}
      <span className="visually-hidden"> (opens in new tab)</span>
    </a>
  ) : (
    <a href={link.href}>{link.label}</a>
  );
}

/** One footer column: a heading over its items on wide screens, a closed accordion on phones, as in the kit. */
function Column({ heading, narrow, children }: { heading: string; narrow: boolean; children: React.ReactNode }) {
  return narrow ? (
    <details className="gw-full-footer__col">
      <summary className="gw-full-footer__heading">{heading}</summary>
      {children}
    </details>
  ) : (
    <div className="gw-full-footer__col">
      <h2 className="gw-full-footer__heading">{heading}</h2>
      {children}
    </div>
  );
}

const returnToTop = () => {
  window.scrollTo({ top: 0 });
  // The skip link is the page's first stop, so keyboard users carry on from the top too.
  document.querySelector<HTMLElement>("a[href^='#'], button, a[href]")?.focus({ preventScroll: true });
};

/** The kit's full footer, for footer.layout "full". */
export function FullFooter() {
  const { logo, appName, home, supportEmail, postalAddress, footer } = useBranding();
  const { columns = [], partners, madeBy, links = [], copyright, disclaimer } = footer;
  const narrow = useNarrow();
  const partnerLinks: Link[] = [...partners, ...(madeBy ? [madeBy] : [])];

  return (
    <footer className="gw-full-footer">
      <div className="gw-full-footer__top">
        <button type="button" className="gw-full-footer__top-link" onClick={returnToTop}>
          <LuArrowUp size={16} aria-hidden="true" /> Return to top
        </button>
      </div>
      <div className="gw-full-footer__cols">
        <div className="gw-full-footer__brand">
          <BrandLogo src={logo} alt={appName} className="gw-full-footer__logo" />
          {home?.tagline && <p className="gw-full-footer__tagline">{home.tagline}</p>}
        </div>
        {columns.map((column) => (
          <Column key={column.heading} heading={column.heading} narrow={narrow}>
            <ul className="gw-full-footer__list">
              {column.links.map((link) => (
                <li key={link.href}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </Column>
        ))}
        {partnerLinks.length > 0 && (
          <Column heading="Partners" narrow={narrow}>
            <ul className="gw-full-footer__list">
              {partnerLinks.map((link) => (
                <li key={link.href}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </Column>
        )}
        {(supportEmail || postalAddress) && (
          <Column heading="Contact us" narrow={narrow}>
            <ul className="gw-full-footer__list">
              {supportEmail && (
                <li>
                  <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
                </li>
              )}
              {postalAddress && <li className="gw-full-footer__address">{postalAddress}</li>}
            </ul>
          </Column>
        )}
      </div>
      <div className="gw-full-footer__bar">
        {copyright && (
          <p className="gw-full-footer__copyright">
            © {new Date().getFullYear()} {copyright}
          </p>
        )}
        {links.length > 0 && (
          <nav aria-label="Legal">
            <ul className="gw-full-footer__legal">
              {links.map((link) => (
                <li key={link.href}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </nav>
        )}
        {disclaimer && <p className="gw-full-footer__disclaimer">{disclaimer}</p>}
      </div>
    </footer>
  );
}

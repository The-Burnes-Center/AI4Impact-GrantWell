import { useEffect } from "react";
import { RELEASES } from "../../common/release-notes";
import { notesMarkdown } from "../../components/whats-new/notes-markdown";
import { LandingNavbar, OmniHeader, SkipLink } from "../landing/chrome";
import "../../components/whats-new/whats-new.css";
import "../../styles/marketing-landing.css";
import { PublicSiteHeader, SiteBanner, SiteFooter } from "../../components/common/ChromeSlots";
import { HAS_CHROME_HEADER } from "../../common/chrome";
import { useBranding } from "../../common/branding";

export function WhatsNewContent() {
  return (
    <div className="whats-new">
      <h1>What&apos;s new</h1>
      {RELEASES.map((r) => (
        <section key={r.version}>{notesMarkdown(r.markdown)}</section>
      ))}
    </div>
  );
}

/** Public: the same page whats-new.html pre-renders for crawlers. */
export default function WhatsNewPage() {
  const { appName } = useBranding();

  useEffect(() => {
    document.title = `What's new – ${appName}`;
  }, [appName]);

  return (
    <div className="marketing">
      <SkipLink />
      <SiteBanner />
      <PublicSiteHeader />
      <OmniHeader />
      {!HAS_CHROME_HEADER && <LandingNavbar />}
      <main id="main-content" tabIndex={-1}>
        <WhatsNewContent />
      </main>
      <SiteFooter signedIn={false} />
      <OmniHeader position="bottom" />
    </div>
  );
}

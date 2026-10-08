import { useEffect } from "react";
import { RELEASES } from "../../common/release-notes";
import { notesMarkdown } from "../../components/whats-new/notes-markdown";
import { LandingNavbar, OmniHeader } from "../landing/chrome";
import "../../components/whats-new/whats-new.css";
import "../../styles/marketing-landing.css";
import { PublicSiteHeader, SiteBanner, SiteFooter } from "../../components/common/ChromeSlots";
import { HAS_CHROME_HEADER } from "../../common/chrome";

export function WhatsNewContent() {
  useEffect(() => {
    document.title = "What's new - GrantWell";
  }, []);

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
  return (
    <div className="marketing">
      <SiteBanner />
      <PublicSiteHeader />
      <OmniHeader />
      <main id="main-content" tabIndex={-1}>
        {!HAS_CHROME_HEADER && <LandingNavbar />}
        <WhatsNewContent />
      </main>
      <SiteFooter signedIn={false} />
      <OmniHeader position="bottom" />
    </div>
  );
}

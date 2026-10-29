import { useEffect } from "react";
import "../../styles/marketing-landing.css";
import AuthPanel from "../../components/auth/AuthPanel";
import { PublicSiteHeader, SiteBanner, SiteFooter } from "../../components/common/ChromeSlots";
import { useBranding } from "../../common/branding";
import { clearSessionEndedNotice, hasSessionEndedNotice } from "../../common/session-ended";
import { SkipLink } from "./chrome";
import { publicHome } from "./public-home";

export default function PublicHomePage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { appName } = useBranding();
  useEffect(() => {
    document.title = `Sign in - ${appName}`;
  }, [appName]);

  const PublicHome = publicHome();
  if (!PublicHome) return null;
  return (
    <>
      <SkipLink />
      <SiteBanner />
      <PublicSiteHeader />
      <main id="main-content" tabIndex={-1}>
        <PublicHome
          signIn={
            <AuthPanel
              headingLevel={2}
              onAuthenticated={onAuthenticated}
              notice={hasSessionEndedNotice() ? "You've been signed out. Please sign in again." : undefined}
              onNoticeDismiss={clearSessionEndedNotice}
            />
          }
        />
      </main>
      <SiteFooter signedIn={false} />
    </>
  );
}

import { useEffect } from "react";
import "../../styles/marketing-landing.css";
import AuthPanel from "../../components/auth/AuthPanel";
import { PublicSiteHeader, SiteBanner, SiteFooter } from "../../components/common/ChromeSlots";
import { CHROME } from "../../common/chrome";
import { useBranding } from "../../common/branding";
import { clearSessionEndedNotice, hasSessionEndedNotice } from "../../common/session-ended";

/** "/" and "/login" when the deployment ships its own public home (chrome PublicHome slot). */
export default function PublicHomePage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { appName } = useBranding();
  useEffect(() => {
    document.title = `Sign in - ${appName}`;
  }, [appName]);

  if (!CHROME.PublicHome) return null;
  return (
    <>
      <SiteBanner />
      <PublicSiteHeader />
      <main id="main-content" tabIndex={-1}>
        <CHROME.PublicHome
          signIn={
            <AuthPanel
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

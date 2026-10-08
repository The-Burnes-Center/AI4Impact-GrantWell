import { useEffect } from "react";
import "../../styles/marketing-landing.css";
import AuthPanel from "../../components/auth/AuthPanel";
import { clearSessionEndedNotice, hasSessionEndedNotice } from "../../common/session-ended";
import { useBranding } from "../../common/branding";
import {
  LandingNavbar,
  OmniHeader,
} from "./chrome";
import { PublicSiteHeader, SiteBanner, SiteFooter } from "../../components/common/ChromeSlots";
import { HAS_CHROME_HEADER } from "../../common/chrome";

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const { appName } = useBranding();
  useEffect(() => {
    document.title = `Sign in - ${appName}`;
  }, [appName]);

  return (
    <div className="marketing">
      <SiteBanner />
      <PublicSiteHeader />
      <OmniHeader />

      <main className="marketing__signin" id="main-content" tabIndex={-1}>
        {!HAS_CHROME_HEADER && <LandingNavbar />}
        <div className="marketing__signin-inner">
          <AuthPanel
            onAuthenticated={onAuthenticated}
            notice={hasSessionEndedNotice() ? "You've been signed out. Please sign in again." : undefined}
            onNoticeDismiss={clearSessionEndedNotice}
          />
        </div>
      </main>

      <SiteFooter signedIn={false} />

      <OmniHeader position="bottom" />
    </div>
  );
}

import "../../styles/marketing-landing.css";
import AuthPanel from "../../components/auth/AuthPanel";
import { clearSessionEndedNotice, hasSessionEndedNotice } from "../../common/session-ended";
import {
  LandingNavbar,
  OmniHeader,
  SkipLink,
} from "./chrome";
import { PublicSiteHeader, SiteBanner, SiteFooter } from "../../components/common/ChromeSlots";
import { HAS_CHROME_HEADER } from "../../common/chrome";

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  return (
    <div className="marketing">
      <SkipLink />
      <SiteBanner />
      <PublicSiteHeader />
      <OmniHeader />
      {!HAS_CHROME_HEADER && <LandingNavbar className="marketing__nav--signin" />}

      <main className="marketing__signin" id="main-content" tabIndex={-1}>
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

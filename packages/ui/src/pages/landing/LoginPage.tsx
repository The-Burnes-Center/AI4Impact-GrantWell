import { useEffect } from "react";
import "../../styles/marketing-landing.css";
import AuthPanel from "../../components/auth/AuthPanel";
import { clearSessionEndedNotice, hasSessionEndedNotice } from "../../common/session-ended";
import { useBranding } from "../../common/branding";
import {
  LandingFooter,
  LandingNavbar,
  OmniHeader,
} from "./chrome";
import { GovBanner } from "../../components/common/GovIdentity";

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
      <GovBanner />
      <OmniHeader />

      <main className="marketing__signin" id="main-content" tabIndex={-1}>
        <LandingNavbar />
        <div className="marketing__signin-inner">
          <AuthPanel
            onAuthenticated={onAuthenticated}
            notice={hasSessionEndedNotice() ? "You've been signed out. Please sign in again." : undefined}
            onNoticeDismiss={clearSessionEndedNotice}
          />
        </div>
      </main>

      <LandingFooter />

      <OmniHeader position="bottom" />
    </div>
  );
}

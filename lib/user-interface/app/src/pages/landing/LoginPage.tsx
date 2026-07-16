import { useEffect } from "react";
import "../../styles/marketing-landing.css";
import AuthPanel from "../../components/auth/AuthPanel";
import { useBranding } from "../../common/branding";
import {
  LandingFooter,
  LandingNavbar,
  OmniHeader,
} from "./chrome";

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const { appName } = useBranding();
  useEffect(() => {
    document.title = `Sign In - ${appName}`;
  }, [appName]);

  return (
    <div className="marketing">
      <OmniHeader />

      <main className="marketing__signin" id="main-content">
        <LandingNavbar />
        <div className="marketing__signin-inner">
          <AuthPanel onAuthenticated={onAuthenticated} />
        </div>
      </main>

      <LandingFooter />

      <OmniHeader position="bottom" />
    </div>
  );
}

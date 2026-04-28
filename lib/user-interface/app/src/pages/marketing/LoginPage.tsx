import "../../styles/marketing-landing.css";
import AuthPanel from "../../components/auth/AuthPanel";
import {
  MarketingFooter,
  MarketingNavbar,
  OmniHeader,
} from "./marketingChrome";

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  return (
    <div className="marketing">
      <OmniHeader />

      <section className="marketing__signin" aria-labelledby="auth-card-title">
        <MarketingNavbar />
        <div className="marketing__signin-inner">
          <AuthPanel onAuthenticated={onAuthenticated} />
        </div>
      </section>

      <MarketingFooter />

      <OmniHeader />
    </div>
  );
}

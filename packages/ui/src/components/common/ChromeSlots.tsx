import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fetchAuthSession, signOut } from "aws-amplify/auth";
import { CHROME } from "../../common/chrome";
import type { ChromeLink } from "../../common/chrome-api";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { LandingFooter } from "../../pages/landing/chrome";
import { useNavigationMenuButton } from "../navigation/navigation-context";
import { SIDEBAR_ID } from "../navigation/UnifiedNavigation";
import { GovBanner } from "./GovIdentity";

export function SiteBanner() {
  return CHROME.Banner ? <CHROME.Banner /> : <GovBanner />;
}

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return CHROME.Footer ? <CHROME.Footer signedIn={signedIn} /> : <LandingFooter />;
}

export function PublicSiteHeader() {
  const navigate = useNavigate();
  if (!CHROME.Header) return null;
  return <CHROME.Header links={[]} navigate={navigate} signOut={() => navigate("/")} />;
}

export function AppSiteHeader() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminCheck();
  const { showMenuButton, isDrawerOpen, toggleDrawer } = useNavigationMenuButton();
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    fetchAuthSession()
      .then((session) => {
        if (active) setEmail(String(session.tokens?.idToken?.payload?.email ?? ""));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!CHROME.Header) return null;
  const links: ChromeLink[] = [
    ...(isAdmin ? [{ label: "Admin Dashboard", href: "/admin" }] : []),
    { label: "Profile", href: "/profile" },
  ];
  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/");
    }
  };
  return (
    <CHROME.Header
      user={{ email, isAdmin }}
      links={links}
      navigate={navigate}
      signOut={() => void handleSignOut()}
      menu={
        showMenuButton ? { expanded: isDrawerOpen, toggle: toggleDrawer, controlsId: SIDEBAR_ID } : undefined
      }
    />
  );
}

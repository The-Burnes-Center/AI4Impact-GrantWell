import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { LuMenu, LuX } from "react-icons/lu";
import { signOut } from "aws-amplify/auth";
import { useBranding } from "../../common/branding";
import { useAdminCheck } from "../../hooks/use-admin-check";
import FeedbackModal from "../common/FeedbackModal";
import { BrandLogo } from "../common/BrandLogo";
import { GovSeal } from "../common/GovIdentity";
import { useNavigationChrome, useNavigationMenuButton } from "./navigation-context";
import { SIDEBAR_ID } from "./UnifiedNavigation";

interface Tab {
  label: string;
  href: string;
  /** A grant's pages light up the list they belong to: chats, applications, or Home for requirements. */
  current: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { label: "Home", href: "/home", current: (p) => p === "/" || p.startsWith("/home") || p.startsWith("/requirements") },
  { label: "My chats", href: "/chat/sessions", current: (p) => p.startsWith("/chat") },
  { label: "My applications", href: "/document-editor/drafts", current: (p) => p.startsWith("/document-editor") },
  { label: "My documents", href: "/documents", current: (p) => p === "/documents" },
];
const ADMIN_TAB: Tab = { label: "Admin dashboard", href: "/admin", current: (p) => p.startsWith("/admin") };

/** The signed-in header for the "tabs" navigation layout: wordmark and account links, then the main pages as tabs. */
export function AppTabsHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const branding = useBranding();
  const { isAdmin } = useAdminCheck();
  const chrome = useNavigationChrome();
  const { showMenuButton, isDrawerOpen, toggleDrawer } = useNavigationMenuButton();
  const [showFeedback, setShowFeedback] = useState(false);

  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;
  const guarded = (run: () => void) => (chrome?.runGuarded ? chrome.runGuarded(run) : run());

  const follow = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    guarded(() => navigate(href));
  };

  const handleSignOut = () =>
    guarded(async () => {
      try {
        await signOut();
      } catch (error) {
        console.error("Error signing out:", error);
      } finally {
        navigate("/");
      }
    });

  return (
    <header className="gw-app-header">
      <div className="gw-app-header__bar">
        <div className="gw-app-header__lead">
          {showMenuButton && (
            <button
              type="button"
              className="gw-btn gw-btn--icon gw-app-header__menu"
              onClick={toggleDrawer}
              aria-label={isDrawerOpen ? "Close main menu" : "Open main menu"}
              aria-expanded={isDrawerOpen}
              aria-controls={SIDEBAR_ID}
            >
              {isDrawerOpen ? <LuX size={22} aria-hidden="true" /> : <LuMenu size={22} aria-hidden="true" />}
            </button>
          )}
          <a
            href="/home"
            onClick={follow("/home")}
            className="gw-app-header__brand"
            aria-current={pathname === "/home" ? "page" : undefined}
          >
            <GovSeal />
            <BrandLogo src={branding.logo} alt={branding.appName} className="gw-app-header__wordmark" />
          </a>
        </div>
        {!showMenuButton && (
          <div className="gw-app-header__account">
            <button type="button" className="gw-app-header__link" onClick={() => setShowFeedback(true)}>
              Help &amp; feedback
            </button>
            <a
              href="/profile"
              onClick={follow("/profile")}
              className="gw-app-header__link"
              aria-current={pathname.startsWith("/profile") ? "page" : undefined}
            >
              Profile
            </a>
            <button type="button" className="gw-app-header__link" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
      {!showMenuButton && (
        <nav className="gw-app-header__tabs" aria-label="Main">
          <ul className="gw-tabs">
            {tabs.map((tab) => (
              <li key={tab.href}>
                <a
                  href={tab.href}
                  onClick={follow(tab.href)}
                  className="gw-tab"
                  aria-current={pathname === tab.href ? "page" : tab.current(pathname) ? "true" : undefined}
                >
                  {tab.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
    </header>
  );
}

import type { ComponentType, ReactNode } from "react";

/**
 * What a deployment's own chrome (its repo's chrome/ folder, copied to src/instance-chrome/ at
 * build) may provide. Every slot is optional; an empty slot keeps GrantWell's own. Chrome code
 * may import only React and this file, plus its own files and CSS.
 */
export const CHROME_API_VERSION = 1;

/**
 * Class names chrome CSS (theme.css and anything chrome imports) may style. GrantWell keeps these
 * across releases; one it drops moves to CHROME_CLASSES_RETIRED. grantwell-check warns about chrome
 * CSS that styles any other GrantWell class, since those can change in any release.
 */
export const CHROME_CLASSES = [
  // Page shells and navigation
  "marketing",
  "marketing__app-main",
  "gov-banner",
  "gov-seal",
  "active",
  "tab-controls",
  "tab-button",
  "checklist-tabs",
  "checklist-tab",
  "checklist-tab--active",
  // State home page
  "state-home",
  "state-home__band",
  "state-home__title",
  "state-home__logo",
  "state-home__tagline",
  "state-home__description",
  "state-home__sign-in",
  "state-home__features",
  "state-home__feature",
  "state-home__feature-icon",
  "state-home__trust",
  "state-home__attribution",
  // Sign-in and create-account panel
  "auth-card-logo",
  "auth-tabs",
  "auth-login-card",
  "auth-card-header",
  "auth-card-title",
  "auth-card-subtitle",
  "auth-card-content",
  "auth-form-description",
  "auth-footer-prompt",
  "login-form",
  "login-form-actions",
  "login-form-options",
  "login-form-footer",
  "login-form-footer--center",
  "login-form-footer--split",
  "login-submit-button",
  "forgot-password-link",
  "create-account-link",
  "create-account-link--inline",
  "show-password-checkbox",
  "password-requirements",
  "password-requirement",
  "requirement-icon",
  "form-input",
  "form-label",
  // Bootstrap classes GrantWell renders
  "alert",
  "btn",
  "btn-link",
  "form-control",
  "form-check-input",
  "form-check-label",
  "text-muted",
  "text-success",
] as const;

/** Classes dropped from CHROME_CLASSES, each with what to style instead. */
export const CHROME_CLASSES_RETIRED: Record<string, string> = {};

export interface ChromeLink {
  label: string;
  href: string;
}

export interface ChromeUser {
  email: string;
  isAdmin: boolean;
}

export interface ChromeMenu {
  expanded: boolean;
  toggle: () => void;
  /** The menu panel's id, for the toggle's aria-controls. */
  controlsId: string;
}

export interface HeaderProps {
  /** Undefined on public pages. */
  user?: ChromeUser;
  /** For signed-in users: Admin Dashboard (admins only) and Profile; the sidebar keeps the rest. */
  links: ChromeLink[];
  /** Client-side navigation to an app path such as "/home". */
  navigate: (href: string) => void;
  signOut: () => void;
  /**
   * Set while the app's menu is a drawer (narrow screens, and /home): the header must then show a
   * button for it, since the app's own top bar steps aside for a chrome Header.
   */
  menu?: ChromeMenu;
}

export interface FooterProps {
  signedIn: boolean;
}

export interface PublicHomeProps {
  /** GrantWell's sign-in and create-account panel, ready to place on the page. */
  signIn: ReactNode;
}

export interface Chrome {
  /** Must be CHROME_API_VERSION, so a chrome written for another version fails the type check. */
  apiVersion: typeof CHROME_API_VERSION;
  /** Replaces the official-website strip (branding.govHeader) at the top of every page. */
  Banner?: ComponentType;
  /** Shown under the banner on every page; the app's own top bar and sidebar logo then step aside. */
  Header?: ComponentType<HeaderProps>;
  /** Replaces the footer on every page. */
  Footer?: ComponentType<FooterProps>;
  /** Replaces the public home page at "/" and "/login". */
  PublicHome?: ComponentType<PublicHomeProps>;
}

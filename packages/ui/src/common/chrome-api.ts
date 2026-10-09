import type { ComponentType, ReactNode } from "react";

/**
 * What a deployment's own chrome (its repo's chrome/ folder, copied to src/instance-chrome/ at
 * build) may provide. Every slot is optional; an empty slot keeps GrantWell's own. Chrome code
 * may import only React and this file, plus its own files and CSS.
 */
export const CHROME_API_VERSION = 1;

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
  apiVersion: number;
  /** Replaces the official-website strip (branding.govHeader) at the top of every page. */
  Banner?: ComponentType;
  /** Shown under the banner on every page; the app's own top bar and sidebar logo then step aside. */
  Header?: ComponentType<HeaderProps>;
  /** Replaces the footer on every page. */
  Footer?: ComponentType<FooterProps>;
  /** Replaces the public home page at "/" and "/login". */
  PublicHome?: ComponentType<PublicHomeProps>;
}

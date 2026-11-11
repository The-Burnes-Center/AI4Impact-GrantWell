import { createContext, useContext, useEffect } from "react";
import { activeBranding } from "../../common/instance";
import { HAS_CHROME_HEADER } from "../../common/chrome";

/** Must match the app chrome media query in marketing-landing.css. */
export const MOBILE_NAV_BREAKPOINT = 960;

export interface NavigationRegistration {
  documentIdentifier?: string;
  currentStep?: string;
  furthestStepIndex?: number;
  onNavigate?: (step: string) => void;
}

/** Runs `proceed` once the page agrees to be left (e.g. after confirming unsaved changes are lost). */
export type LeaveGuard = (proceed: () => void) => void;

export const isUndockedRoute = (pathname: string) =>
  pathname === "/" || pathname.startsWith("/home");

/** Main pages sit in header tabs and the side menu shows only on a grant's pages. A chrome Header keeps the side menu. */
export const usesHeaderTabs = (): boolean => activeBranding.navigation?.layout === "tabs" && !HAS_CHROME_HEADER;

/** A grant's own pages: its requirements, a chat, and an open application (not the lists). */
export const isGrantRoute = (pathname: string) =>
  pathname.startsWith("/requirements") ||
  (pathname.startsWith("/chat") && pathname !== "/chat/sessions") ||
  (pathname.startsWith("/document-editor") && pathname !== "/document-editor/drafts");

export interface NavigationContextValue {
  documentIdentifier?: string;
  currentStep?: string;
  furthestStepIndex?: number;
  hasStepNav: boolean;
  goToStep: (step: string) => void;
  register: (registration: NavigationRegistration) => void;
  unregister: () => void;
  isMobile: boolean;
  isDocked: boolean;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  hasExternalMenuButton: boolean;
  registerMenuButton: () => () => void;
  setLeaveGuard: (guard: LeaveGuard | null) => void;
  runGuarded: (proceed: () => void) => void;
}

export const NavigationContext = createContext<NavigationContextValue | null>(
  null
);

export function useNavigationChrome(): NavigationContextValue | null {
  return useContext(NavigationContext);
}

export function useNavigationMenuButton() {
  const context = useContext(NavigationContext);
  const registerMenuButton = context?.registerMenuButton;

  useEffect(() => {
    if (!registerMenuButton) return;
    return registerMenuButton();
  }, [registerMenuButton]);

  return {
    showMenuButton: context ? (usesHeaderTabs() ? context.isMobile : !context.isDocked) : false,
    isDrawerOpen: context?.isDrawerOpen ?? false,
    toggleDrawer: context?.toggleDrawer ?? (() => undefined),
  };
}

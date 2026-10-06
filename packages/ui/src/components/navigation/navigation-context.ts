import { createContext, useContext, useEffect } from "react";

/** Must match the app chrome media query in marketing-landing.css. */
export const MOBILE_NAV_BREAKPOINT = 960;

export interface NavigationRegistration {
  documentIdentifier?: string;
  currentStep?: string;
  furthestStepIndex?: number;
  onNavigate?: (step: string) => void;
}

export const isUndockedRoute = (pathname: string) =>
  pathname === "/" || pathname.startsWith("/home");

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
    showMenuButton: context ? !context.isDocked : false,
    isDrawerOpen: context?.isDrawerOpen ?? false,
    toggleDrawer: context?.toggleDrawer ?? (() => undefined),
  };
}

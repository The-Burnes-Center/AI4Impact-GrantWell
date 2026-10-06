import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router";
import {
  isUndockedRoute,
  MOBILE_NAV_BREAKPOINT,
  NavigationContext,
  NavigationContextValue,
  NavigationRegistration,
} from "./navigation-context";

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = useState<{
    documentIdentifier?: string;
    currentStep?: string;
    furthestStepIndex?: number;
    hasStepNav: boolean;
  }>({ hasStepNav: false });
  const onNavigateRef = useRef<((step: string) => void) | null>(null);
  const [menuButtonCount, setMenuButtonCount] = useState(0);
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= MOBILE_NAV_BREAKPOINT
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  const isDocked = !isMobile && !isUndockedRoute(pathname);

  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.innerWidth <= MOBILE_NAV_BREAKPOINT);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isDocked) setIsDrawerOpen(false);
  }, [isDocked]);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  // Pages re-register with an inline onNavigate, so the callback lives in a ref to avoid a render loop.
  const register = useCallback((next: NavigationRegistration) => {
    onNavigateRef.current = next.onNavigate ?? null;
    setRegistration((prev) =>
      prev.documentIdentifier === next.documentIdentifier &&
      prev.currentStep === next.currentStep &&
      prev.furthestStepIndex === next.furthestStepIndex &&
      prev.hasStepNav === Boolean(next.onNavigate)
        ? prev
        : {
            documentIdentifier: next.documentIdentifier,
            currentStep: next.currentStep,
            furthestStepIndex: next.furthestStepIndex,
            hasStepNav: Boolean(next.onNavigate),
          }
    );
  }, []);

  const unregister = useCallback(() => {
    onNavigateRef.current = null;
    setRegistration((prev) =>
      prev.documentIdentifier === undefined &&
      prev.currentStep === undefined &&
      prev.furthestStepIndex === undefined &&
      !prev.hasStepNav
        ? prev
        : { hasStepNav: false }
    );
  }, []);

  const goToStep = useCallback((step: string) => {
    onNavigateRef.current?.(step);
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((open) => !open), []);

  const registerMenuButton = useCallback(() => {
    setMenuButtonCount((count) => count + 1);
    return () => setMenuButtonCount((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo<NavigationContextValue>(
    () => ({
      documentIdentifier: registration.documentIdentifier,
      currentStep: registration.currentStep,
      furthestStepIndex: registration.furthestStepIndex,
      hasStepNav: registration.hasStepNav,
      goToStep,
      register,
      unregister,
      isMobile,
      isDocked,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      hasExternalMenuButton: menuButtonCount > 0,
      registerMenuButton,
    }),
    [
      registration,
      goToStep,
      register,
      unregister,
      isMobile,
      isDocked,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      menuButtonCount,
      registerMenuButton,
    ]
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

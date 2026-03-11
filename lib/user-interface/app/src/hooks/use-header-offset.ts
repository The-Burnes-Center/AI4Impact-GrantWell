import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Calculates the combined height of the MDS brand banner and header.
 *
 * Watches for DOM mutations, window resizes, and scroll events so the
 * returned value stays in sync with the actual rendered height.
 * Scroll and resize listeners are throttled to avoid excessive re-renders.
 *
 * @param defaultOffset - fallback value before the DOM is measured (default 100)
 * @returns the current pixel height of brand banner + MDS header
 */
export function useHeaderOffset(defaultOffset = 100): number {
  const [topOffset, setTopOffset] = useState<number>(defaultOffset);
  const rafId = useRef<number>(0);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    const bannerElement = document.querySelector(".ma__brand-banner");
    const mdsHeaderElement = document.querySelector(".ma__header_slim");

    let bannerHeight = 40;
    let mdsHeaderHeight = 60;

    if (bannerElement) {
      bannerHeight = bannerElement.getBoundingClientRect().height;
    }
    if (mdsHeaderElement) {
      mdsHeaderHeight = mdsHeaderElement.getBoundingClientRect().height;
    }

    setTopOffset(bannerHeight + mdsHeaderHeight);
  }, []);

  const updateTopOffset = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(measure);
  }, [measure]);

  const throttledUpdate = useCallback(() => {
    if (throttleTimer.current) return;
    throttleTimer.current = setTimeout(() => {
      throttleTimer.current = null;
      updateTopOffset();
    }, 100);
  }, [updateTopOffset]);

  useEffect(() => {
    const timer = setTimeout(updateTopOffset, 100);
    updateTopOffset();

    const observer = new MutationObserver(updateTopOffset);
    const bannerElement = document.querySelector(".ma__brand-banner");
    const mdsHeaderElement = document.querySelector(".ma__header_slim");

    const observerOptions: MutationObserverInit = {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["class", "style"],
    };

    if (bannerElement) {
      observer.observe(bannerElement, observerOptions);
    }
    if (mdsHeaderElement) {
      observer.observe(mdsHeaderElement, observerOptions);
    }

    window.addEventListener("resize", throttledUpdate);
    window.addEventListener("scroll", throttledUpdate, { passive: true });

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafId.current);
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
      observer.disconnect();
      window.removeEventListener("resize", throttledUpdate);
      window.removeEventListener("scroll", throttledUpdate);
    };
  }, [updateTopOffset, throttledUpdate]);

  return topOffset;
}

export default useHeaderOffset;

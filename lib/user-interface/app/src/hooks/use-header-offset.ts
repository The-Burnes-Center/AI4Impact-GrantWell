import { useState, useEffect } from "react";

/**
 * Calculates the combined height of the MDS brand banner and header.
 *
 * Watches for DOM mutations, window resizes, and scroll events so the
 * returned value stays in sync with the actual rendered height.
 *
 * @param defaultOffset - fallback value before the DOM is measured (default 100)
 * @returns the current pixel height of brand banner + MDS header
 */
export function useHeaderOffset(defaultOffset = 100): number {
  const [topOffset, setTopOffset] = useState<number>(defaultOffset);

  useEffect(() => {
    const updateTopOffset = () => {
      requestAnimationFrame(() => {
        const bannerElement = document.querySelector(".ma__brand-banner");
        const mdsHeaderElement = document.querySelector(".ma__header_slim");

        let bannerHeight = 40; // fallback
        let mdsHeaderHeight = 60; // fallback

        if (bannerElement) {
          bannerHeight = bannerElement.getBoundingClientRect().height;
        }
        if (mdsHeaderElement) {
          mdsHeaderHeight = mdsHeaderElement.getBoundingClientRect().height;
        }

        setTopOffset(bannerHeight + mdsHeaderHeight);
      });
    };

    // Initial calculation with a small delay for headers to render
    const timer = setTimeout(updateTopOffset, 100);
    updateTopOffset();

    // Watch for DOM mutations on both header elements
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

    window.addEventListener("resize", updateTopOffset);
    window.addEventListener("scroll", updateTopOffset, { passive: true });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", updateTopOffset);
      window.removeEventListener("scroll", updateTopOffset);
    };
  }, []);

  return topOffset;
}

export default useHeaderOffset;

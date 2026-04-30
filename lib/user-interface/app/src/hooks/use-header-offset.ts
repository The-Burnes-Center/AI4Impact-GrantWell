import { useState, useEffect, useRef, useCallback } from "react";

export function useHeaderOffset(defaultOffset = 60): number {
  const [topOffset, setTopOffset] = useState<number>(defaultOffset);
  const rafId = useRef<number>(0);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    const headerElement = document.querySelector("header");
    setTopOffset(headerElement ? headerElement.getBoundingClientRect().height : defaultOffset);
  }, [defaultOffset]);

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
    const headerElement = document.querySelector("header");

    if (headerElement) {
      observer.observe(headerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
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

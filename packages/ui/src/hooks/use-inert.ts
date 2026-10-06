import { useEffect, useRef } from "react";

export function useInert<T extends HTMLElement = HTMLDivElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (active) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }

    return () => el.removeAttribute("inert");
  }, [active]);

  return ref;
}

export default useInert;

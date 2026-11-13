import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface PageTitleState {
  label: string | null;
  setLabel: (label: string | null) => void;
}

const PageTitleContext = createContext<PageTitleState>({ label: null, setLabel: () => {} });

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ label, setLabel }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleOverride(): string | null {
  return useContext(PageTitleContext).label;
}

/**
 * Replaces the route's page label in document.title while the caller is mounted, for pages the
 * route alone can't name (not found). App's ScrollToTop still builds the title, so it survives
 * search and hash changes.
 */
export function usePageTitle(label: string | null) {
  const { setLabel } = useContext(PageTitleContext);
  useEffect(() => {
    if (!label) return;
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
}

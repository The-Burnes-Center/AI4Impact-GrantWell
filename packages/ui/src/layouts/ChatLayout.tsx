import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import UnifiedNavigation from "../components/navigation/UnifiedNavigation";
import { useInert } from "../hooks/use-inert";
import { useNavigationChrome } from "../components/navigation/navigation-context";

const DRAWER_NAVBAR_HEIGHT = 60;

/** How far below the page top the app body starts: whatever banner, header or tabs the deployment shows. */
const useTopChromeHeight = (fallback: number) => {
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const body = document.querySelector(".marketing__app-body");
    if (!body) return;
    const measure = () => setTop(Math.max(0, Math.round(body.getBoundingClientRect().top + window.scrollY)));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return top ?? fallback;
};
const MIN_CONTENT_HEIGHT = 360;

const useViewportSize = () => {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
};

const useElementHeight = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
};

interface BaseAppLayoutProps {
  header: React.ReactNode;
  content: React.ReactNode;
  info?: React.ReactNode;
  toolsOpenExternal?: boolean;
  onToolsOpenChange?: (isOpen: boolean) => void;
  documentIdentifier?: string;
  toolsWidth?: number;
  sessionId?: string | null;
  modalOpen?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  mainContainer: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
  },
  contentArea: {
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
  toolsPanel: {
    height: "100%",
    overflow: "auto",
    borderLeft: "1px solid var(--gw-color-border-strong)",
    backgroundColor: "var(--gw-color-background)",
    minWidth: 0,
  },
  sidebar: {
    backgroundColor: "var(--gw-color-primary-active)",
    color: "white",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.3s ease",
    overflow: "hidden",
    borderRight: "1px solid var(--gw-color-primary-active)",
    position: "static",
    flexShrink: 0,
  },
  sidebarExpanded: {
    width: "240px",
  },
  sidebarCollapsed: {
    width: "72px",
  },
  sidebarHeader: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid var(--gw-color-primary-active)",
  },
  sidebarToggle: {
    background: "none",
    border: "none",
    color: "var(--gw-color-text-inverse)",
    cursor: "pointer",
  },
  navContainer: {
    flex: 1,
    padding: "16px 8px",
    overflowY: "auto",
  },
  sectionHeader: {
    padding: "8px 12px",
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    color: "var(--gw-color-text-inverse)",
    fontSize: "14px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  navButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    padding: "12px",
    marginBottom: "4px",
    background: "transparent",
    color: "var(--gw-color-text-inverse)",
    border: "none",
    borderRadius: "var(--gw-radius-control)",
    cursor: "pointer",
    fontWeight: 500,
    textAlign: "left",
    textDecoration: "none",
  },
  navButtonActive: {
    background: "var(--gw-color-primary)",
    color: "white",
  },
  navLinkText: {
    marginLeft: "12px",
  },
};

export default function BaseAppLayout({
  header,
  content,
  info,
  toolsOpenExternal = false,
  onToolsOpenChange,
  documentIdentifier,
  toolsWidth = 300,
  sessionId,
  modalOpen = false,
}: BaseAppLayoutProps) {
  const { width: viewportWidth, height: viewportHeight } = useViewportSize();
  const isNarrowViewport = viewportWidth <= 320;
  // Callers render their modals as siblings of this layout, so everything the
  // layout owns is background while one is open.
  const inertRootRef = useInert<HTMLDivElement>(modalOpen);
  const topChromeHeight = useTopChromeHeight(useNavigationChrome()?.isDocked === false ? DRAWER_NAVBAR_HEIGHT : 0);
  const [headerRef, headerHeight] = useElementHeight<HTMLDivElement>();
  const availableHeight = `calc(100vh - ${topChromeHeight}px)`;
  // Zoomed or short windows: the page scrolls and the chat gets a viewport of its own.
  const scrollPage = viewportHeight - topChromeHeight - headerHeight < MIN_CONTENT_HEIGHT;

  return (
    <div
      ref={inertRootRef}
      aria-hidden={modalOpen || undefined}
      style={{
        ...styles.container,
        ...(scrollPage
          ? { height: "auto", minHeight: availableHeight, overflow: "visible" }
          : { height: availableHeight, maxHeight: availableHeight }),
        width: "100%",
        margin: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: scrollPage ? "visible" : "hidden",
          alignItems: "stretch",
          flexDirection: isNarrowViewport ? "column" : "row",
          minHeight: 0,
        }}
      >
        <UnifiedNavigation documentIdentifier={documentIdentifier} />

        {/* Main content area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: scrollPage ? "visible" : "hidden",
            margin: 0,
            padding: 0,
            minHeight: 0,
            minWidth: 0,
            width: isNarrowViewport ? '100%' : 'auto',
          }}
        >
          {/* Header area */}
          <div ref={headerRef} style={{ flexShrink: 0 }}>
            {header}
          </div>

          {/* Main content area */}
          <div style={{
            ...styles.mainContainer,
            flexDirection: isNarrowViewport ? 'column' : 'row',
            ...(scrollPage && { flex: "none", height: availableHeight, minHeight: MIN_CONTENT_HEIGHT }),
          }}>
            {/* Primary content */}
            <div style={{
              ...styles.contentArea,
              width: isNarrowViewport ? '100%' : 'auto',
            }}>
              {content}
            </div>

            {/* Tools/help panel - stacks below content on narrow viewports */}
            {toolsOpenExternal && info && (
              <div
                style={{
                  ...styles.toolsPanel,
                  width: isNarrowViewport ? '100%' : toolsWidth,
                  height: isNarrowViewport ? 'auto' : '100%',
                  borderLeft: isNarrowViewport ? 'none' : '1px solid var(--gw-color-border)',
                  borderTop: isNarrowViewport ? '1px solid var(--gw-color-border)' : 'none',
                }}
              >
                {info}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

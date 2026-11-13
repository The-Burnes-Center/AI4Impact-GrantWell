import React, { useEffect, useId, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { v4 as uuidv4 } from "uuid";
import { addToRecentlyViewed } from "../../common/helpers/recently-viewed-nofos";
import {
  LuHouse,
  LuMessageSquare,
  LuMessagesSquare,
  LuFileText,
  LuSquareCheckBig,
  LuUpload,
  LuLayoutDashboard,
  LuMenu,
  LuX,
  LuChevronLeft,
  LuChevronRight,
  LuPencilLine,
  LuListChecks,
  LuFilePlus2,
  LuFileCheck2,
  LuCircleHelp,
  LuUser,
  LuLogOut,
  LuFolderOpen,
} from "react-icons/lu";
import { signOut } from "aws-amplify/auth";
import { useBranding } from "../../common/branding";
import FeedbackModal from "../common/FeedbackModal";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import {
  usesHeaderTabs,
  NavigationRegistration,
  useNavigationChrome,
} from "./navigation-context";
import { BrandLogo } from "../common/BrandLogo";
import { CHROME } from "../../common/chrome";
import { GovSeal } from "../common/GovIdentity";

export const SIDEBAR_ID = "gw-app-sidebar";

const EXPANDED_WIDTH = "240px";
const COLLAPSED_WIDTH = "60px";
const DRAWER_WIDTH = "280px";

const groupHeadingStyle: React.CSSProperties = {
  margin: 0,
  padding: "0 16px 8px 16px",
  fontSize: "var(--gw-font-size-sm, 14px)",
  fontWeight: 600,
  color: "var(--gw-color-nav-text, #e2e8f0)",
  fontFamily: "var(--gw-font-family, 'Noto Sans', sans-serif)",
};

const itemStyle = (active: boolean): React.CSSProperties => ({
  width: "100%",
  display: "flex",
  alignItems: "center",
  padding: "12px 16px",
  borderRadius: "var(--gw-radius-container, 8px)",
  marginBottom: "8px",
  background: active ? "var(--gw-color-primary, #23776C)" : "none",
  color: active ? "var(--gw-color-surface, #ffffff)" : "var(--gw-color-nav-text, #e2e8f0)",
  border: "none",
  fontSize: "var(--gw-font-size-base, 16px)",
  cursor: "pointer",
  transition: "background 0.2s, color 0.2s",
  textAlign: "left",
  textDecoration: "none",
  fontFamily: "var(--gw-font-family, 'Noto Sans', sans-serif)",
});

const NavItem: React.FC<{
  onClick: () => void;
  /** Items that go to another page are links, so screen readers say "link"; actions stay buttons. */
  href?: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  expanded: boolean;
  currentKind?: "page" | "step";
}> = ({ onClick, href, label, icon, active, expanded, currentKind = "page" }) => {
  const follow = (e: React.MouseEvent<HTMLElement>) => {
    if (href && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return;
    e.preventDefault();
    onClick();
  };
  const tabs = usesHeaderTabs();
  const props = {
    onClick: follow,
    "aria-label": tabs || expanded ? undefined : label,
    "aria-current": active ? currentKind : undefined,
    ...(tabs
      ? { className: "gw-sidenav__item" }
      : {
          style: itemStyle(active),
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
            if (!active) e.currentTarget.style.background = "var(--gw-color-nav-bg-hover, #2d3748)";
          },
          onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
            if (!active) e.currentTarget.style.background = "none";
          },
        }),
  };
  const content = (
    <>
      {icon}
      {tabs ? <span>{label}</span> : expanded && <span style={{ marginLeft: "12px" }}>{label}</span>}
    </>
  );
  return href ? (
    <a href={href} {...props}>
      {content}
    </a>
  ) : (
    <button type="button" {...props}>
      {content}
    </button>
  );
};

/** A group's label, not a heading: the menu sits before the page's h1, and its landmark already names it. */
const GroupHeading: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) =>
  usesHeaderTabs() ? (
    <p className="gw-sidenav__group" id={id}>{children}</p>
  ) : (
    <p style={groupHeadingStyle} id={id}>{children}</p>
  );

const STEP_ITEMS: { step: string; label: string; icon: React.ReactNode }[] = [
  {
    step: "projectBasics",
    label: "Project basics",
    icon: <LuPencilLine size={20} aria-hidden="true" />,
  },
  {
    step: "questionnaire",
    label: "Questionnaire",
    icon: <LuListChecks size={20} aria-hidden="true" />,
  },
  {
    step: "uploadDocuments",
    label: "Additional information",
    icon: <LuFilePlus2 size={20} aria-hidden="true" />,
  },
  {
    step: "sectionEditor",
    label: "Section editor",
    icon: <LuFileText size={20} aria-hidden="true" />,
  },
  {
    step: "reviewApplication",
    label: "Review",
    icon: <LuFileCheck2 size={20} aria-hidden="true" />,
  },
];

const grantFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/requirements\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export const AppSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const chrome = useNavigationChrome();
  const { isAdmin } = useAdminCheck();
  const branding = useBranding();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [fallbackChecked, setFallbackChecked] = useState(false);
  const [linkChatId] = useState(() => uuidv4());
  const groupId = useId();

  const isDocked = chrome?.isDocked ?? true;
  // With header tabs, the side menu is a drawer on phones only; elsewhere it is docked on a grant's pages or absent.
  const isDrawer = usesHeaderTabs() ? chrome?.isMobile ?? false : !isDocked;
  const isDrawerOpen = chrome?.isDrawerOpen ?? false;
  const closeDrawer = chrome?.closeDrawer;
  const runGuarded = chrome?.runGuarded;
  const openDrawer = chrome?.openDrawer;
  const currentStep = chrome?.currentStep;
  const hasStepNav = chrome?.hasStepNav ?? false;
  const furthestStepIndex =
    chrome?.furthestStepIndex ??
    STEP_ITEMS.findIndex((item) => item.step === currentStep);
  const goToStep = chrome?.goToStep;

  const drawerRef = useFocusTrap<HTMLDivElement>({
    isOpen: isDrawer && isDrawerOpen,
    onEscape: () => closeDrawer?.(),
  });

  useEffect(() => {
    const id = setTimeout(() => setFallbackChecked(true), 0);
    return () => clearTimeout(id);
  }, []);

  // A deployment's banner and header sit above the sticky sidebar, so a full 100vh would push its
  // bottom group below the fold until the page scrolls past them.
  const [chromeOffset, setChromeOffset] = useState(0);
  useEffect(() => {
    const body = drawerRef.current?.parentElement;
    if (!isDocked || !body) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setChromeOffset(Math.max(0, Math.round(body.getBoundingClientRect().top)))
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [isDocked, drawerRef]);

  const currentPath = location.pathname;
  const isDrafts = currentPath === "/document-editor/drafts";
  const isDocumentEditor =
    currentPath.startsWith("/document-editor") && !isDrafts;
  const isRequirements = currentPath.startsWith("/requirements");
  const isChatSessions = currentPath === "/chat/sessions";
  const isChatActive = currentPath.startsWith("/chat") && !isChatSessions;
  const isDashboard = currentPath.startsWith("/admin");
  const isHome = currentPath === "/" || currentPath.startsWith("/home");
  const isProfile = currentPath.startsWith("/profile");
  const isDocuments = currentPath === "/documents";

  const docId =
    chrome?.documentIdentifier ||
    grantFromPath(currentPath) ||
    searchParams.get("grant") ||
    searchParams.get("folder") ||
    searchParams.get("nofo");

  const go = (action: () => void, leavesPage = true) => () => {
    const run = () => {
      action();
      closeDrawer?.();
    };
    if (leavesPage && runGuarded) runGuarded(run);
    else run();
  };

  const grantQuery = docId ? `?grant=${encodeURIComponent(docId)}` : "";
  const chatSessionsHref = `/chat/sessions${grantQuery}`;
  const draftsHref = `/document-editor/drafts${grantQuery}`;
  const requirementsHref = docId ? `/requirements/${encodeURIComponent(docId)}${grantQuery}` : "";
  const editorHref = `/document-editor${grantQuery}`;

  // A new chat id per click; the link's own id is only for opening one in a new tab.
  const handleChatNavigation = () => navigate(`/chat/${uuidv4()}${grantQuery}`);

  const handleRequirementsNavigation = () => {
    if (!docId) return;
    addToRecentlyViewed({ label: docId.replace("/", ""), value: docId });
    navigate(requirementsHref);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      navigate("/");
    }
  };

  const showLabels = usesHeaderTabs() || !isDocked ? true : isExpanded;
  const drawerHidden = isDrawer && !isDrawerOpen;
  const grantOnly = usesHeaderTabs() && !isDrawer;
  const hasGrantItems =
    Boolean(docId) ||
    (isDocumentEditor && hasStepNav && Boolean(currentStep) && currentStep !== "drafts" && currentStep !== "welcome");

  const panelStyle: React.CSSProperties = {
    background: usesHeaderTabs() ? "var(--gw-color-surface-subtle)" : "var(--gw-color-nav-bg, #1a202c)",
    color: usesHeaderTabs() ? "var(--gw-color-text)" : "var(--gw-color-surface, #ffffff)",
    // The inline display would win over the `hidden` attribute's UA rule, so drop it explicitly.
    display: drawerHidden ? "none" : "flex",
    flexDirection: "column",
    borderRight: usesHeaderTabs() ? "1px solid var(--gw-color-border)" : "1px solid var(--gw-color-nav-bg-hover, #2d3748)",
    overflow: "hidden",
    flexShrink: 0,
    ...(isDrawer
      ? {
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: DRAWER_WIDTH,
          maxWidth: "85vw",
          height: "100vh",
          zIndex: "calc(var(--gw-z-drawer, 900) + 1)",
          boxShadow: "var(--gw-shadow-high, 0 16px 32px color-mix(in srgb, var(--gw-color-text-strong) 12%, transparent))",
        }
      : grantOnly
      ? // Runs the full height of the page so short pages don't show a gap; its links stay in view (sticky nav).
        { width: EXPANDED_WIDTH, alignSelf: "stretch", overflow: "visible" }
      : {
          width: isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
          transition: "width 0.3s ease",
          position: "sticky",
          top: 0,
          height: chromeOffset > 0 ? `calc(100vh - ${chromeOffset}px)` : "100vh",
          alignSelf: "flex-start",
          overflowY: "auto",
        }),
  };

  const iconButtonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: usesHeaderTabs() ? "var(--gw-color-text)" : "var(--gw-color-surface, #ffffff)",
    cursor: "pointer",
    opacity: 0.8,
    transition: "opacity 0.2s",
    padding: "4px",
    borderRadius: "var(--gw-radius-control, 4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (usesHeaderTabs() && !isDrawer && (!isDocked || !hasGrantItems)) return null;

  return (
    <>
      {isDrawer &&
        !isDrawerOpen &&
        fallbackChecked &&
        !chrome?.hasExternalMenuButton && (
          <button
            type="button"
            onClick={() => openDrawer?.()}
            aria-label="Open main menu"
            aria-expanded={false}
            aria-controls={SIDEBAR_ID}
            data-dark-bg="true"
            style={{
              position: "fixed",
              top: "8px",
              left: "8px",
              zIndex: "var(--gw-z-sticky, 200)",
              background: "var(--gw-color-nav-bg, #1a202c)",
              color: "var(--gw-color-surface, #ffffff)",
              border: "none",
              borderRadius: "var(--gw-radius-control, 4px)",
              padding: "8px",
              cursor: "pointer",
              display: "flex",
              boxShadow: "var(--gw-shadow-mid, 0 8px 16px color-mix(in srgb, var(--gw-color-text-strong) 12%, transparent))",
            }}
          >
            <LuMenu size={20} aria-hidden="true" />
          </button>
        )}

      {isDrawer && isDrawerOpen && (
        <div
          onClick={() => closeDrawer?.()}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "var(--gw-color-overlay)",
            zIndex: "var(--gw-z-drawer, 900)",
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={drawerRef}
        id={SIDEBAR_ID}
        data-dark-bg={usesHeaderTabs() ? undefined : "true"}
        className={usesHeaderTabs() ? "gw-sidenav" : undefined}
        hidden={drawerHidden}
        {...(isDrawer && isDrawerOpen
          ? { role: "dialog", "aria-modal": true, "aria-label": "Main menu" }
          : {})}
        style={panelStyle}
      >
        {!grantOnly && (
        <div
          style={{
            padding: "16px",
            flexShrink: 0,
            ...(showLabels
              ? {
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                }
              : {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }),
          }}
        >
          {showLabels && CHROME.Header && (
            <span aria-hidden="true" style={{ ...groupHeadingStyle, padding: 0, gridColumn: 1 }}>
              Menu
            </span>
          )}
          {showLabels && !CHROME.Header && (
            <a
              href="/home"
              aria-current={currentPath === "/home" ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigate("/home");
                closeDrawer?.();
              }}
              style={{
                gridColumn: 2,
                display: "inline-flex",
                alignItems: "center",
                minWidth: 0,
                textDecoration: "none",
              }}
            >
              <GovSeal />
              <BrandLogo
                // footer.wordmark is the light-on-dark variant; branding.logo is dark green
                // and disappears against the dark sidebar.
                src={usesHeaderTabs() ? branding.logo : branding.footer.wordmark ?? branding.logo}
                alt={branding.appName}
                style={{
                  display: "block",
                  height: "28px",
                  width: "auto",
                  aspectRatio: "auto 352 / 70",
                  maxWidth: "100%",
                  objectFit: "contain",
                }}
              />
            </a>
          )}
          {isDrawer ? (
            <button
              type="button"
              onClick={() => closeDrawer?.()}
              aria-label="Close main menu"
              aria-expanded
              aria-controls={SIDEBAR_ID}
              style={{ ...iconButtonStyle, gridColumn: 3, justifySelf: "end" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
            >
              <LuX size={20} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsExpanded((open) => !open)}
              aria-label={
                isExpanded ? "Collapse navigation" : "Expand navigation"
              }
              aria-expanded={isExpanded}
              aria-controls={SIDEBAR_ID}
              style={{ ...iconButtonStyle, gridColumn: 3, justifySelf: "end" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
            >
              {isExpanded ? (
                <LuChevronLeft size={20} aria-hidden="true" />
              ) : (
                <LuChevronRight size={20} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        )}

        <nav
          aria-label={grantOnly ? "This grant" : "Main"}
          style={grantOnly ? { position: "sticky", top: 0, padding: "16px 0" } : { flex: 1, padding: "16px 0", overflowY: "auto" }}
        >
          {!grantOnly && (<>
          <NavItem
            href="/home"
            onClick={go(() => navigate("/home"))}
            label="Home"
            icon={<LuHouse size={20} aria-hidden="true" />}
            active={isHome}
            expanded={showLabels}
          />

          <NavItem
            href={chatSessionsHref}
            onClick={go(() => navigate(chatSessionsHref))}
            label="My chats"
            icon={<LuMessagesSquare size={20} aria-hidden="true" />}
            active={isChatSessions}
            expanded={showLabels}
          />

          <NavItem
            href={draftsHref}
            onClick={go(() => navigate(draftsHref))}
            label="My applications"
            icon={<LuFileText size={20} aria-hidden="true" />}
            active={isDrafts}
            expanded={showLabels}
          />

          <NavItem
            href="/documents"
            onClick={go(() => navigate("/documents"))}
            label="My documents"
            icon={<LuFolderOpen size={20} aria-hidden="true" />}
            active={isDocuments}
            expanded={showLabels}
          />

          {isAdmin && (
            <NavItem
              href="/admin"
              onClick={go(() => navigate("/admin"))}
              label="Admin dashboard"
              icon={<LuLayoutDashboard size={20} aria-hidden="true" />}
              active={isDashboard}
              expanded={showLabels}
            />
          )}
          </>)}

          {docId && (
            <div
              role="group"
              aria-labelledby={showLabels ? `${groupId}-grant` : undefined}
              aria-label={showLabels ? undefined : "This grant"}
              style={{ marginTop: grantOnly ? 0 : "24px" }}
            >
              {showLabels && <GroupHeading id={`${groupId}-grant`}>This grant</GroupHeading>}

              <NavItem
                href={requirementsHref}
                onClick={go(handleRequirementsNavigation)}
                label="Requirements"
                icon={<LuSquareCheckBig size={20} aria-hidden="true" />}
                active={isRequirements}
                expanded={showLabels}
              />

              <NavItem
                href={`/chat/${linkChatId}${grantQuery}`}
                onClick={go(handleChatNavigation)}
                label="Chat with AI"
                icon={<LuMessageSquare size={20} aria-hidden="true" />}
                active={isChatActive}
                expanded={showLabels}
              />

              <NavItem
                href={editorHref}
                onClick={go(() => navigate(editorHref))}
                label="Write application"
                icon={<LuUpload size={20} aria-hidden="true" />}
                active={isDocumentEditor}
                expanded={showLabels}
              />
            </div>
          )}

          {isDocumentEditor &&
            hasStepNav &&
            currentStep &&
            currentStep !== "drafts" &&
            currentStep !== "welcome" && (
              <div
                role="group"
                aria-labelledby={showLabels ? `${groupId}-application` : undefined}
                aria-label={showLabels ? undefined : "Current application"}
                style={{ marginTop: "24px" }}
              >
                {showLabels && <GroupHeading id={`${groupId}-application`}>Current application</GroupHeading>}

                {STEP_ITEMS.filter((_, index) => index <= furthestStepIndex).map((item) => (
                  <NavItem
                    key={item.step}
                    onClick={go(() => goToStep?.(item.step))}
                    label={item.label}
                    icon={item.icon}
                    active={currentStep === item.step}
                    expanded={showLabels}
                    currentKind="step"
                  />
                ))}
              </div>
            )}
        </nav>

        {!grantOnly && (
        <div
          style={{
            padding: "16px 0 8px 0",
            borderTop: usesHeaderTabs() ? "1px solid var(--gw-color-border)" : "1px solid var(--gw-color-nav-bg-hover, #2d3748)",
            flexShrink: 0,
          }}
        >
          <NavItem
            onClick={go(() => setShowFeedback(true), false)}
            label="Help & feedback"
            icon={<LuCircleHelp size={20} aria-hidden="true" />}
            active={false}
            expanded={showLabels}
          />

          <NavItem
            href="/profile"
            onClick={go(() => navigate("/profile"))}
            label="Profile"
            icon={<LuUser size={20} aria-hidden="true" />}
            active={isProfile}
            expanded={showLabels}
          />

          <NavItem
            onClick={go(handleSignOut)}
            label="Sign out"
            icon={<LuLogOut size={20} aria-hidden="true" />}
            active={false}
            expanded={showLabels}
          />
        </div>
        )}
      </div>

      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
    </>
  );
};

const UnifiedNavigation: React.FC<NavigationRegistration> = ({
  documentIdentifier,
  currentStep,
  furthestStepIndex,
  onNavigate,
}) => {
  const chrome = useNavigationChrome();
  const register = chrome?.register;
  const unregister = chrome?.unregister;

  useEffect(() => {
    register?.({ documentIdentifier, currentStep, furthestStepIndex, onNavigate });
  }, [register, documentIdentifier, currentStep, furthestStepIndex, onNavigate]);

  useEffect(() => () => unregister?.(), [unregister]);

  return null;
};

export default UnifiedNavigation;

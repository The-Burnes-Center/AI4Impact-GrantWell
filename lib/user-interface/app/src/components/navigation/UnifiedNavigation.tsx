import React, { useEffect, useState } from "react";
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
} from "react-icons/lu";
import { signOut } from "aws-amplify/auth";
import { useBranding } from "../../common/branding";
import FeedbackModal from "../common/FeedbackModal";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import {
  NavigationRegistration,
  useNavigationChrome,
} from "./navigation-context";

export const SIDEBAR_ID = "gw-app-sidebar";

const EXPANDED_WIDTH = "240px";
const COLLAPSED_WIDTH = "60px";
const DRAWER_WIDTH = "280px";

const groupHeadingStyle: React.CSSProperties = {
  margin: 0,
  padding: "0 16px 8px 16px",
  fontSize: "var(--gw-font-size-sm, 14px)",
  fontWeight: 600,
  color: "var(--gw-color-nav-heading, #a0aec0)",
  textTransform: "uppercase",
  letterSpacing: "1px",
  fontFamily: "var(--gw-font-family, 'Noto Sans', sans-serif)",
};

const itemStyle = (active: boolean): React.CSSProperties => ({
  width: "100%",
  display: "flex",
  alignItems: "center",
  padding: "12px 16px",
  borderRadius: "var(--gw-radius-lg, 8px)",
  marginBottom: "8px",
  background: active ? "var(--gw-color-primary, #23776C)" : "none",
  color: active ? "var(--gw-color-white, #ffffff)" : "var(--gw-color-nav-text, #e2e8f0)",
  border: "none",
  fontSize: "var(--gw-font-size-base, 16px)",
  cursor: "pointer",
  transition: "background 0.2s, color 0.2s",
  textAlign: "left",
  fontFamily: "var(--gw-font-family, 'Noto Sans', sans-serif)",
});

const NavItem: React.FC<{
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  expanded: boolean;
  currentKind?: "page" | "step";
}> = ({ onClick, label, icon, active, expanded, currentKind = "page" }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={expanded ? undefined : label}
    aria-current={active ? currentKind : undefined}
    style={itemStyle(active)}
    onMouseEnter={(e) => {
      if (!active) e.currentTarget.style.background = "var(--gw-color-nav-bg-hover, #2d3748)";
    }}
    onMouseLeave={(e) => {
      if (!active) e.currentTarget.style.background = "none";
    }}
  >
    {icon}
    {expanded && <span style={{ marginLeft: "12px" }}>{label}</span>}
  </button>
);

const STEP_ITEMS: { step: string; label: string; icon: React.ReactNode }[] = [
  {
    step: "projectBasics",
    label: "Project Basics",
    icon: <LuPencilLine size={20} aria-hidden="true" />,
  },
  {
    step: "questionnaire",
    label: "Questionnaire",
    icon: <LuListChecks size={20} aria-hidden="true" />,
  },
  {
    step: "uploadDocuments",
    label: "Additional Information",
    icon: <LuFilePlus2 size={20} aria-hidden="true" />,
  },
  {
    step: "sectionEditor",
    label: "Section Editor",
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

  const isDocked = chrome?.isDocked ?? true;
  const isDrawerOpen = chrome?.isDrawerOpen ?? false;
  const closeDrawer = chrome?.closeDrawer;
  const openDrawer = chrome?.openDrawer;
  const currentStep = chrome?.currentStep;
  const hasStepNav = chrome?.hasStepNav ?? false;
  const furthestStepIndex =
    chrome?.furthestStepIndex ??
    STEP_ITEMS.findIndex((item) => item.step === currentStep);
  const goToStep = chrome?.goToStep;

  const drawerRef = useFocusTrap<HTMLDivElement>({
    isOpen: !isDocked && isDrawerOpen,
    onEscape: () => closeDrawer?.(),
  });

  useEffect(() => {
    const id = setTimeout(() => setFallbackChecked(true), 0);
    return () => clearTimeout(id);
  }, []);

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

  const docId =
    chrome?.documentIdentifier ||
    grantFromPath(currentPath) ||
    searchParams.get("folder") ||
    searchParams.get("nofo");

  const go = (action: () => void) => () => {
    action();
    closeDrawer?.();
  };

  const handleChatNavigation = () => {
    navigate(
      `/chat/${uuidv4()}${docId ? `?folder=${encodeURIComponent(docId)}` : ""}`
    );
  };

  const handleDraftsNavigation = () => {
    navigate(
      docId
        ? `/document-editor/drafts?nofo=${encodeURIComponent(docId)}`
        : "/document-editor/drafts"
    );
  };

  const handleRequirementsNavigation = () => {
    if (!docId) return;
    addToRecentlyViewed({ label: docId.replace("/", ""), value: docId });
    navigate(
      `/requirements/${encodeURIComponent(docId)}?folder=${encodeURIComponent(docId)}`
    );
  };

  const handleDocumentEditorNavigation = () => {
    navigate(
      docId ? `/document-editor?nofo=${encodeURIComponent(docId)}` : "/document-editor"
    );
  };

  const handleChatSessionsNavigation = () => {
    navigate(
      `/chat/sessions${docId ? `?folder=${encodeURIComponent(docId)}` : ""}`
    );
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

  const showLabels = isDocked ? isExpanded : true;
  const drawerHidden = !isDocked && !isDrawerOpen;

  const panelStyle: React.CSSProperties = {
    background: "var(--gw-color-nav-bg, #1a202c)",
    color: "var(--gw-color-white, #ffffff)",
    // The inline display would win over the `hidden` attribute's UA rule, so drop it explicitly.
    display: drawerHidden ? "none" : "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--gw-color-nav-border, #23272f)",
    overflow: "hidden",
    flexShrink: 0,
    ...(!isDocked
      ? {
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: DRAWER_WIDTH,
          maxWidth: "85vw",
          height: "100vh",
          zIndex: "calc(var(--gw-z-drawer, 900) + 1)",
          boxShadow: "var(--gw-shadow-xl, 0 10px 25px rgba(0, 0, 0, 0.2))",
        }
      : {
          width: isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
          transition: "width 0.3s ease",
          position: "sticky",
          top: 0,
          height: "100vh",
          alignSelf: "flex-start",
          overflowY: "auto",
        }),
  };

  const iconButtonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--gw-color-white, #ffffff)",
    cursor: "pointer",
    opacity: 0.8,
    transition: "opacity 0.2s",
    padding: "4px",
    borderRadius: "var(--gw-radius-sm, 4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <>
      {!isDocked &&
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
              color: "var(--gw-color-white, #ffffff)",
              border: "none",
              borderRadius: "var(--gw-radius-sm, 4px)",
              padding: "8px",
              cursor: "pointer",
              display: "flex",
              boxShadow: "var(--gw-shadow-lg, 0 4px 6px rgba(0, 0, 0, 0.1))",
            }}
          >
            <LuMenu size={20} aria-hidden="true" />
          </button>
        )}

      {!isDocked && isDrawerOpen && (
        <div
          onClick={() => closeDrawer?.()}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "var(--gw-color-overlay-sidebar, rgba(0, 0, 0, 0.5))",
            zIndex: "var(--gw-z-drawer, 900)",
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={drawerRef}
        id={SIDEBAR_ID}
        data-dark-bg="true"
        hidden={drawerHidden}
        {...(!isDocked && isDrawerOpen
          ? { role: "dialog", "aria-modal": true, "aria-label": "Main menu" }
          : {})}
        style={panelStyle}
      >
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
          {showLabels && (
            <a
              href="/home"
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
              <img
                // footer.wordmark is the light-on-dark variant; branding.logo is dark green
                // and disappears against the dark sidebar.
                src={branding.footer.wordmark ?? branding.logo}
                alt={branding.appName}
                style={{
                  display: "block",
                  height: "28px",
                  width: "auto",
                  maxWidth: "100%",
                  objectFit: "contain",
                }}
              />
            </a>
          )}
          {!isDocked ? (
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

        <nav
          aria-label="Main"
          style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}
        >
          <NavItem
            onClick={go(() => navigate("/home"))}
            label="Home"
            icon={<LuHouse size={20} aria-hidden="true" />}
            active={isHome}
            expanded={showLabels}
          />

          <NavItem
            onClick={go(handleChatSessionsNavigation)}
            label="My Chats"
            icon={<LuMessagesSquare size={20} aria-hidden="true" />}
            active={isChatSessions}
            expanded={showLabels}
          />

          <NavItem
            onClick={go(handleDraftsNavigation)}
            label="My Applications"
            icon={<LuFileText size={20} aria-hidden="true" />}
            active={isDrafts}
            expanded={showLabels}
          />

          {isAdmin && (
            <NavItem
              onClick={go(() => navigate("/admin"))}
              label="Admin Dashboard"
              icon={<LuLayoutDashboard size={20} aria-hidden="true" />}
              active={isDashboard}
              expanded={showLabels}
            />
          )}

          {docId && (
            <div style={{ marginTop: "24px" }}>
              {showLabels && <h2 style={groupHeadingStyle}>This Grant</h2>}

              <NavItem
                onClick={go(handleRequirementsNavigation)}
                label="Requirements"
                icon={<LuSquareCheckBig size={20} aria-hidden="true" />}
                active={isRequirements}
                expanded={showLabels}
              />

              <NavItem
                onClick={go(handleChatNavigation)}
                label="Chat with AI"
                icon={<LuMessageSquare size={20} aria-hidden="true" />}
                active={isChatActive}
                expanded={showLabels}
              />

              <NavItem
                onClick={go(handleDocumentEditorNavigation)}
                label="Write Application"
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
              <div style={{ marginTop: "24px" }}>
                {showLabels && (
                  <h2 style={groupHeadingStyle}>Current Application</h2>
                )}

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

        <div
          style={{
            padding: "16px 0 8px 0",
            borderTop: "1px solid var(--gw-color-nav-divider, #2d3748)",
            flexShrink: 0,
          }}
        >
          <NavItem
            onClick={go(() => setShowFeedback(true))}
            label="Help & feedback"
            icon={<LuCircleHelp size={20} aria-hidden="true" />}
            active={false}
            expanded={showLabels}
          />

          <NavItem
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

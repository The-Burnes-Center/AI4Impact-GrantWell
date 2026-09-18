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
} from "react-icons/lu";
import Modal from "../common/Modal";
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
  color: "#a0aec0",
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
  color: active ? "#ffffff" : "#e2e8f0",
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
      if (!active) e.currentTarget.style.background = "#2d3748";
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [showNofoRequiredModal, setShowNofoRequiredModal] = useState(false);
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

  const docId =
    chrome?.documentIdentifier ||
    grantFromPath(currentPath) ||
    searchParams.get("folder") ||
    searchParams.get("nofo");

  const handleNofoRequiredModalClose = () => {
    setShowNofoRequiredModal(false);
    navigate("/home?message=Please select a NOFO first to access this feature.");
  };

  const go = (action: () => void) => () => {
    action();
    closeDrawer?.();
  };

  const requireGrant = (action: () => void) => () => {
    if (!docId) {
      setShowNofoRequiredModal(true);
      return;
    }
    action();
  };

  const handleChatNavigation = requireGrant(() => {
    navigate(
      `/chat/${uuidv4()}${docId ? `?folder=${encodeURIComponent(docId)}` : ""}`
    );
  });

  const handleDraftsNavigation = () => {
    navigate(
      docId
        ? `/document-editor/drafts?nofo=${encodeURIComponent(docId)}`
        : "/document-editor/drafts"
    );
  };

  const handleRequirementsNavigation = requireGrant(() => {
    if (!docId) return;
    addToRecentlyViewed({ label: docId.replace("/", ""), value: docId });
    navigate(
      `/requirements/${encodeURIComponent(docId)}?folder=${encodeURIComponent(docId)}`
    );
  });

  const handleDocumentEditorNavigation = requireGrant(() => {
    navigate(
      docId ? `/document-editor?nofo=${encodeURIComponent(docId)}` : "/document-editor"
    );
  });

  const handleChatSessionsNavigation = () => {
    navigate(
      `/chat/sessions${docId ? `?folder=${encodeURIComponent(docId)}` : ""}`
    );
  };

  const showLabels = isDocked ? isExpanded : true;
  const drawerHidden = !isDocked && !isDrawerOpen;

  const panelStyle: React.CSSProperties = {
    background: "#1a202c",
    color: "#ffffff",
    // The inline display would win over the `hidden` attribute's UA rule, so drop it explicitly.
    display: drawerHidden ? "none" : "flex",
    flexDirection: "column",
    borderRight: "1px solid #23272f",
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
    color: "#ffffff",
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
      <Modal
        isOpen={showNofoRequiredModal}
        onClose={handleNofoRequiredModalClose}
        title="NOFO Selection Required"
        hideCloseButton={false}
      >
        <div style={{ padding: "10px 0" }}>
          <p
            style={{
              marginBottom: "20px",
              fontSize: "var(--gw-font-size-base, 16px)",
              color: "var(--gw-color-text, #333333)",
            }}
          >
            You need to select a Notice of Funding Opportunity (NOFO) before
            accessing this feature.
          </p>
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
          >
            <button
              type="button"
              onClick={handleNofoRequiredModalClose}
              style={{
                backgroundColor: "var(--gw-color-primary, #23776C)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--gw-radius-md, 6px)",
                padding: "10px 20px",
                fontSize: "var(--gw-font-size-sm, 14px)",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--gw-color-primary-hover, #195C53)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--gw-color-primary, #23776C)";
              }}
            >
              Go to Homepage
            </button>
          </div>
        </div>
      </Modal>

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
              background: "#1a202c",
              color: "#ffffff",
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
            backgroundColor: "rgba(0, 0, 0, 0.5)",
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
            borderBottom: "1px solid #2d3748",
            display: "flex",
            alignItems: "center",
            justifyContent: !isDocked || isExpanded ? "flex-end" : "center",
            flexShrink: 0,
          }}
        >
          {!isDocked ? (
            <button
              type="button"
              onClick={() => closeDrawer?.()}
              aria-label="Close main menu"
              aria-expanded
              aria-controls={SIDEBAR_ID}
              style={iconButtonStyle}
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
              style={iconButtonStyle}
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
            label="Chat Sessions"
            icon={<LuMessagesSquare size={20} aria-hidden="true" />}
            active={isChatSessions}
            expanded={showLabels}
          />

          <NavItem
            onClick={go(handleDraftsNavigation)}
            label="Applications"
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
      </div>
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

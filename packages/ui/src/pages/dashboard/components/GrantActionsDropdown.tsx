import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { LuMenu, LuPencil, LuTrash, LuArchive, LuCheck, LuFilePen, LuMessageSquarePlus, LuCopy, LuListChecks } from "react-icons/lu";
import type { NOFO } from "../../../common/types/nofo";

// Portalled to document.body: the table's scroll container would clip an absolutely positioned menu.
type MenuPosition = { right: number; top?: number; bottom?: number };

const MENU_GAP = 4;
const MENU_MIN_SPACE_BELOW = 150;

function menuPositionFor(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const right = Math.max(0, viewportWidth - rect.right);
  return viewportHeight - rect.bottom < MENU_MIN_SPACE_BELOW
    ? { right, bottom: Math.max(0, viewportHeight - rect.top + MENU_GAP) }
    : { right, top: rect.bottom + MENU_GAP };
}

interface GrantActionsDropdownProps {
  nofo: NOFO;
  onToggleStatus: () => void;
  onEdit: () => void;
  onEditSummary: () => void;
  onDelete: () => void;
  /** When true, every mutating action is out-of-scope for this admin and is hidden. */
  editDisabled?: boolean;
  /** State admin viewing a federal grant: offer state-scoped actions instead of edit/delete. */
  showStateActions?: boolean;
  onEditOverlay?: () => void;
  onPromoteToCopy?: () => void;
  /** Show "Custom questions" — an editable state NOFO the caller may edit. */
  showCustomQuestions?: boolean;
  onEditCustomQuestions?: () => void;
}

const GrantActionsDropdown = React.memo(function GrantActionsDropdown({
  nofo,
  onToggleStatus,
  onEdit,
  onEditSummary,
  onDelete,
  editDisabled = false,
  showStateActions = false,
  onEditOverlay,
  onPromoteToCopy,
  showCustomQuestions = false,
  onEditCustomQuestions,
}: GrantActionsDropdownProps) {
  // Out-of-scope actions are omitted rather than shown disabled, so the menu only
  // ever offers what the backend would actually accept.
  const showEditActions = !editDisabled;
  const hasAnyAction = showEditActions || showCustomQuestions || showStateActions;
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fixed position does not travel with the trigger; capture-phase scroll catches the table's scroller.
  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    const reposition = () => {
      if (buttonRef.current) setPosition(menuPositionFor(buttonRef.current));
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [isOpen]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    const trigger = buttonRef.current;
    if (trigger && document.body.contains(trigger)) {
      trigger.focus();
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = menuRef.current?.contains(target) ?? false;
      const insideMenu = popupRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) {
        closeMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, closeMenu]);

  const menuMounted = isOpen && position !== null;
  useEffect(() => {
    if (!menuMounted) return;
    const frame = requestAnimationFrame(() => {
      popupRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [menuMounted]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      popupRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Close and hand focus back to the trigger, so Tab moves on from the row, not the page end.
      if (e.shiftKey) e.preventDefault();
      closeMenu();
    }
  };

  const handleMenuBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && (popupRef.current?.contains(next) || menuRef.current?.contains(next))) return;
    setIsOpen(false);
  };

  if (!hasAnyAction) return null;

  return (
    <div className={`grant-actions-dropdown ${isOpen ? "dropdown-open" : ""}`} ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="gw-btn gw-btn--secondary gw-btn--icon gw-btn--slim actions-dropdown-button"
        aria-label={`More actions for ${nofo.name}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <LuMenu size={18} aria-hidden="true" />
      </button>
      {menuMounted && createPortal(
        <div
          ref={popupRef}
          className={`actions-dropdown-menu ${position.bottom !== undefined ? "drop-up" : ""}`}
          style={{
            right: position.right,
            top: position.top,
            bottom: position.bottom,
          }}
          role="menu"
          tabIndex={-1}
          aria-label={`Actions for ${nofo.name}`}
          onKeyDown={handleMenuKeyDown}
          onBlur={handleMenuBlur}
        >
          {showEditActions && (
            <>
              <button
                onClick={() => { onToggleStatus(); closeMenu(); }}
                className="dropdown-menu-item"
                role="menuitem"
                tabIndex={-1}
              >
                {nofo.status === "active" ? (
                  <><LuArchive size={16} className="menu-icon" aria-hidden="true" /><span>Archive</span></>
                ) : (
                  <><LuCheck size={16} className="menu-icon" aria-hidden="true" /><span>Mark active</span></>
                )}
              </button>
              <button
                onClick={() => { onEdit(); closeMenu(); }}
                className="dropdown-menu-item"
                role="menuitem"
                tabIndex={-1}
              >
                <LuPencil size={16} className="menu-icon" aria-hidden="true" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => { onEditSummary(); closeMenu(); }}
                className="dropdown-menu-item"
                role="menuitem"
                tabIndex={-1}
              >
                <LuFilePen size={16} className="menu-icon" aria-hidden="true" />
                <span>Edit requirements</span>
              </button>
              <button
                onClick={() => { onDelete(); closeMenu(); }}
                className="dropdown-menu-item delete-item"
                role="menuitem"
                tabIndex={-1}
              >
                <LuTrash size={16} className="menu-icon" aria-hidden="true" />
                <span>Delete</span>
              </button>
            </>
          )}
          {showCustomQuestions && (
            <button
              onClick={() => { onEditCustomQuestions?.(); closeMenu(); }}
              className="dropdown-menu-item"
              role="menuitem"
              tabIndex={-1}
              title="Add questions applicants answer in Write Application"
            >
              <LuListChecks size={16} className="menu-icon" aria-hidden="true" />
              <span>Custom questions</span>
            </button>
          )}
          {showStateActions && (
            <>
              <button
                onClick={() => { onEditOverlay?.(); closeMenu(); }}
                className="dropdown-menu-item"
                role="menuitem"
                tabIndex={-1}
                title="Add guidance shown only to your state's users"
              >
                <LuMessageSquarePlus size={16} className="menu-icon" aria-hidden="true" />
                <span>State guidance</span>
              </button>
              <button
                onClick={() => { onPromoteToCopy?.(); closeMenu(); }}
                className="dropdown-menu-item"
                role="menuitem"
                tabIndex={-1}
                title="Create your state's own editable copy of this federal grant"
              >
                <LuCopy size={16} className="menu-icon" aria-hidden="true" />
                <span>Create state copy</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
});

export default GrantActionsDropdown;

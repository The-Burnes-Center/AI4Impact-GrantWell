import React, { useState, useEffect, useRef } from "react";
import { LuMenu, LuPencil, LuTrash, LuArchive, LuCheck, LuFilePen, LuMessageSquarePlus, LuCopy, LuListChecks } from "react-icons/lu";
import type { NOFO } from "../../../common/types/nofo";

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
  const [dropUp, setDropUp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      setDropUp(spaceBelow < 150);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      requestAnimationFrame(() => {
        const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
        firstItem?.focus();
      });
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
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
    }
  };

  if (!hasAnyAction) return null;

  return (
    <div className={`grant-actions-dropdown ${isOpen ? "dropdown-open" : ""}`} ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="actions-dropdown-button"
        aria-label={`More actions for ${nofo.name}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <LuMenu size={18} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          className={`actions-dropdown-menu ${dropUp ? "drop-up" : ""}`}
          role="menu"
          aria-label={`Actions for ${nofo.name}`}
          onKeyDown={handleMenuKeyDown}
        >
          {showEditActions && (
            <>
              <button
                onClick={() => { onToggleStatus(); setIsOpen(false); }}
                className="dropdown-menu-item"
                role="menuitem"
              >
                {nofo.status === "active" ? (
                  <><LuArchive size={16} className="menu-icon" /><span>Archive</span></>
                ) : (
                  <><LuCheck size={16} className="menu-icon" /><span>Mark Active</span></>
                )}
              </button>
              <button
                onClick={() => { onEdit(); setIsOpen(false); }}
                className="dropdown-menu-item"
                role="menuitem"
              >
                <LuPencil size={16} className="menu-icon" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => { onEditSummary(); setIsOpen(false); }}
                className="dropdown-menu-item"
                role="menuitem"
              >
                <LuFilePen size={16} className="menu-icon" />
                <span>Edit Summary</span>
              </button>
              <button
                onClick={() => { onDelete(); setIsOpen(false); }}
                className="dropdown-menu-item delete-item"
                role="menuitem"
              >
                <LuTrash size={16} className="menu-icon" />
                <span>Delete</span>
              </button>
            </>
          )}
          {showCustomQuestions && (
            <button
              onClick={() => { onEditCustomQuestions?.(); setIsOpen(false); }}
              className="dropdown-menu-item"
              role="menuitem"
              title="Add questions applicants answer in the application writer"
            >
              <LuListChecks size={16} className="menu-icon" />
              <span>Custom questions</span>
            </button>
          )}
          {showStateActions && (
            <>
              <button
                onClick={() => { onEditOverlay?.(); setIsOpen(false); }}
                className="dropdown-menu-item"
                role="menuitem"
                title="Add guidance shown only to your state's users"
              >
                <LuMessageSquarePlus size={16} className="menu-icon" />
                <span>State guidance</span>
              </button>
              <button
                onClick={() => { onPromoteToCopy?.(); setIsOpen(false); }}
                className="dropdown-menu-item"
                role="menuitem"
                title="Create your state's own editable copy of this federal grant"
              >
                <LuCopy size={16} className="menu-icon" />
                <span>Promote to my state copy</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default GrantActionsDropdown;

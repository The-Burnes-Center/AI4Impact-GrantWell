import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuMenu } from "react-icons/lu";

export interface RowAction {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

// Portalled to document.body like GrantActionsDropdown: the table's scroll container would clip it.
type MenuPosition = { right: number; top?: number; bottom?: number };

const MENU_GAP = 4;
const MENU_MIN_SPACE_BELOW = 150;

function menuPositionFor(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const right = Math.max(0, document.documentElement.clientWidth - rect.right);
  const viewportHeight = document.documentElement.clientHeight;
  return viewportHeight - rect.bottom < MENU_MIN_SPACE_BELOW
    ? { right, bottom: Math.max(0, viewportHeight - rect.top + MENU_GAP) }
    : { right, top: rect.bottom + MENU_GAP };
}

export default function RowActionsMenu({
  label,
  actions,
  disabled = false,
}: {
  /** Names the row, e.g. "More actions for a@example.org". */
  label: string;
  actions: RowAction[];
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
    if (trigger && document.body.contains(trigger)) trigger.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !popupRef.current?.contains(target)) closeMenu();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
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
    const items = Array.from(popupRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") focus(current + 1);
    else if (e.key === "ArrowUp") focus(current - 1);
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(items.length - 1);
  };

  if (actions.length === 0) return null;

  return (
    <div className={`grant-actions-dropdown ${isOpen ? "dropdown-open" : ""}`} ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="actions-dropdown-button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        disabled={disabled}
      >
        <LuMenu size={18} aria-hidden="true" />
      </button>
      {menuMounted &&
        createPortal(
          <div
            ref={popupRef}
            className={`actions-dropdown-menu ${position.bottom !== undefined ? "drop-up" : ""}`}
            style={{ right: position.right, top: position.top, bottom: position.bottom }}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={handleMenuKeyDown}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  closeMenu();
                  action.onSelect();
                }}
                className={`dropdown-menu-item${action.danger ? " delete-item" : ""}`}
                role="menuitem"
              >
                <span className="menu-icon" aria-hidden="true">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

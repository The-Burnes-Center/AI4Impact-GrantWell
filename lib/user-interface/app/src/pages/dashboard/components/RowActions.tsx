import React, { useState, useEffect, useRef } from "react";
import { LuMenu, LuPencil, LuTrash } from "react-icons/lu";

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
}

const RowActions = React.memo(function RowActions({ onEdit, onDelete }: RowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  return (
    <div className="row-actions" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="actions-button"
        aria-label="Row actions menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <LuMenu size={20} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="actions-menu" role="menu" onKeyDown={handleMenuKeyDown}>
          <button
            onClick={() => { onEdit(); setIsOpen(false); }}
            className="menu-item"
            role="menuitem"
          >
            <LuPencil size={16} className="menu-icon" aria-hidden="true" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => { onDelete(); setIsOpen(false); }}
            className="menu-item"
            role="menuitem"
          >
            <LuTrash size={16} className="menu-icon" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
});

export default RowActions;

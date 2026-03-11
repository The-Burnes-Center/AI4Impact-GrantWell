import React, { useState, useEffect, useRef } from "react";
import { LuMenu, LuPencil, LuTrash, LuArchive, LuCheck } from "react-icons/lu";
import type { NOFO } from "../../../common/types/nofo";

interface GrantActionsDropdownProps {
  nofo: NOFO;
  onToggleStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const GrantActionsDropdown = React.memo(function GrantActionsDropdown({
  nofo,
  onToggleStatus,
  onEdit,
  onDelete,
}: GrantActionsDropdownProps) {
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

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

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
        <LuMenu size={18} />
      </button>
      {isOpen && (
        <div className={`actions-dropdown-menu ${dropUp ? "drop-up" : ""}`} role="menu">
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
            onClick={() => { onDelete(); setIsOpen(false); }}
            className="dropdown-menu-item delete-item"
            role="menuitem"
          >
            <LuTrash size={16} className="menu-icon" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
});

export default GrantActionsDropdown;

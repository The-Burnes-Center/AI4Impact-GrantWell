import React, { useState, useEffect, useRef } from "react";
import { LuMenu, LuPencil, LuTrash } from "react-icons/lu";

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
}

const RowActions = React.memo(function RowActions({ onEdit, onDelete }: RowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className="row-actions" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="actions-button"
        aria-label="Row actions menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <LuMenu size={20} />
      </button>
      {isOpen && (
        <div className="actions-menu" role="menu">
          <button
            onClick={() => { onEdit(); setIsOpen(false); }}
            className="menu-item"
            role="menuitem"
          >
            <LuPencil size={16} className="menu-icon" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => { onDelete(); setIsOpen(false); }}
            className="menu-item"
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

export default RowActions;

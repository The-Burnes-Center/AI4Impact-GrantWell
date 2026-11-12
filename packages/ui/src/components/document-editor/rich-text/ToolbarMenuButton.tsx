import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { LuCheck, LuChevronDown } from "react-icons/lu";

export type ToolbarMenuItem =
  | { kind: "radio" | "checkbox"; label: string; checked: boolean; onSelect: () => void }
  | { kind: "action"; label: string; onSelect: () => void; opensDialog?: boolean }
  | { kind: "separator" };

interface ToolbarMenuButtonProps {
  /** Visible button text. */
  children: React.ReactNode;
  items: ToolbarMenuItem[];
  disabled?: boolean;
  tabIndex: number;
  className?: string;
  /** Where focus goes after a choice; Escape always returns it to the button. */
  onChosen?: () => void;
}

type Selectable = Exclude<ToolbarMenuItem, { kind: "separator" }>;

/** WAI-ARIA APG menu button, for use as one item of a toolbar. */
const ToolbarMenuButton = forwardRef<HTMLButtonElement, ToolbarMenuButtonProps>(function ToolbarMenuButton(
  { children, items, disabled = false, tabIndex, className = "", onChosen },
  ref
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buttonId = useId();
  const menuId = useId();
  useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);

  const selectable = items.filter((item): item is Selectable => item.kind !== "separator");

  const openMenu = (index: number) => {
    if (disabled || selectable.length === 0) return;
    setActive((index + selectable.length) % selectable.length);
    setOpen(true);
  };

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  const choose = (index: number) => {
    const item = selectable[index];
    if (!item) return;
    const opensDialog = item.kind === "action" && !!item.opensDialog;
    close(!opensDialog && !onChosen);
    item.onSelect();
    if (!opensDialog) onChosen?.();
  };

  const onButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(-1);
    }
  };

  const onItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = selectable.length;
    const move = (index: number) => setActive((index + count) % count);
    switch (event.key) {
      case "ArrowDown":
        move(active + 1);
        break;
      case "ArrowUp":
        move(active - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(count - 1);
        break;
      case "Escape":
        close(true);
        break;
      case "Enter":
      case " ":
        choose(active);
        break;
      case "Tab":
        setOpen(false);
        return;
      case "ArrowLeft":
      case "ArrowRight":
        break;
      default: {
        const key = event.key.length === 1 ? event.key.toLowerCase() : "";
        if (!key) return;
        const order = selectable.map((_, i) => (active + 1 + i) % count);
        const match = order.find((i) => selectable[i].label.toLowerCase().startsWith(key));
        if (match === undefined) return;
        move(match);
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };

  let index = -1;
  return (
    <div className="se-rt-menu" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        className={`se-rt-btn se-rt-menu__button ${className}`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={tabIndex}
        data-rt-item=""
        onClick={() => (open ? close(true) : openMenu(0))}
        onKeyDown={onButtonKeyDown}
      >
        {children}
        <LuChevronDown size={16} aria-hidden="true" className="se-rt-menu__chevron" />
      </button>
      {open && (
        <div
          role="menu"
          id={menuId}
          aria-labelledby={buttonId}
          className="se-rt-menu__list"
          onBlur={(event) => {
            if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          {items.map((item, position) => {
            if (item.kind === "separator") {
              return <div key={`sep-${position}`} role="separator" className="se-rt-menu__separator" />;
            }
            index += 1;
            const i = index;
            const checkable = item.kind === "radio" || item.kind === "checkbox";
            return (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the role is a menuitem* chosen per item
              <div
                key={item.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role={item.kind === "radio" ? "menuitemradio" : item.kind === "checkbox" ? "menuitemcheckbox" : "menuitem"}
                aria-checked={checkable ? item.checked : undefined}
                aria-haspopup={item.kind === "action" && item.opensDialog ? "dialog" : undefined}
                tabIndex={-1}
                className="se-rt-menu__item"
                onClick={() => choose(i)}
                onKeyDown={onItemKeyDown}
                onMouseMove={() => i !== active && setActive(i)}
              >
                <span className="se-rt-menu__check" aria-hidden="true">
                  {checkable && item.checked ? <LuCheck size={16} /> : null}
                </span>
                {item.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default ToolbarMenuButton;

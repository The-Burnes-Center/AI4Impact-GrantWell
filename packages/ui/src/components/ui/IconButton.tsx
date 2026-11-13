import React, { useEffect, useState } from "react";

function focusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** The button's accessible name, shown as its tooltip too. */
  label: string;
  children: React.ReactNode;
  /** Which edge of the button the tooltip lines up with; "end" near the right edge of a box. */
  tipAlign?: "center" | "start" | "end";
}

/**
 * A borderless 44px icon button with a tooltip on hover and keyboard focus. The tooltip repeats the
 * name, so it is hidden from screen readers; Escape dismisses it and the pointer can move onto it.
 */
export default function IconButton({
  label,
  children,
  className,
  tipAlign = "center",
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shown = (hover || focus) && !dismissed;

  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown]);

  return (
    <span
      className={`gw-tip${tipAlign === "center" ? "" : ` gw-tip--${tipAlign}`}`}
      onPointerEnter={() => {
        setHover(true);
        setDismissed(false);
      }}
      onPointerLeave={() => setHover(false)}
    >
      <button
        type="button"
        {...rest}
        aria-label={label}
        className={`gw-icon-btn${className ? ` ${className}` : ""}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={(event) => {
          setFocus(focusVisible(event.currentTarget));
          setDismissed(false);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocus(false);
          onBlur?.(event);
        }}
      >
        {children}
      </button>
      {shown && (
        <span className="gw-tip__bubble" aria-hidden="true">
          {label}
        </span>
      )}
    </span>
  );
}

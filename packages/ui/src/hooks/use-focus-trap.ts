import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button",
  "[href]",
  "input",
  "select",
  "textarea",
  '[tabindex]:not([tabindex="-1"])',
]
  .map((s) => `${s}:not([disabled]):not([aria-hidden="true"]):not([inert])`)
  .join(", ");

const trapStack: { id: symbol; container: RefObject<HTMLElement | null> }[] = [];

const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled === true;

const tryFocus = (el: HTMLElement | null | undefined) => {
  if (!el || !el.isConnected || isDisabled(el)) return false;
  el.focus();
  return document.activeElement === el;
};

/**
 * Where focus goes when a trap closes, so it never falls back to <body>: nowhere if the page already
 * moved it outside the closing container; else `target`; else, when `target` was removed or disabled
 * meanwhile, into the dialog still open beneath this one, then the nearest original ancestor that can
 * take focus, then the page's main content.
 */
function restoreFocus(target: HTMLElement, ancestors: HTMLElement[], closing: HTMLElement | null) {
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && active.isConnected && !closing?.contains(active)) return;
  if (target !== document.body && tryFocus(target)) return;
  const outer = trapStack[trapStack.length - 1]?.container.current;
  if (outer?.isConnected && (tryFocus(outer.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)) || tryFocus(outer))) return;
  for (const el of ancestors) if (el.hasAttribute("tabindex") && tryFocus(el)) return;
  tryFocus(document.getElementById("main-content"));
}

function ancestorsOf(el: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    chain.push(node);
  }
  return chain;
}

interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  isOpen: boolean;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Whether to lock body scroll when open (default: true) */
  lockScroll?: boolean;
}

/**
 * Traps keyboard focus inside a container element (e.g., a modal).
 *
 * - Saves and restores the previously focused element
 * - Wraps Tab / Shift+Tab at the container boundaries
 * - Optionally closes on Escape
 * - Optionally locks body scroll
 *
 * @returns A ref to attach to the container element
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onEscape,
  lockScroll = true,
}: UseFocusTrapOptions) {
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const trapId = useRef<symbol>(Symbol("focus-trap"));

  useEffect(() => {
    if (!isOpen) return;
    const id = trapId.current;
    trapStack.push({ id, container: containerRef });
    return () => {
      const i = trapStack.findIndex((t) => t.id === id);
      if (i !== -1) trapStack.splice(i, 1);
    };
  }, [isOpen]);

  // Save previous focus & auto-focus first focusable element
  useEffect(() => {
    if (!isOpen) return;

    const previous = document.activeElement as HTMLElement | null;
    previousFocusRef.current = previous;
    const container = containerRef.current;
    const previousAncestors = previous && previous !== document.body ? ancestorsOf(previous) : [];

    const timer = setTimeout(() => {
      const firstFocusable =
        containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      firstFocusable?.focus();
    }, 100);

    if (lockScroll) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      clearTimeout(timer);
      if (lockScroll) {
        document.body.style.overflow = "";
      }
      if (previousFocusRef.current) {
        restoreFocus(previousFocusRef.current, previousAncestors, container);
      }
    };
  }, [isOpen, lockScroll]);

  // Keyboard handler — Tab wrapping + Escape
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (trapStack[trapStack.length - 1]?.id !== trapId.current) return;

      if (e.key === "Escape" && onEscape) {
        onEscape();
        return;
      }

      if (e.key !== "Tab") return;

      const focusableElements =
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      const activeElement = document.activeElement as HTMLElement;
      const isInsideContainer = containerRef.current?.contains(activeElement);

      if (!isInsideContainer) {
        e.preventDefault();
        firstElement.focus();
        return;
      }

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onEscape]);

  return containerRef;
}

export default useFocusTrap;

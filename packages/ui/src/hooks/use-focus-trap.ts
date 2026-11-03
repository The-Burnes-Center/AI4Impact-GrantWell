import { useEffect, useRef } from "react";

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

const trapStack: symbol[] = [];

const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled === true;

/**
 * Focus `target`, or when it was removed or disabled while the trap was open, the nearest of its
 * original ancestors that can still take focus, so focus never falls back to <body>.
 */
function restoreFocus(target: HTMLElement, ancestors: HTMLElement[]) {
  for (const el of [target, ...ancestors]) {
    if (!el.isConnected || isDisabled(el)) continue;
    if (el !== target && !el.hasAttribute("tabindex")) continue;
    el.focus();
    if (document.activeElement === el) return;
  }
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
    trapStack.push(id);
    return () => {
      const i = trapStack.lastIndexOf(id);
      if (i !== -1) trapStack.splice(i, 1);
    };
  }, [isOpen]);

  // Save previous focus & auto-focus first focusable element
  useEffect(() => {
    if (!isOpen) return;

    const previous = document.activeElement as HTMLElement | null;
    previousFocusRef.current = previous;
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
        restoreFocus(previousFocusRef.current, previousAncestors);
      }
    };
  }, [isOpen, lockScroll]);

  // Keyboard handler — Tab wrapping + Escape
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (trapStack[trapStack.length - 1] !== trapId.current) return;

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

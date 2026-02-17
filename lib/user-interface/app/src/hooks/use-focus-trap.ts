import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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

  // Save previous focus & auto-focus first focusable element
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

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
      if (
        previousFocusRef.current &&
        document.body.contains(previousFocusRef.current)
      ) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, lockScroll]);

  // Keyboard handler — Tab wrapping + Escape
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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

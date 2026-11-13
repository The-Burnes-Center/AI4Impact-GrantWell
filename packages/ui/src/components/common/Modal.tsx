import React, { useId } from "react";
import { LuX } from "react-icons/lu";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import "../../styles/dashboard.css";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  hideCloseButton?: boolean;
  /** "h1" when the dialog stands in for a page that has no h1 of its own while it is open. */
  titleLevel?: "h1" | "h2";
  /** Takes the initial focus instead of the first focusable element (the close button). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** id of the element that describes the dialog (aria-describedby). */
  describedBy?: string;
  closeLabel?: string;
  /** Actions pinned below the body: the header and footer stay in view and only the body scrolls. */
  footer?: React.ReactNode;
  /** "sheet": full width from the bottom edge, for phones. */
  variant?: "dialog" | "sheet";
}

/**
 * Reusable accessible Modal component with:
 * - Focus trap
 * - Focus restoration
 * - Escape key handling
 * - ARIA attributes
 * - Consistent styling matching Dashboard
 */
export const Modal = React.memo<ModalProps>(
  ({
    isOpen,
    onClose,
    title,
    children,
    maxWidth = "500px",
    hideCloseButton = false,
    titleLevel = "h2",
    initialFocusRef,
    describedBy,
    closeLabel = "Close modal",
    footer,
    variant = "dialog",
  }) => {
    const Title = titleLevel;
    const modalRef = useFocusTrap<HTMLDivElement>({ isOpen, onEscape: onClose, initialFocus: initialFocusRef });
    const titleId = useId();

    if (!isOpen) return null;

    return (
      <div
        className={`gw-modal__overlay modal-overlay${footer || variant === "sheet" ? " modal-overlay--pinned" : ""}${variant === "sheet" ? " modal-overlay--sheet" : ""}`}
        role="presentation"
        onClick={
          hideCloseButton
            ? undefined
            : (e) => {
                if (e.target === e.currentTarget) onClose();
              }
        }
      >
        <div
          ref={modalRef}
          className={`gw-modal modal-content${variant === "sheet" ? " modal-content--sheet" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={describedBy}
          style={{ maxWidth }}
        >
          <div className="gw-modal__header modal-header">
            <Title id={titleId} className="gw-modal__title">
              {title}
            </Title>
            {!hideCloseButton && (
              <button
                type="button"
                className="gw-btn gw-btn--icon modal-close-button"
                onClick={onClose}
                aria-label={closeLabel}
              >
                <LuX size={20} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="gw-modal__body modal-body">{children}</div>
          {footer && <div className="gw-modal__footer modal-footer">{footer}</div>}
        </div>
      </div>
    );
  }
);

// Set display name for React DevTools
Modal.displayName = "Modal";

export default Modal;

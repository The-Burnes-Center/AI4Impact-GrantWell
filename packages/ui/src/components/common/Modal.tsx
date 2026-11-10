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
  ({ isOpen, onClose, title, children, maxWidth = "500px", hideCloseButton = false }) => {
    const modalRef = useFocusTrap<HTMLDivElement>({ isOpen, onEscape: onClose });
    const titleId = useId();

    if (!isOpen) return null;

    return (
      <div
        className="gw-modal__overlay modal-overlay"
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
          className="gw-modal modal-content"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{ maxWidth }}
        >
          <div className="gw-modal__header modal-header">
            <h2 id={titleId} className="gw-modal__title">
              {title}
            </h2>
            {!hideCloseButton && (
              <button
                type="button"
                className="gw-btn gw-btn--icon modal-close-button"
                onClick={onClose}
                aria-label="Close modal"
              >
                <LuX size={20} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="gw-modal__body modal-body">{children}</div>
        </div>
      </div>
    );
  }
);

// Set display name for React DevTools
Modal.displayName = "Modal";

export default Modal;

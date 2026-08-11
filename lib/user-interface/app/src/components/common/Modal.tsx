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
  topOffset?: number;
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
  ({ isOpen, onClose, title, children, maxWidth = "500px", topOffset = 0, hideCloseButton = false }) => {
    const modalRef = useFocusTrap<HTMLDivElement>({ isOpen, onEscape: onClose });
    const titleId = useId();

    if (!isOpen) return null;

    return (
      <div
        className="modal-overlay"
        style={{
          position: "fixed",
          top: topOffset,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          backdropFilter: "blur(3px)",
          padding: "20px",
          boxSizing: "border-box",
        }}
        onClick={hideCloseButton ? undefined : onClose}
      >
        <div
          ref={modalRef}
          className="modal-content"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            width: "100%",
            maxWidth: maxWidth,
            maxHeight: "85vh",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="modal-header"
            style={{
              padding: "20px 25px",
              borderBottom: "1px solid #e0e0e0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "#f9fafc",
              borderTopLeftRadius: "12px",
              borderTopRightRadius: "12px",
              flexShrink: 0,
            }}
          >
            <h2
              id={titleId}
              style={{
                margin: 0,
                color: "#23776C",
                fontSize: "20px",
                fontWeight: 600,
              }}
            >
              {title}
            </h2>
            {!hideCloseButton && (
              <button
                className="modal-close-button"
                onClick={onClose}
                aria-label="Close modal"
              >
                <LuX size={20} />
              </button>
            )}
          </div>
          <div
            className="modal-body"
            style={{
              padding: "25px",
              overflowY: "auto",
              backgroundColor: "white",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);

// Set display name for React DevTools
Modal.displayName = "Modal";

export default Modal;

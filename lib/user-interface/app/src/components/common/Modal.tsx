import React, { useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";
import "../../pages/Dashboard/styles.css";

/**
 * Custom hook to handle modal side effects
 */
function useModalEffects(isOpen: boolean, onClose: () => void) {
  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
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
  ({ isOpen, onClose, title, children, maxWidth = "500px" }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Use the custom hook for side effects
    useModalEffects(isOpen, onClose);

    // Focus trap effect
    useEffect(() => {
      if (!isOpen) return;

      // Store the currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Focus the modal after a short delay
      setTimeout(() => {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 100);

      // Restore focus when modal closes
      return () => {
        // Only restore focus if the element still exists in the DOM
        if (
          previousFocusRef.current &&
          document.body.contains(previousFocusRef.current)
        ) {
          previousFocusRef.current.focus();
        }
      };
    }, [isOpen]);

    // Focus trap handler
    useEffect(() => {
      if (!isOpen || !modalRef.current) return;

      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;

        const focusableElements =
          modalRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );

        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Check if currently focused element is inside the modal
        const activeElement = document.activeElement as HTMLElement;
        const isInsideModal = modalRef.current?.contains(activeElement);

        // If focus is outside the modal, bring it back
        if (!isInsideModal) {
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

      document.addEventListener("keydown", handleTabKey);
      return () => document.removeEventListener("keydown", handleTabKey);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
      <div
        className="modal-overlay"
        style={{
          position: "fixed",
          top: 0,
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
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div
          ref={modalRef}
          className="modal-content"
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
          onKeyDown={(e) => e.stopPropagation()}
          role="document"
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
              id="modal-title"
              style={{
                margin: 0,
                color: "#14558F",
                fontSize: "20px",
                fontWeight: 600,
              }}
            >
              {title}
            </h2>
            <button
              className="modal-close-button"
              onClick={onClose}
              aria-label="Close modal"
            >
              <LuX size={20} />
            </button>
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

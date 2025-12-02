import React, { useEffect, useRef } from "react";

/**
 * Reusable accessible Modal component with:
 * - Focus trap
 * - Focus restoration
 * - Escape key handling
 * - ARIA attributes
 * 
 * Based on Dashboard Modal implementation
 */

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
  maxWidth?: string;
  topOffset?: number;
}

/**
 * Custom hook to handle modal side effects
 */
function useModalEffects(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
      
      // Add escape key listener
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      
      document.addEventListener("keydown", handleEscape);
      
      return () => {
        document.body.style.overflow = "";
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen, onClose]);
}

/**
 * Modal Component
 */
export const Modal = React.memo<ModalProps>(
  ({ isOpen, onClose, title, children, width, maxWidth = "600px", topOffset = 0 }) => {
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
        if (previousFocusRef.current && document.body.contains(previousFocusRef.current)) {
          previousFocusRef.current.focus();
        }
      };
    }, [isOpen]);

    // Focus trap handler
    useEffect(() => {
      if (!isOpen || !modalRef.current) return;

      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;

        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
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
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
          padding: "20px",
          paddingTop: `${topOffset + 20}px`,
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
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            width: width || "100%",
            maxWidth: maxWidth,
            maxHeight: `calc(90vh - ${topOffset}px)`,
            overflow: "auto",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
          onClick={(e) => e.stopPropagation()}
          role="document"
        >
          {/* Modal Header */}
          <div
            style={{
              padding: "20px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2
              id="modal-title"
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: "#6b7280",
                padding: "4px 8px",
                lineHeight: 1,
                borderRadius: "4px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f3f4f6";
                e.currentTarget.style.color = "#111827";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "#6b7280";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #2c4fdb";
                e.currentTarget.style.outlineOffset = "2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            >
              ×
            </button>
          </div>

          {/* Modal Content */}
          <div style={{ padding: "20px" }}>{children}</div>
        </div>
      </div>
    );
  }
);

// Set display name for React DevTools
Modal.displayName = "Modal";

export default Modal;


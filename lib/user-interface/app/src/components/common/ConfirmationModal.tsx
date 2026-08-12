import React from "react";
import { LuTriangle } from "react-icons/lu";
import { Modal } from "./Modal";
import "../../styles/dashboard.css";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  /** Extra emphasis rendered under the message, e.g. "This cannot be undone." */
  warning?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  confirming?: boolean;
}

/**
 * Reusable confirmation modal for in-app confirm prompts, replacing window.confirm
 * so dialogs stay styled, focus-trapped and free of the browser's hostname chrome.
 */
export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  warning,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  confirming = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="modal-form">
        <div className="delete-confirmation">
          {variant === "danger" && <LuTriangle size={32} className="warning-icon" />}
          <p>{message}</p>
        </div>
        {warning && <p className="warning-text">{warning}</p>}
        <div className="modal-actions">
          <button
            className="modal-button secondary"
            onClick={onClose}
            disabled={confirming}
            aria-label={cancelLabel}
          >
            {cancelLabel}
          </button>
          <button
            className={`modal-button ${variant}`}
            onClick={onConfirm}
            disabled={confirming}
            aria-label={confirmLabel}
          >
            {confirming ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;

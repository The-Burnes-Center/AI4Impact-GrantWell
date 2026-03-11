import React from "react";
import { LuTriangle } from "react-icons/lu";
import { Modal } from "./Modal";
import "../../styles/dashboard.css";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName?: string;
  itemCount?: number;
  itemLabel?: string; // e.g., "session", "draft", "grant"
}

/**
 * Reusable Delete Confirmation Modal component
 * Provides consistent delete confirmation UI across the application
 */
export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  itemCount,
  itemLabel = "item",
}) => {
  const isPlural = (itemCount ?? 0) > 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="modal-form">
        <div className="delete-confirmation">
          <LuTriangle size={32} className="warning-icon" />
          <p>
            Are you sure you want to delete{" "}
            {itemCount !== undefined ? (
              isPlural ? (
                <>
                  <strong>{itemCount} {itemLabel}s</strong>
                </>
              ) : (
                <>
                  {itemLabel} <strong>{itemName}</strong>
                </>
              )
            ) : itemName ? (
              <>
                <strong>{itemName}</strong>
              </>
            ) : (
              <strong>this {itemLabel}</strong>
            )}
            ?
          </p>
        </div>
        <p className="warning-text">This action cannot be undone.</p>
        <div className="modal-actions">
          <button
            className="modal-button secondary"
            onClick={onClose}
            aria-label="Cancel delete"
          >
            Cancel
          </button>
          <button
            className="modal-button danger"
            onClick={onConfirm}
            aria-label={`Confirm delete ${itemCount ?? 1} ${itemLabel}${isPlural ? "s" : ""}`}
          >
            Delete Permanently
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteConfirmationModal;

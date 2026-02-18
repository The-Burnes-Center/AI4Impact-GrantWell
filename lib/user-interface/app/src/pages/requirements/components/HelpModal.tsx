import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../../hooks/use-focus-trap";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal = React.memo(function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const modalRef = useFocusTrap({ isOpen, onEscape: handleClose, lockScroll: true });
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      const hasSeenHelp = localStorage.getItem("checklistsHelpSeen");
      setDontShowAgain(hasSeenHelp === "true");
    }
  }, [isOpen]);

  function handleClose() {
    if (dontShowAgain) {
      localStorage.setItem("checklistsHelpSeen", "true");
    } else {
      localStorage.removeItem("checklistsHelpSeen");
    }
    onClose();
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      className="help-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        aria-describedby="help-modal-description"
        className="help-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-modal__header">
          <h2 id="help-modal-title" className="help-modal__title">
            How to use this page
          </h2>
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            className="help-modal__close"
            aria-label="Close help dialog"
          >
            &times;
          </button>
        </div>

        <div id="help-modal-description" className="help-modal__body">
          <p className="help-modal__text">
            Grantwell uses generative AI to extract and summarize the key
            elements of the grant.
          </p>

          <div className="help-modal__highlight">
            <p style={{ margin: 0, lineHeight: "1.6", fontSize: "15px", color: "#333" }}>
              Click through the tabs above (
              <strong style={{ fontWeight: 600 }}>
                Eligibility, Required Documents, Narrative Sections, Key Deadlines
              </strong>
              ) to see what you need for this grant.
            </p>
          </div>

          {[
            { title: "Have a question?", text: 'Use "Chat with AI" in the left sidebar to get help understanding the grant requirements.' },
            { title: "Ready to start writing?", text: 'Click "Write Application" in the left sidebar to begin drafting.' },
            { title: "Want a different grant?", text: "Use Recent Grants to access other recently viewed grants, or select Home to return to the main page." },
          ].map((section) => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              <p className="help-modal__section-title">{section.title}</p>
              <p className="help-modal__section-text">{section.text}</p>
            </div>
          ))}

          <div className="help-modal__checkbox-container">
            <input
              type="checkbox"
              id="dont-show-again"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="help-modal__checkbox"
              aria-label="Do not show this again"
            />
            <label htmlFor="dont-show-again" className="help-modal__checkbox-label">
              Do not show this again
            </label>
          </div>

          <button onClick={handleClose} className="help-modal__confirm-btn" aria-label="Close help dialog">
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

export default HelpModal;

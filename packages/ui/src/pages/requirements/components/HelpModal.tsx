import React, { useState, useEffect, useId } from "react";
import { Modal } from "../../../components/common/Modal";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal = React.memo(function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const descriptionId = useId();

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="How to use this page"
      maxWidth="650px"
      describedBy={descriptionId}
      closeLabel="Close help dialog"
    >
      <p id={descriptionId} className="help-modal__text">
        GrantWell uses generative AI to extract and summarize the key
        elements of the grant.
      </p>

      <div className="help-modal__highlight">
        <p style={{ margin: 0, lineHeight: "1.6", fontSize: "15px", color: "var(--gw-color-text)" }}>
          Click through the tabs above (
          <strong style={{ fontWeight: 600 }}>
            Eligibility, Required documents, Narrative sections, Key deadlines
          </strong>
          ) to see what you need for this grant.
        </p>
      </div>

      {[
        { title: "Have a question?", text: 'Use "Chat with AI" in the left sidebar to get help understanding the grant requirements.' },
        { title: "Ready to start writing?", text: 'Click "Write application" in the left sidebar to begin drafting.' },
        { title: "Want a different grant?", text: 'Use "Recently viewed grants" on the Home page to return to a grant you viewed before, or choose a new grant from the list there.' },
      ].map((section) => (
        <div key={section.title} style={{ marginBottom: 20 }}>
          <h3 className="help-modal__section-title">{section.title}</h3>
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
        />
        <label htmlFor="dont-show-again" className="help-modal__checkbox-label">
          Do not show this again
        </label>
      </div>

      <div className="modal-actions">
        <button type="button" onClick={handleClose} className="gw-btn gw-btn--primary">
          Got it
        </button>
      </div>
    </Modal>
  );
});

export default HelpModal;

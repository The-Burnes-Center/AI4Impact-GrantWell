import React from "react";
import { Modal } from "../../../components/common/Modal";

const WELCOME_STEPS = [
  { num: 1, title: "Answer Simple Questions", text: "We'll guide you through key questions about your project to gather the essential information needed for your grant application." },
  { num: 2, title: "Provide Additional Information", text: "Share any additional context or information that will help our AI understand your project better and generate more accurate content." },
  { num: 3, title: "Review & Edit AI-Generated Content", text: "Our AI will generate high-quality content that you can review, refine, and perfect for your grant application. As you work, your progress will be saved." },
];

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGetStarted: () => void;
  onViewDrafts: () => void;
  topOffset?: number;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onGetStarted,
  onViewDrafts,
  topOffset,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Welcome to GrantWell"
    maxWidth="900px"
    topOffset={topOffset}
    hideCloseButton
  >
    <div className="welcome-modal-intro">
      <h3 className="welcome-modal-subtitle">AI-Powered Grant Writing Assistant</h3>
      <p className="welcome-modal-desc">
        GrantWell uses AI to help you create grant applications. We&#39;ll guide you through
        three simple steps to get started.
      </p>
    </div>

    <div className="welcome-modal-steps">
      {WELCOME_STEPS.map((step) => (
        <div key={step.num} className="welcome-modal-step">
          <div className="welcome-modal-step__number">{step.num}</div>
          <div>
            <h4 className="welcome-modal-step__title">{step.title}</h4>
            <p className="welcome-modal-step__text">{step.text}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="welcome-modal-actions">
      <button className="welcome-modal-btn welcome-modal-btn--primary" onClick={onGetStarted}>
        Get Started
      </button>
      <button className="welcome-modal-btn welcome-modal-btn--secondary" onClick={onViewDrafts}>
        View Existing Drafts
      </button>
    </div>
  </Modal>
);

export default WelcomeModal;

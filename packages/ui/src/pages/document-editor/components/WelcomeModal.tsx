import React from "react";
import { Modal } from "../../../components/common/Modal";

const WELCOME_STEPS = [
  { num: 1, title: "Project Basics", text: "Enter your project name, organization, requested amount, location, and contact details." },
  { num: 2, title: "Questionnaire", text: "Answer a few questions about your project, tailored to the grant you're applying for." },
  { num: 3, title: "Additional Information", text: "Upload supporting documents and share any extra context that will help the AI write a stronger first draft." },
  { num: 4, title: "Section Editor", text: "Review and refine each AI-generated section. You can rewrite sections or edit them directly." },
  { num: 5, title: "Review", text: "Check that every section is complete, then export your application as PDF or Word." },
];

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGetStarted: () => void;
  onViewDrafts: () => void;
}

const WelcomeModal = React.memo(function WelcomeModal({
  isOpen,
  onClose,
  onGetStarted,
  onViewDrafts,
}: WelcomeModalProps) {
  return (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Welcome to GrantWell"
    maxWidth="900px"
    hideCloseButton
  >
    <div className="welcome-modal-intro">
      <h3 className="welcome-modal-subtitle">Write Application</h3>
      <p className="welcome-modal-desc">
        GrantWell uses AI to help you write your grant application. We&#39;ll guide you through
        these five steps, and your progress is saved as you go.
      </p>
    </div>

    <ol className="welcome-modal-steps" style={{ listStyle: "none", padding: 0 }}>
      {WELCOME_STEPS.map((step) => (
        <li key={step.num} className="welcome-modal-step">
          <div className="welcome-modal-step__number" aria-hidden="true">{step.num}</div>
          <div>
            <h3 className="welcome-modal-step__title">{step.title}</h3>
            <p className="welcome-modal-step__text">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>

    <div className="welcome-modal-actions">
      <button className="welcome-modal-btn welcome-modal-btn--primary" onClick={onGetStarted}>
        Get Started
      </button>
      <button className="welcome-modal-btn welcome-modal-btn--secondary" onClick={onViewDrafts}>
        View My Applications
      </button>
    </div>
  </Modal>
  );
});

export default WelcomeModal;

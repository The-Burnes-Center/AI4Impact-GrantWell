import React from "react";
import { LuCheck, LuLoader } from "react-icons/lu";
import { Modal } from "../../../components/common/Modal";
import { PROCESSING_STAGES, stageIndex } from "./processing-stages";

interface ProcessingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The grant whose pipeline progress is shown. */
  nofoName: string;
  /** Current `processing_status` value from the metadata record. */
  status: string;
}

/**
 * Detailed pipeline view opened from the processing pill on a Grants row. Lists every
 * ingestion stage vertically — completed stages checked, the current stage spinning, later
 * stages muted — so an admin can see exactly where an upload is. Reads the same
 * PROCESSING_STAGES source of truth the inline indicator uses.
 */
const ProcessingDetailModal: React.FC<ProcessingDetailModalProps> = ({
  isOpen,
  onClose,
  nofoName,
  status,
}) => {
  const current = stageIndex(status);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Processing grant" maxWidth="440px">
      <div className="processing-detail">
        <p className="processing-detail__name">{nofoName}</p>
        <ol className="processing-detail__steps">
          {PROCESSING_STAGES.map((stage, i) => {
            const state =
              i < current ? "done" : i === current ? "current" : "upcoming";
            return (
              <li
                key={stage.key}
                className={`processing-detail__step processing-detail__step--${state}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="processing-detail__marker" aria-hidden="true">
                  {state === "done" && <LuCheck size={14} />}
                  {state === "current" && (
                    <LuLoader size={14} className="processing-detail__spin" />
                  )}
                </span>
                <span className="processing-detail__label">{stage.label}</span>
              </li>
            );
          })}
        </ol>
        <p className="processing-detail__hint">
          This grant isn&apos;t visible to users until processing finishes.
        </p>
      </div>
    </Modal>
  );
};

export default ProcessingDetailModal;

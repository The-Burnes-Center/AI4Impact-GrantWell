import React, { useContext, useEffect, useId, useState } from "react";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { useBranding } from "../../common/branding";
import Modal from "./Modal";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Found = "Yes" | "No";

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
  fontWeight: 600,
  color: "var(--gw-color-text, #333333)",
  fontSize: "var(--gw-font-size-base, 16px)",
};

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
}) => {
  const appContext = useContext(AppContext);
  const { appName, supportEmail } = useBranding();
  const textId = useId();

  const [found, setFound] = useState<Found | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFound(null);
    setText("");
    setSubmitting(false);
    setError(null);
    setSubmitted(false);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!found || !appContext) return;

    setSubmitting(true);
    setError(null);
    try {
      await new ApiClient(appContext).landingPage.submitFeedback(found, text.trim());
      setSubmitted(true);
    } catch {
      setError("We could not send your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Help & feedback"
      maxWidth="560px"
    >
      {submitted ? (
        <div>
          <p style={{ margin: "0 0 20px 0", color: "var(--gw-color-text, #333333)" }}>
            Thanks — your feedback has been sent to the {appName} team.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="gw-btn gw-btn--primary modal-button primary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <fieldset style={{ border: "none", margin: "0 0 20px 0", padding: 0 }}>
            <legend style={fieldLabelStyle}>
              Did you find what you were looking for?
            </legend>
            <div style={{ display: "flex", gap: "20px" }}>
              {(["Yes", "No"] as Found[]).map((option) => (
                <label
                  key={option}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    color: "var(--gw-color-text, #333333)",
                  }}
                >
                  <input
                    type="radio"
                    name="found-what-looking-for"
                    value={option}
                    checked={found === option}
                    onChange={() => setFound(option)}
                    required
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <div style={{ marginBottom: "20px" }}>
            <label htmlFor={textId} style={fieldLabelStyle}>
              Tell us more <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea className="gw-input"
              id={textId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={2000}
              style={{
                width: "100%",
                resize: "vertical",
              }}
            />
          </div>

          <p
            role="status"
            aria-live="polite"
            style={{ margin: "0 0 16px 0", color: "var(--gw-color-danger-text, #b42318)" }}
          >
            {error}
          </p>

          <div className="modal-actions">
            <button
              type="button"
              className="gw-btn gw-btn--secondary modal-button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="gw-btn gw-btn--primary modal-button primary"
              disabled={submitting || !found}
            >
              {submitting ? "Sending…" : "Send feedback"}
            </button>
          </div>

          {supportEmail && (
            <p style={{ margin: "20px 0 0 0", color: "var(--gw-color-text-secondary, #5a5a5a)" }}>
              Need help with something urgent? Email{" "}
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
};

export default FeedbackModal;

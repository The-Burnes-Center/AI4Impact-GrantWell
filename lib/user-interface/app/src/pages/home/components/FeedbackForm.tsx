import React, { useState, useRef, useEffect } from "react";
import { useApiClient } from "../../../hooks/use-api-client";

const MAX_CHARS = 500;

const FeedbackForm = React.memo(function FeedbackForm() {
  const [selectedOption, setSelectedOption] = useState<"yes" | "no" | null>(
    null
  );
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const apiClient = useApiClient();

  useEffect(() => {
    if (selectedOption && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selectedOption]);

  const handleOptionChange = (option: "yes" | "no") => {
    setSelectedOption(option);
    setFeedbackText("");
    setFeedbackError(null);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_CHARS) {
      setFeedbackText(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedOption) return;

    if (selectedOption === "no" && feedbackText.trim().length === 0) {
      setFeedbackError("Please tell us how we can improve the page.");
      return;
    }

    setIsSubmitting(true);
    setFeedbackError(null);

    try {
      await apiClient.landingPage.submitFeedback(
        selectedOption === "yes" ? "Yes" : "No",
        feedbackText
      );
      setFeedbackSubmitted(true);
    } catch {
      setFeedbackError(
        "There was a problem submitting your feedback. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const charsRemaining = MAX_CHARS - feedbackText.length;

  return (
    <div
      id="feedback-form"
      className="feedback-form-container ma__feedback-form"
      data-mass-feedback-form="true"
    >
      {feedbackSubmitted ? (
        <div role="alert" aria-live="polite" className="feedback-success">
          <p style={{ margin: 0 }}>
            Thank you for your feedback! Your response has been submitted
            successfully.
          </p>
        </div>
      ) : (
        <form
          noValidate
          style={{ margin: 0 }}
          onSubmit={handleSubmit}
        >
          <h2 className="feedback-heading">Help Us Improve GrantWell</h2>

          <div className="feedback-divider" />

          <fieldset className="feedback-fieldset">
            <legend className="feedback-legend">
              Did you find what you were looking for on this webpage?
            </legend>
            <div className="feedback-radio-group">
              <span className="feedback-radio">
                <input
                  id="feedback-found-yes"
                  name="found_what_looking_for"
                  type="radio"
                  value="Yes"
                  checked={selectedOption === "yes"}
                  onChange={() => handleOptionChange("yes")}
                />
                <label htmlFor="feedback-found-yes">Yes</label>
              </span>
              <span className="feedback-radio">
                <input
                  id="feedback-found-no"
                  name="found_what_looking_for"
                  type="radio"
                  value="No"
                  checked={selectedOption === "no"}
                  onChange={() => handleOptionChange("no")}
                />
                <label htmlFor="feedback-found-no">No</label>
              </span>
            </div>
          </fieldset>

          {selectedOption && (
            <div
              className="feedback-expanded"
              role="region"
              aria-live="polite"
            >
              <div className="feedback-divider" />

              {selectedOption === "yes" ? (
                <p className="feedback-prompt">
                  If you have any suggestions for the website, please let us
                  know.
                </p>
              ) : (
                <p className="feedback-prompt">
                  How can we improve the page?{" "}
                  <span className="feedback-required" aria-hidden="true">
                    *
                  </span>
                  <span className="visually-hidden">required</span>
                </p>
              )}

              <p className="feedback-notice">
                Please do not include personal or contact information.
              </p>

              <div className="feedback-no-response">
                <span className="feedback-no-response__text">
                  You will not get a response
                </span>
                <span className="feedback-info-wrapper">
                  <button
                    ref={infoButtonRef}
                    type="button"
                    className="feedback-info-button"
                    aria-expanded={showInfoTooltip}
                    aria-controls="feedback-info-tooltip"
                    onClick={() => setShowInfoTooltip((prev) => !prev)}
                  >
                    <span aria-hidden="true">&#9432;</span>
                    <span className="visually-hidden">
                      More information about responses
                    </span>
                  </button>
                  {showInfoTooltip && (
                    <div
                      id="feedback-info-tooltip"
                      className="feedback-info-tooltip"
                      role="status"
                    >
                      <p className="feedback-info-tooltip__text">
                        The feedback will only be used for improving the website.
                      </p>
                      <button
                        type="button"
                        className="feedback-info-tooltip__close"
                        aria-label="Close info"
                        onClick={() => {
                          setShowInfoTooltip(false);
                          infoButtonRef.current?.focus();
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  )}
                </span>
              </div>

              <div className="feedback-textarea-wrapper">
                <label htmlFor="feedback-text" className="visually-hidden">
                  {selectedOption === "yes"
                    ? "Suggestions for the website"
                    : "How can we improve the page"}
                </label>
                <textarea
                  ref={textareaRef}
                  id="feedback-text"
                  className="feedback-textarea"
                  maxLength={MAX_CHARS}
                  value={feedbackText}
                  onChange={handleTextChange}
                  rows={5}
                  aria-describedby="feedback-char-count"
                  aria-required={selectedOption === "no" ? "true" : "false"}
                />
                <span
                  id="feedback-char-count"
                  className="feedback-char-count"
                  aria-live="polite"
                >
                  {charsRemaining}/{MAX_CHARS}
                </span>
              </div>

              <p className="feedback-attribution">
                Your feedback helps improve GrantWell.
              </p>

              {feedbackError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="feedback-error-container"
                >
                  <p className="feedback-error">{feedbackError}</p>
                </div>
              )}

              <button
                type="submit"
                className="feedback-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Send Feedback"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
});

export default FeedbackForm;

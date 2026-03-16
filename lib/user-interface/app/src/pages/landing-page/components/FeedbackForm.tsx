import React, { useState, useRef, useEffect } from "react";

const MAX_CHARS = 500;
const MASS_GOV_FEEDBACK_URL = "https://forms.mass.gov/eoanf/form/62/";

interface GravityFormTokens {
  state: string;
  currency: string;
}

async function fetchGravityFormTokens(): Promise<GravityFormTokens | null> {
  try {
    const response = await fetch(MASS_GOV_FEEDBACK_URL, {
      credentials: "include",
    });
    if (!response.ok) return null;

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const stateInput = doc.querySelector<HTMLInputElement>(
      'input[name="state_62"]'
    );
    const currencyInput = doc.querySelector<HTMLInputElement>(
      'input[name="gform_currency"]'
    );

    if (!stateInput?.value) return null;

    return {
      state: stateInput.value,
      currency: currencyInput?.value ?? "",
    };
  } catch {
    return null;
  }
}

const FeedbackForm = React.memo(function FeedbackForm() {
  const [selectedOption, setSelectedOption] = useState<"yes" | "no" | null>(
    null
  );
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [formTokens, setFormTokens] = useState<GravityFormTokens | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedSectionRef = useRef<HTMLDivElement>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetchGravityFormTokens().then(setFormTokens);
  }, []);

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

    if (selectedOption === "no" && feedbackText.trim().length === 0) {
      setFeedbackError("Please tell us how we can improve the page.");
      return;
    }

    setIsSubmitting(true);
    setFeedbackError(null);

    let tokens = formTokens;
    if (!tokens) {
      tokens = await fetchGravityFormTokens();
      if (tokens) setFormTokens(tokens);
    }

    if (!tokens) {
      window.open(MASS_GOV_FEEDBACK_URL, "_blank", "noopener,noreferrer");
      setIsSubmitting(false);
      return;
    }

    const form = e.currentTarget;

    const stateField = form.querySelector<HTMLInputElement>(
      'input[name="state_62"]'
    );
    const currencyField = form.querySelector<HTMLInputElement>(
      'input[name="gform_currency"]'
    );
    if (stateField) stateField.value = tokens.state;
    if (currencyField) currencyField.value = tokens.currency;

    const iframe = document.createElement("iframe");
    iframe.name = `feedback_iframe_${Date.now()}`;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    form.target = iframe.name;

    iframe.onload = () => {
      setIsSubmitting(false);
      setFeedbackSubmitted(true);
      form.reset();
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    };

    setTimeout(() => {
      if (iframe.parentNode) {
        setIsSubmitting(false);
        setFeedbackSubmitted(true);
        form.reset();
        iframe.parentNode.removeChild(iframe);
      }
    }, 5000);

    form.submit();

    fetchGravityFormTokens().then(setFormTokens);
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
          id="gform_62"
          method="post"
          action={MASS_GOV_FEEDBACK_URL}
          encType="multipart/form-data"
          data-formid="62"
          style={{ margin: 0 }}
          onSubmit={handleSubmit}
        >
          {/* Gravity Forms required hidden fields */}
          <input type="hidden" name="is_submit_62" value="1" />
          <input type="hidden" name="gform_submit" value="62" />
          <input type="hidden" name="gform_unique_id" value="" />
          <input type="hidden" name="gform_target_page_number_62" value="0" />
          <input type="hidden" name="gform_source_page_number_62" value="1" />
          <input type="hidden" name="gform_field_values" value="" />
          <input
            type="hidden"
            name="state_62"
            value={formTokens?.state ?? ""}
          />
          <input
            type="hidden"
            name="gform_currency"
            value={formTokens?.currency ?? ""}
          />

          <h2 className="feedback-heading">Help Us Improve Mass.gov</h2>

          <div className="feedback-divider" />

          <fieldset className="feedback-fieldset">
            <legend className="feedback-legend">
              Did you find what you were looking for on this webpage?
            </legend>
            <div className="feedback-radio-group">
              <span className="feedback-radio">
                <input
                  id="choice_62_1_0"
                  name="input_1"
                  type="radio"
                  value="Yes"
                  checked={selectedOption === "yes"}
                  onChange={() => handleOptionChange("yes")}
                />
                <label htmlFor="choice_62_1_0">Yes</label>
              </span>
              <span className="feedback-radio">
                <input
                  id="choice_62_1_1"
                  name="input_1"
                  type="radio"
                  value="No"
                  checked={selectedOption === "no"}
                  onChange={() => handleOptionChange("no")}
                />
                <label htmlFor="choice_62_1_1">No</label>
              </span>
            </div>
          </fieldset>

          {selectedOption && (
            <div
              ref={expandedSectionRef}
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
                <label htmlFor="input_62_3" className="visually-hidden">
                  {selectedOption === "yes"
                    ? "Suggestions for the website"
                    : "How can we improve the page"}
                </label>
                <textarea
                  ref={textareaRef}
                  id="input_62_3"
                  name="input_3"
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
                Use the information on this page to Office of Federal Funds
                &amp; Infrastructure.
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

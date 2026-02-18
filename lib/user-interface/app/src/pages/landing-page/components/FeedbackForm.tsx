import React, { useState } from "react";

const FeedbackForm: React.FC = () => {
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackError(null);

    const form = e.currentTarget;

    const iframe = document.createElement("iframe");
    iframe.name = `formstack_iframe_${Date.now()}`;
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
  };

  return (
    <div
      id="feedback-form"
      className="feedback-form-container ma__feedback-form"
      data-mass-feedback-form="true"
    >
      <h2 className="visually-hidden">Feedback</h2>
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
          id="fsForm2521317"
          method="post"
          className="formForm"
          action="https://www.formstack.com/forms/index.php"
          encType="multipart/form-data"
          style={{ margin: 0 }}
          onSubmit={handleSubmit}
        >
          <input type="hidden" name="form" value="2521317" />
          <input type="hidden" name="jsonp" value="1" />
          <input type="hidden" name="viewkey" value="vx39GBYJhi" />
          <input type="hidden" name="_submit" value="1" />
          <input type="hidden" name="style_version" value="3" />
          <input type="hidden" id="viewparam" name="viewparam" value="524744" />
          <input
            type="hidden"
            id="field47056299"
            name="field47056299"
            size={50}
            className="ma__textarea fsField"
            value="https://mayflower.digital.mass.gov/react/iframe.html?id=forms-organisms-feedbackform--feedback-form-example&amp;viewMode=story"
          />
          <input type="hidden" id="field58154059" name="field58154059" />
          <input type="hidden" id="field57432673" name="field57432673" />

          <fieldset style={{ border: "none", padding: 0, margin: "0 0 20px 0" }}>
            <legend className="feedback-legend fsLabel requiredLabel fsLabelVertical">
              Did you find what you were looking for on this webpage?
              <span>
                {" "}
                *<span className="visually-hidden">required</span>
              </span>
            </legend>
            <div className="feedback-radio-group ma__input-group__items">
              <div className="ma__input-group__item" style={{ margin: 0 }}>
                <span className="feedback-radio ma__input-radio">
                  <input
                    className="fsField required"
                    id="field47054416_1"
                    name="field47054416"
                    type="radio"
                    value="Yes"
                    required
                  />
                  <label
                    className="fsOptionLabel ma__input-radio__label"
                    htmlFor="field47054416_1"
                  >
                    Yes
                  </label>
                </span>
              </div>
              <div className="ma__input-group__item" style={{ margin: 0 }}>
                <span className="feedback-radio ma__input-radio">
                  <input
                    className="fsField required"
                    id="field47054416_2"
                    name="field47054416"
                    type="radio"
                    value="No"
                    required
                  />
                  <label
                    className="fsOptionLabel ma__input-radio__label"
                    htmlFor="field47054416_2"
                  >
                    No
                  </label>
                </span>
              </div>
            </div>
          </fieldset>

          <fieldset
            className="ma_feedback-fieldset ma__mass-feedback-form__form--submit-wrapper"
            style={{ border: "none", padding: 0, margin: "20px 0 0 0" }}
          >
            {feedbackError && (
              <div role="alert" aria-live="assertive" style={{ marginBottom: 16 }}>
                <p className="feedback-error error">{feedbackError}</p>
              </div>
            )}
            <input
              id="submitButton2521317"
              className="feedback-submit submitButton ma__button ma__button--uppercase"
              type="submit"
              value={isSubmitting ? "Submitting..." : "Send Feedback"}
              disabled={isSubmitting}
            />
          </fieldset>
        </form>
      )}
    </div>
  );
};

export default FeedbackForm;

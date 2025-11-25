import React, { useState, useEffect } from "react";

interface ProjectBasicsProps {
  onContinue: () => void;
  selectedNofo: string | null;
  documentData?: any;
  onUpdateData?: (data: any) => void;
}

interface ProjectBasicsFormData {
  projectName: string;
  organizationName: string;
  requestedAmount: string;
  location: string;
  zipCode: string;
  contactName: string;
  contactEmail: string;
}

interface FormErrors {
  projectName?: string;
  organizationName?: string;
  requestedAmount?: string;
  location?: string;
  zipCode?: string;
  contactName?: string;
  contactEmail?: string;
}

const ProjectBasics: React.FC<ProjectBasicsProps> = ({
  onContinue,
  selectedNofo,
  documentData,
  onUpdateData
}) => {
  const [formData, setFormData] = useState<ProjectBasicsFormData>({
    projectName: "",
    organizationName: "",
    requestedAmount: "",
    location: "",
    zipCode: "",
    contactName: "",
    contactEmail: "",
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Load existing data if available
  useEffect(() => {
    if (documentData?.projectBasics) {
      setFormData(documentData.projectBasics);
    }
  }, [documentData]);

  // Validation functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateZipCode = (zip: string): boolean => {
    const zipRegex = /^\d{5}$/;
    return zipRegex.test(zip);
  };

  const validateAmount = (amount: string): boolean => {
    // Allow numbers with optional commas and decimal points
    const amountRegex = /^[\d,]+(\.\d{1,2})?$/;
    return amountRegex.test(amount.trim());
  };

  const validateField = (name: string, value: string): string | undefined => {
    // Check if field is empty
    if (!value.trim()) {
      return "This field is required";
    }

    // Field-specific validation
    switch (name) {
      case "projectName":
        if (value.trim().length < 3) {
          return "Project name must be at least 3 characters";
        }
        break;
      case "contactEmail":
        if (!validateEmail(value)) {
          return "Please enter a valid email address";
        }
        break;
      case "zipCode":
        if (!validateZipCode(value)) {
          return "Please enter a valid 5-digit ZIP code";
        }
        break;
      case "requestedAmount":
        if (!validateAmount(value)) {
          return "Please enter a valid amount (numbers only, e.g., 250000 or 250,000)";
        }
        break;
    }

    return undefined;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));

    const error = validateField(name, value);
    setFormErrors((prev) => ({
      ...prev,
      [name]: error,
    }));
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    let isValid = true;

    // Validate all fields
    Object.keys(formData).forEach((key) => {
      const error = validateField(key, formData[key as keyof ProjectBasicsFormData]);
      if (error) {
        errors[key as keyof FormErrors] = error;
        isValid = false;
      }
    });

    setFormErrors(errors);
    
    // Mark all fields as touched
    const allTouched: Record<string, boolean> = {};
    Object.keys(formData).forEach((key) => {
      allTouched[key] = true;
    });
    setTouched(allTouched);

    return isValid;
  };

  const handleContinue = () => {
    // Validate form before continuing
    if (!validateForm()) {
      // Focus on error summary first for screen readers
      const errorSummary = document.getElementById('error-summary');
      if (errorSummary) {
        errorSummary.focus();
      }
      return;
    }

    // Update parent component's data
    if (onUpdateData) {
      onUpdateData({
        projectBasics: formData
      });
    }
    
    // Save to localStorage for draft generation
    localStorage.setItem('projectBasics', JSON.stringify(formData));
    
    // Navigate to next step
    onContinue();
  };

  // Get count of errors for error summary
  const errorCount = Object.values(formErrors).filter(Boolean).length;
  const hasErrors = errorCount > 0 && Object.keys(touched).length > 0;

  return (
    <>
      <style>
        {`
          input:focus,
          textarea:focus,
          select:focus {
            outline: 2px solid #2c4fdb !important;
            outline-offset: 2px !important;
          }
          
          button:focus {
            outline: 2px solid #2c4fdb !important;
            outline-offset: 2px !important;
          }
          
          a:focus {
            outline: 2px solid #2c4fdb !important;
            outline-offset: 2px !important;
          }
        `}
      </style>
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "16px 0",
        }}
      >
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#2c4fdb",
            color: "white",
            padding: "20px 24px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600 }}>
            Project Basics
          </h1>
        </div>

        <div style={{ padding: "24px" }}>
          <div style={{ marginBottom: "24px", color: "#3d4451" }}>
            Let's start with some basic information about your project. These
            details will help us create your draft application.
          </div>

          {/* Required fields legend */}
          <div
            style={{
              marginBottom: "16px",
              fontSize: "14px",
              color: "#5a6575",
            }}
          >
            <span style={{ color: "#d32f2f" }} aria-hidden="true">*</span> Indicates required field
          </div>

          {/* Error Summary */}
          {hasErrors && (
            <div
              id="error-summary"
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              style={{
                marginBottom: "24px",
                padding: "16px",
                background: "#ffebee",
                border: "2px solid #d32f2f",
                borderRadius: "6px",
              }}
            >
              <h2
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#d32f2f",
                }}
              >
                There {errorCount === 1 ? 'is' : 'are'} {errorCount} error{errorCount !== 1 ? 's' : ''} in this form
              </h2>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "20px",
                  color: "#d32f2f",
                  fontSize: "14px",
                }}
              >
                {formErrors.projectName && touched.projectName && (
                  <li>
                    <a
                      href="#projectName"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('projectName')?.focus();
                      }}
                      style={{
                        color: "#d32f2f",
                        textDecoration: "underline",
                      }}
                    >
                      Project Name: {formErrors.projectName}
                    </a>
                  </li>
                )}
                {formErrors.organizationName && touched.organizationName && (
                  <li>
                    <a
                      href="#organizationName"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('organizationName')?.focus();
                      }}
                      style={{
                        color: "#d32f2f",
                        textDecoration: "underline",
                      }}
                    >
                      Organization Name: {formErrors.organizationName}
                    </a>
                  </li>
                )}
                {formErrors.requestedAmount && touched.requestedAmount && (
                  <li>
                    <a
                      href="#requestedAmount"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('requestedAmount')?.focus();
                      }}
                      style={{
                        color: "#d32f2f",
                        textDecoration: "underline",
                      }}
                    >
                      Requested Amount: {formErrors.requestedAmount}
                    </a>
                  </li>
                )}
                {formErrors.location && touched.location && (
                  <li>
                    <a
                      href="#location"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('location')?.focus();
                      }}
                      style={{
                        color: "#d32f2f",
                        textDecoration: "underline",
                      }}
                    >
                      Location: {formErrors.location}
                    </a>
                  </li>
                )}
                {formErrors.zipCode && touched.zipCode && (
                  <li>
                    <a
                      href="#zipCode"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('zipCode')?.focus();
                      }}
                      style={{
                        color: "#d32f2f",
                        textDecoration: "underline",
                      }}
                    >
                      Zip Code: {formErrors.zipCode}
                    </a>
                  </li>
                )}
                {formErrors.contactName && touched.contactName && (
                  <li>
                    <a
                      href="#contactName"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('contactName')?.focus();
                      }}
                      style={{
                        color: "#d32f2f",
                        textDecoration: "underline",
                      }}
                    >
                      Primary Contact Name: {formErrors.contactName}
                    </a>
                  </li>
                )}
                {formErrors.contactEmail && touched.contactEmail && (
                  <li>
                    <a
                      href="#contactEmail"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('contactEmail')?.focus();
                      }}
                      style={{
                        color: "#d32f2f",
                        textDecoration: "underline",
                      }}
                    >
                      Contact Email: {formErrors.contactEmail}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="projectName"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 500,
                color: "#2d3748",
              }}
            >
              Project Name <span style={{ color: "#d32f2f" }} aria-label="required">*</span>
            </label>
            <input
              type="text"
              id="projectName"
              name="projectName"
              value={formData.projectName}
              onChange={handleInputChange}
              onBlur={handleBlur}
              required
              aria-required="true"
              aria-invalid={formErrors.projectName ? "true" : "false"}
              aria-describedby={
                formErrors.projectName && touched.projectName
                  ? "projectName-help projectName-error"
                  : "projectName-help"
              }
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.projectName && touched.projectName ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              id="projectName-help"
              style={{
                display: "block",
                fontSize: "12px",
                color: "#5a6575",
                marginTop: "4px",
              }}
            >
              Keep it clear and descriptive. 5-10 words recommended.
            </span>
            {formErrors.projectName && touched.projectName && (
              <span
                id="projectName-error"
                role="alert"
                aria-live="polite"
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#d32f2f",
                  marginTop: "4px",
                  fontWeight: 500,
                }}
              >
                {formErrors.projectName}
              </span>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="organizationName"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 500,
                color: "#2d3748",
              }}
            >
              Organization Name <span style={{ color: "#d32f2f" }} aria-label="required">*</span>
            </label>
            <input
              type="text"
              id="organizationName"
              name="organizationName"
              value={formData.organizationName}
              onChange={handleInputChange}
              onBlur={handleBlur}
              required
              aria-required="true"
              aria-invalid={formErrors.organizationName ? "true" : "false"}
              aria-describedby={
                formErrors.organizationName && touched.organizationName
                  ? "organizationName-help organizationName-error"
                  : "organizationName-help"
              }
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.organizationName && touched.organizationName ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              id="organizationName-help"
              style={{
                display: "block",
                fontSize: "12px",
                color: "#5a6575",
                marginTop: "4px",
              }}
            >
              Enter the name of your municipality, tribal nation, or community organization.
            </span>
            {formErrors.organizationName && touched.organizationName && (
              <span
                id="organizationName-error"
                role="alert"
                aria-live="polite"
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#d32f2f",
                  marginTop: "4px",
                  fontWeight: 500,
                }}
              >
                {formErrors.organizationName}
              </span>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="requestedAmount"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 500,
                color: "#2d3748",
              }}
            >
              Requested Amount <span style={{ color: "#d32f2f" }} aria-label="required">*</span>
            </label>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#5a6575",
                  fontSize: "16px",
                  pointerEvents: "none",
                }}
              >
                $
              </span>
              <input
                type="text"
                id="requestedAmount"
                name="requestedAmount"
                value={formData.requestedAmount}
                onChange={handleInputChange}
                onBlur={handleBlur}
                required
                aria-required="true"
                aria-invalid={formErrors.requestedAmount ? "true" : "false"}
                aria-describedby={
                  formErrors.requestedAmount && touched.requestedAmount
                    ? "requestedAmount-help requestedAmount-error"
                    : "requestedAmount-help"
                }
                style={{
                  width: "100%",
                  padding: "12px 12px 12px 28px",
                  border: `1px solid ${formErrors.requestedAmount && touched.requestedAmount ? '#d32f2f' : '#e2e8f0'}`,
                  borderRadius: "6px",
                  fontSize: "16px",
                }}
                placeholder="250,000"
              />
            </div>
            <span
              id="requestedAmount-help"
              style={{
                display: "block",
                fontSize: "12px",
                color: "#5a6575",
                marginTop: "4px",
              }}
            >
              Enter the total funding amount you're requesting for this project.
            </span>
            {formErrors.requestedAmount && touched.requestedAmount && (
              <span
                id="requestedAmount-error"
                role="alert"
                aria-live="polite"
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#d32f2f",
                  marginTop: "4px",
                  fontWeight: 500,
                }}
              >
                {formErrors.requestedAmount}
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1", minWidth: "260px" }}>
              <label
                htmlFor="location"
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 500,
                  color: "#2d3748",
                }}
              >
                Location <span style={{ color: "#d32f2f" }} aria-label="required">*</span>
              </label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                onBlur={handleBlur}
                required
                aria-required="true"
                aria-invalid={formErrors.location ? "true" : "false"}
                aria-describedby={
                  formErrors.location && touched.location
                    ? "location-help location-error"
                    : "location-help"
                }
                style={{
                  width: "100%",
                  padding: "12px",
                  border: `1px solid ${formErrors.location && touched.location ? '#d32f2f' : '#e2e8f0'}`,
                  borderRadius: "6px",
                  fontSize: "16px",
                }}
                placeholder="Boston, MA"
              />
              <span
                id="location-help"
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#5a6575",
                  marginTop: "4px",
                }}
              >
                Enter the city and state where the project will take place.
              </span>
              {formErrors.location && touched.location && (
                <span
                  id="location-error"
                  role="alert"
                  aria-live="polite"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    color: "#d32f2f",
                    marginTop: "4px",
                    fontWeight: 500,
                  }}
                >
                  {formErrors.location}
                </span>
              )}
            </div>
            <div style={{ flex: "1", minWidth: "260px" }}>
              <label
                htmlFor="zipCode"
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 500,
                  color: "#2d3748",
                }}
              >
                Zip Code <span style={{ color: "#d32f2f" }} aria-label="required">*</span>
              </label>
              <input
                type="text"
                id="zipCode"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleInputChange}
                onBlur={handleBlur}
                required
                aria-required="true"
                aria-invalid={formErrors.zipCode ? "true" : "false"}
                aria-describedby={
                  formErrors.zipCode && touched.zipCode
                    ? "zipCode-help zipCode-error"
                    : "zipCode-help"
                }
                maxLength={5}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: `1px solid ${formErrors.zipCode && touched.zipCode ? '#d32f2f' : '#e2e8f0'}`,
                  borderRadius: "6px",
                  fontSize: "16px",
                }}
                placeholder="02119"
              />
              <span
                id="zipCode-help"
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#5a6575",
                  marginTop: "4px",
                }}
              >
                Enter the 5-digit ZIP code for the project location.
              </span>
              {formErrors.zipCode && touched.zipCode && (
                <span
                  id="zipCode-error"
                  role="alert"
                  aria-live="polite"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    color: "#d32f2f",
                    marginTop: "4px",
                    fontWeight: 500,
                  }}
                >
                  {formErrors.zipCode}
                </span>
              )}
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="contactName"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 500,
                color: "#2d3748",
              }}
            >
              Primary Contact Name <span style={{ color: "#d32f2f" }} aria-label="required">*</span>
            </label>
            <input
              type="text"
              id="contactName"
              name="contactName"
              value={formData.contactName}
              onChange={handleInputChange}
              onBlur={handleBlur}
              required
              aria-required="true"
              aria-invalid={formErrors.contactName ? "true" : "false"}
              aria-describedby={
                formErrors.contactName && touched.contactName
                  ? "contactName-help contactName-error"
                  : "contactName-help"
              }
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.contactName && touched.contactName ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              id="contactName-help"
              style={{
                display: "block",
                fontSize: "12px",
                color: "#5a6575",
                marginTop: "4px",
              }}
            >
              Enter the name of the primary person responsible for this grant application.
            </span>
            {formErrors.contactName && touched.contactName && (
              <span
                id="contactName-error"
                role="alert"
                aria-live="polite"
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#d32f2f",
                  marginTop: "4px",
                  fontWeight: 500,
                }}
              >
                {formErrors.contactName}
              </span>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="contactEmail"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 500,
                color: "#2d3748",
              }}
            >
              Contact Email <span style={{ color: "#d32f2f" }} aria-label="required">*</span>
            </label>
            <input
              type="email"
              id="contactEmail"
              name="contactEmail"
              value={formData.contactEmail}
              onChange={handleInputChange}
              onBlur={handleBlur}
              required
              aria-required="true"
              aria-invalid={formErrors.contactEmail ? "true" : "false"}
              aria-describedby={
                formErrors.contactEmail && touched.contactEmail
                  ? "contactEmail-help contactEmail-error"
                  : "contactEmail-help"
              }
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.contactEmail && touched.contactEmail ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
              }}
              placeholder="name@example.com"
            />
            <span
              id="contactEmail-help"
              style={{
                display: "block",
                fontSize: "12px",
                color: "#5a6575",
                marginTop: "4px",
              }}
            >
              Enter a valid email address for project-related communications.
            </span>
            {formErrors.contactEmail && touched.contactEmail && (
              <span
                id="contactEmail-error"
                role="alert"
                aria-live="polite"
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#d32f2f",
                  marginTop: "4px",
                  fontWeight: 500,
                }}
              >
                {formErrors.contactEmail}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div></div>
          <button
            type="button"
            onClick={handleContinue}
            style={{
              padding: "12px 24px",
              background: "#2c4fdb",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            Continue
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginLeft: "8px" }}
              aria-hidden="true"
              focusable="false"
            >
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default ProjectBasics;

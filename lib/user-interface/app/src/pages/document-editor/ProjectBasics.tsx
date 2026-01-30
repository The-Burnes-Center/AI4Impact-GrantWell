import React, { useState, useEffect, useRef, useCallback } from "react";

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
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialLoad = useRef(true);
  const hasLoadedFromDocumentData = useRef(false);

  // Auto-save debounce ref
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save function (debounced)
  const autoSave = useCallback((data: ProjectBasicsFormData) => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Show saving indicator immediately when user stops typing
    setSaveStatus('saving');
    setIsSaving(true);

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Save to localStorage immediately
        localStorage.setItem('projectBasics', JSON.stringify(data));
        
        // Update parent component (which saves to database)
        if (onUpdateData) {
          try {
            await onUpdateData({
              projectBasics: data
            });
          } catch (error) {
            // If database save fails, localStorage is still updated
            console.error('Database save failed, but localStorage updated:', error);
          }
        }
        
        // Show saved status
        setSaveStatus('saved');
        setIsSaving(false);
        
        // Clear saved status after 2 seconds
        if (saveStatusTimeoutRef.current) {
          clearTimeout(saveStatusTimeoutRef.current);
        }
        saveStatusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setIsSaving(false);
        setSaveStatus('idle');
      }
    }, 1000); // Wait 1 second after user stops typing
  }, [onUpdateData]);

  // Load existing data when documentData becomes available
  useEffect(() => {
    // Load from documentData if available and we haven't loaded it yet
    if (documentData?.projectBasics && !hasLoadedFromDocumentData.current) {
      setFormData({
        projectName: documentData.projectBasics.projectName || "",
        organizationName: documentData.projectBasics.organizationName || "",
        requestedAmount: documentData.projectBasics.requestedAmount || "",
        location: documentData.projectBasics.location || "",
        zipCode: documentData.projectBasics.zipCode || "",
        contactName: documentData.projectBasics.contactName || "",
        contactEmail: documentData.projectBasics.contactEmail || "",
      });
      hasLoadedFromDocumentData.current = true;
      isInitialLoad.current = false;
    } 
    // Fallback to localStorage only if documentData is not available and we haven't loaded yet
    else if (isInitialLoad.current && !documentData?.projectBasics && !hasLoadedFromDocumentData.current) {
      try {
        const savedData = localStorage.getItem('projectBasics');
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          // Check if localStorage has actual data (not just empty strings)
          const hasData = parsedData.projectName || parsedData.organizationName || 
                         parsedData.requestedAmount || parsedData.location || 
                         parsedData.zipCode || parsedData.contactName || 
                         parsedData.contactEmail;
          
          if (hasData) {
            setFormData({
              projectName: parsedData.projectName || "",
              organizationName: parsedData.organizationName || "",
              requestedAmount: parsedData.requestedAmount || "",
              location: parsedData.location || "",
              zipCode: parsedData.zipCode || "",
              contactName: parsedData.contactName || "",
              contactEmail: parsedData.contactEmail || "",
            });
            // Also update parent component with localStorage data
            if (onUpdateData) {
              onUpdateData({
                projectBasics: parsedData
              });
            }
          }
        }
        isInitialLoad.current = false;
      } catch (error) {
        console.error('Error loading from localStorage:', error);
        isInitialLoad.current = false;
      }
    }
  }, [documentData, onUpdateData]); // Watch documentData - removed formData to prevent unnecessary re-runs

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
    };
  }, []);

  // Validation functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const validateZipCode = (zip: string): boolean => {
    const zipRegex = /^\d{5}$/;
    return zipRegex.test(zip.trim());
  };

  const validateAmount = (amount: string): { isValid: boolean; error?: string } => {
    const trimmed = amount.trim();
    
    // Remove commas for validation
    const numericValue = trimmed.replace(/,/g, '');
    
    // Check if it's a valid number
    if (!/^\d+(\.\d{1,2})?$/.test(numericValue)) {
      return { isValid: false, error: "Please enter a valid amount (numbers only, e.g., 250000 or 250,000)" };
    }
    
    // Check minimum amount (e.g., $1)
    const numValue = parseFloat(numericValue);
    if (numValue < 1) {
      return { isValid: false, error: "Amount must be at least $1" };
    }
    
    // Check maximum amount (e.g., $1 billion)
    if (numValue > 1000000000) {
      return { isValid: false, error: "Amount cannot exceed $1,000,000,000" };
    }
    
    return { isValid: true };
  };

  const validateProjectName = (name: string): string | undefined => {
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      return "Project name must be at least 3 characters";
    }
    if (trimmed.length > 200) {
      return "Project name cannot exceed 200 characters";
    }
    // Check for only whitespace
    if (!trimmed.replace(/\s+/g, '').length) {
      return "Project name cannot be only spaces";
    }
    return undefined;
  };

  const validateOrganizationName = (name: string): string | undefined => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return "Organization name must be at least 2 characters";
    }
    if (trimmed.length > 200) {
      return "Organization name cannot exceed 200 characters";
    }
    if (!trimmed.replace(/\s+/g, '').length) {
      return "Organization name cannot be only spaces";
    }
    return undefined;
  };

  const validateLocation = (location: string): string | undefined => {
    const trimmed = location.trim();
    if (trimmed.length < 2) {
      return "Location must be at least 2 characters";
    }
    if (trimmed.length > 100) {
      return "Location cannot exceed 100 characters";
    }
    // Basic format check: should contain city and state (e.g., "Boston, MA")
    if (!trimmed.includes(',') && trimmed.length > 0) {
      // Not required, but suggest format
      // We'll allow it but could add a warning
    }
    return undefined;
  };

  const validateContactName = (name: string): string | undefined => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return "Contact name must be at least 2 characters";
    }
    if (trimmed.length > 100) {
      return "Contact name cannot exceed 100 characters";
    }
    // Check if it looks like a valid name (at least one space or is a reasonable single name)
    if (!trimmed.replace(/\s+/g, '').length) {
      return "Contact name cannot be only spaces";
    }
    // Check for valid name characters (letters, spaces, hyphens, apostrophes)
    if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
      return "Contact name can only contain letters, spaces, hyphens, and apostrophes";
    }
    return undefined;
  };

  const validateField = (name: string, value: string): string | undefined => {
    // Check if field is empty
    if (!value.trim()) {
      return "This field is required";
    }

    // Field-specific validation
    switch (name) {
      case "projectName":
        return validateProjectName(value);
      
      case "organizationName":
        return validateOrganizationName(value);
      
      case "contactEmail":
        if (!validateEmail(value)) {
          return "Please enter a valid email address (e.g., name@example.com)";
        }
        // Additional email checks
        if (value.length > 254) {
          return "Email address is too long (maximum 254 characters)";
        }
        break;
      
      case "zipCode":
        if (!validateZipCode(value)) {
          return "Please enter a valid 5-digit ZIP code";
        }
        break;
      
      case "requestedAmount":
        const amountValidation = validateAmount(value);
        if (!amountValidation.isValid) {
          return amountValidation.error;
        }
        break;
      
      case "location":
        return validateLocation(value);
      
      case "contactName":
        return validateContactName(value);
    }

    return undefined;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Format input based on field type
    let formattedValue = value;
    
    // Format ZIP code: only allow digits, max 5
    if (name === "zipCode") {
      formattedValue = value.replace(/\D/g, '').slice(0, 5);
    }
    
    // Format amount: allow digits, commas, and one decimal point
    if (name === "requestedAmount") {
      // Remove all non-digit and non-comma characters except one decimal point
      formattedValue = value.replace(/[^\d,.]/g, '');
      // Ensure only one decimal point
      const parts = formattedValue.split('.');
      if (parts.length > 2) {
        formattedValue = parts[0] + '.' + parts.slice(1).join('');
      }
      // Limit decimal places to 2
      if (parts.length === 2 && parts[1].length > 2) {
        formattedValue = parts[0] + '.' + parts[1].slice(0, 2);
      }
    }
    
    const updatedData = {
      ...formData,
      [name]: formattedValue,
    };
    
    setFormData(updatedData);

    // Auto-save after user stops typing (debounced) - but not on initial load
    if (!isInitialLoad.current) {
      autoSave(updatedData);
    }

    // Real-time validation if field has been touched
    if (touched[name]) {
      const error = validateField(name, formattedValue);
      setFormErrors((prev) => ({
        ...prev,
        [name]: error,
      }));
    } else {
      // Clear error when user starts typing (optimistic clearing)
      if (formErrors[name as keyof FormErrors]) {
        setFormErrors((prev) => ({
          ...prev,
          [name]: undefined,
        }));
      }
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
            outline: 2px solid #0088FF !important;
            outline-offset: 2px !important;
          }
          
          button:focus {
            outline: 2px solid #0088FF !important;
            outline-offset: 2px !important;
          }
          
          a:focus {
            outline: 2px solid #0088FF !important;
            outline-offset: 2px !important;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .auto-save-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: #ffffff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
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
            background: "#14558F",
            color: "white",
            padding: "20px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600, fontFamily: "'Noto Sans', sans-serif" }}>
            Project Basics
          </h1>
          {saveStatus !== 'idle' && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
                fontFamily: "'Noto Sans', sans-serif",
                fontWeight: 500,
              }}
              role="status"
              aria-live="polite"
              aria-label={saveStatus === 'saving' ? 'Saving changes' : 'Changes saved'}
            >
              {saveStatus === 'saving' && (
                <>
                  <div className="auto-save-spinner" aria-hidden="true"></div>
                  <span>Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Saved
                </span>
              )}
            </div>
          )}
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
              maxLength={200}
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.projectName && touched.projectName ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            />
            <span
              id="projectName-help"
              style={{
                display: "block",
                fontSize: "14px",
                color: "#5a6575",
                marginTop: "4px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            >
              Keep it clear and descriptive. ({(formData.projectName || '').length}/200 characters)
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
                  fontFamily: "'Noto Sans', sans-serif",
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
              maxLength={200}
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.organizationName && touched.organizationName ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            />
            <span
              id="organizationName-help"
              style={{
                display: "block",
                fontSize: "14px",
                color: "#5a6575",
                marginTop: "4px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            >
              Enter the name of your municipality, tribal nation, or community organization. ({formData.organizationName.length}/200 characters)
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
                  fontFamily: "'Noto Sans', sans-serif",
                }}
                placeholder="250,000"
                inputMode="decimal"
              />
            </div>
            <span
              id="requestedAmount-help"
              style={{
                display: "block",
                fontSize: "14px",
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
                maxLength={100}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: `1px solid ${formErrors.location && touched.location ? '#d32f2f' : '#e2e8f0'}`,
                  borderRadius: "6px",
                  fontSize: "16px",
                  fontFamily: "'Noto Sans', sans-serif",
                }}
                placeholder="Boston, MA"
              />
              <span
                id="location-help"
                style={{
                  display: "block",
                  fontSize: "14px",
                  color: "#5a6575",
                  marginTop: "4px",
                  fontFamily: "'Noto Sans', sans-serif",
                }}
              >
                Enter the city and state where the project will take place (e.g., "Boston, MA"). ({(formData.location || '').length}/30 characters)
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
                pattern="[0-9]{5}"
                inputMode="numeric"
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
                  fontSize: "14px",
                  color: "#5a6575",
                  marginTop: "4px",
                  fontFamily: "'Noto Sans', sans-serif",
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
              maxLength={100}
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.contactName && touched.contactName ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            />
            <span
              id="contactName-help"
              style={{
                display: "block",
                fontSize: "14px",
                color: "#5a6575",
                marginTop: "4px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            >
              Enter the name of the primary person responsible for this grant application. ({(formData.contactName || '').length}/100 characters)
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
              maxLength={254}
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${formErrors.contactEmail && touched.contactEmail ? '#d32f2f' : '#e2e8f0'}`,
                borderRadius: "6px",
                fontSize: "16px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
              placeholder="name@example.com"
            />
            <span
              id="contactEmail-help"
              style={{
                display: "block",
                fontSize: "14px",
                color: "#5a6575",
                marginTop: "4px",
                fontFamily: "'Noto Sans', sans-serif",
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
              background: "#14558F",
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

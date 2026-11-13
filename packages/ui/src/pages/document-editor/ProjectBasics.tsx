/**
 * Form for collecting basic project information: project name, organization
 * details, funding request, and contact information. Saving is owned by the
 * parent's useDraftSave; this component only reports changes.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import Card from "../../components/ui/Card";
import AutoSaveIndicator, { type SaveStatus } from "../../components/ui/AutoSaveIndicator";
import NavigationButtons from "../../components/ui/NavigationButtons";
import FormErrorSummary from "../../components/ui/FormErrorSummary";
import { colors, typography, spacing } from "../../components/ui/styles";
import { readDraftCache } from "../../common/helpers/document-editor-utils";
import type { DocumentData } from "../../common/types/document";

const AUTOSAVE_IDLE_BEFORE_FIRST_SAVE = "Changes save automatically";
const AUTOSAVE_IDLE_AFTER_FIRST_SAVE = "Saved";
const AMOUNT_NUMBERS_ONLY = "Enter the amount in numbers only, for example 25000";

interface ProjectBasicsProps {
  onContinue: () => void;
  documentData?: DocumentData | null;
  onUpdateData?: (data: Partial<DocumentData>) => void;
  saveStatus?: SaveStatus;
  lastSavedAt?: string | null;
  onRetrySave?: () => void;
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

// Field labels for error summary
const FIELD_LABELS: Record<string, string> = {
  projectName: "Project name",
  organizationName: "Organization name",
  requestedAmount: "Requested amount (USD)",
  location: "Location",
  zipCode: "Zip code",
  contactName: "Primary contact name",
  contactEmail: "Contact email",
};

// Input field component - defined outside to prevent re-creation on each render
interface InputFieldProps {
  name: keyof ProjectBasicsFormData;
  label: string;
  helpText: string;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  prefix?: string;
  autoComplete?: string;
  value: string;
  error?: string;
  touched: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
}

const InputField: React.FC<InputFieldProps> = React.memo(({
  name,
  label,
  helpText,
  type = "text",
  maxLength,
  placeholder,
  prefix,
  autoComplete,
  value,
  error,
  touched,
  onChange,
  onBlur
}) => {
  const hasError = error && touched;
  
  return (
    <div className="gw-field" style={{ marginBottom: spacing.xl }}>
      <label htmlFor={name} className="gw-field__label">
        {label}
        <span className="gw-field__required" aria-hidden="true">*</span>
      </label>
      <div style={{ position: "relative" }}>
        {prefix && (
          <span
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: colors.textSecondary,
              fontSize: typography.fontSize.base,
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            {prefix}
          </span>
        )}
        <input className="gw-input"
          type={type}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required
          aria-required="true"
          autoComplete={autoComplete}
          aria-invalid={hasError ? "true" : "false"}
          aria-describedby={hasError ? `${name}-help ${name}-error` : `${name}-help`}
          maxLength={maxLength}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: prefix ? "8px 12px 8px 28px" : undefined,
          }}
        />
      </div>
      <span id={`${name}-help`} className="gw-field__help">
        {helpText}
      </span>
      {/* Not an alert: on submit the focused summary reads every error at once. */}
      {hasError && (
        <span id={`${name}-error`} className="gw-field__message">
          {error}
        </span>
      )}
    </div>
  );
});

InputField.displayName = 'InputField';

const ProjectBasics: React.FC<ProjectBasicsProps> = ({
  onContinue,
  documentData,
  onUpdateData,
  saveStatus = "idle",
  lastSavedAt,
  onRetrySave,
}) => {
  const autoSaveIdleText = lastSavedAt
    ? AUTOSAVE_IDLE_AFTER_FIRST_SAVE
    : AUTOSAVE_IDLE_BEFORE_FIRST_SAVE;

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
  const [summaryFocusRequest, setSummaryFocusRequest] = useState(0);
  // Typed letters are dropped from the field, so this hint is the only sign anything happened.
  const [typingHint, setTypingHint] = useState("");
  const isInitialLoad = useRef(true);
  const hasLoadedFromDocumentData = useRef(false);

  const autoSave = useCallback((data: ProjectBasicsFormData) => {
    onUpdateData?.({ projectBasics: data });
  }, [onUpdateData]);

  useEffect(() => {
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
    } else if (isInitialLoad.current && !documentData?.projectBasics && !hasLoadedFromDocumentData.current) {
      const cached = readDraftCache<ProjectBasicsFormData>(documentData?.id, "projectBasics");
      if (cached && Object.values(cached).some((value) => typeof value === "string" && value.trim())) {
        setFormData({
          projectName: cached.projectName || "",
          organizationName: cached.organizationName || "",
          requestedAmount: cached.requestedAmount || "",
          location: cached.location || "",
          zipCode: cached.zipCode || "",
          contactName: cached.contactName || "",
          contactEmail: cached.contactEmail || "",
        });
        onUpdateData?.({ projectBasics: cached });
      }
      isInitialLoad.current = false;
    }
  }, [documentData, onUpdateData]);

  // Validation functions
  const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const validateZipCode = (zip: string): boolean => /^\d{5}$/.test(zip.trim());

  const validateAmount = (amount: string): { isValid: boolean; error?: string } => {
    const numericValue = amount.trim().replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(numericValue)) {
      return { isValid: false, error: "Please enter a valid amount (numbers only)" };
    }
    const numValue = parseFloat(numericValue);
    if (numValue < 1) return { isValid: false, error: "Amount must be at least $1" };
    if (numValue > 1000000000) return { isValid: false, error: "Amount cannot exceed $1,000,000,000" };
    return { isValid: true };
  };

  const validateField = (name: string, value: string): string | undefined => {
    if (!value.trim()) return "This field is required";

    switch (name) {
      case "projectName":
        if (value.trim().length < 3) return "Project name must be at least 3 characters";
        if (value.trim().length > 200) return "Project name cannot exceed 200 characters";
        break;
      case "organizationName":
        if (value.trim().length < 2) return "Organization name must be at least 2 characters";
        if (value.trim().length > 200) return "Organization name cannot exceed 200 characters";
        break;
      case "contactEmail":
        if (!validateEmail(value)) return "Please enter a valid email address";
        if (value.length > 254) return "Email address is too long";
        break;
      case "zipCode":
        if (!validateZipCode(value)) return "Please enter a valid 5-digit ZIP code";
        break;
      case "requestedAmount":
        const result = validateAmount(value);
        if (!result.isValid) return result.error;
        break;
      case "location":
        if (value.trim().length < 2) return "Location must be at least 2 characters";
        if (value.trim().length > 100) return "Location cannot exceed 100 characters";
        break;
      case "contactName":
        if (value.trim().length < 2) return "Contact name must be at least 2 characters";
        if (value.trim().length > 100) return "Contact name cannot exceed 100 characters";
        if (!/^[\p{L}\p{M}\s'’.,-]+$/u.test(value.trim()))
          return "Contact name can only contain letters, spaces, and name punctuation (periods, hyphens, apostrophes, commas)";
        if (!/\p{L}/u.test(value)) return "Contact name must include at least one letter";
        break;
    }
    return undefined;
  };

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let formattedValue = value;
    
    if (name === "zipCode") {
      formattedValue = value.replace(/\D/g, '').slice(0, 5);
    }
    if (name === "requestedAmount") {
      formattedValue = value.replace(/[^\d,.]/g, '');
      const parts = formattedValue.split('.');
      if (parts.length > 2) formattedValue = parts[0] + '.' + parts.slice(1).join('');
      if (parts.length === 2 && parts[1].length > 2) formattedValue = parts[0] + '.' + parts[1].slice(0, 2);
    }
    
    setFormData((prevFormData) => {
      const updatedData = { ...prevFormData, [name]: formattedValue };
      if (!isInitialLoad.current) autoSave(updatedData);
      return updatedData;
    });

    if (name === "requestedAmount") {
      if (/[^\d,.$\s]/.test(value)) {
        setTypingHint(AMOUNT_NUMBERS_ONLY);
        setTouched((prev) => ({ ...prev, requestedAmount: true }));
        setFormErrors((prev) => ({ ...prev, requestedAmount: AMOUNT_NUMBERS_ONLY }));
        return;
      }
      setTypingHint("");
    }

    setTouched((prevTouched) => {
      if (prevTouched[name]) {
        const error = validateField(name, formattedValue);
        setFormErrors((prev) => ({ ...prev, [name]: error }));
      } else {
        setFormErrors((prev) => {
          if (prev[name as keyof FormErrors]) {
            return { ...prev, [name]: undefined };
          }
          return prev;
        });
      }
      return prevTouched;
    });
  }, [autoSave]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, value);
    setFormErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    let isValid = true;

    Object.keys(formData).forEach((key) => {
      const error = validateField(key, formData[key as keyof ProjectBasicsFormData]);
      if (error) {
        errors[key as keyof FormErrors] = error;
        isValid = false;
      }
    });

    setFormErrors(errors);
    const allTouched: Record<string, boolean> = {};
    Object.keys(formData).forEach((key) => { allTouched[key] = true; });
    setTouched(allTouched);

    return isValid;
  };

  const handleContinue = () => {
    if (!validateForm()) {
      setSummaryFocusRequest((n) => n + 1);
      return;
    }

    onUpdateData?.({ projectBasics: formData });
    onContinue();
  };

  // Filter errors for summary (only show touched fields)
  const displayErrors: Record<string, string | undefined> = {};
  Object.keys(formErrors).forEach((key) => {
    if (touched[key]) displayErrors[key] = formErrors[key as keyof FormErrors];
  });

  return (
    <div className="gw-form-width gw-form-width--centered" style={{ padding: "16px 0" }}>
        <Card
          header="Project basics"
          headerActions={
            <AutoSaveIndicator
              status={saveStatus}
              idleText={autoSaveIdleText}
              onRetry={onRetrySave}
              variant="onPrimary"
            />
          }
        >
          <div style={{ marginBottom: spacing["2xl"], color: colors.textSecondary }}>
            Let's start with some basic information about your project. These
            details will help us create your draft application.
          </div>

          <div style={{ marginBottom: spacing.lg, fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
            <span className="gw-field__required" aria-hidden="true">*</span> Indicates required field
          </div>

          <FormErrorSummary errors={displayErrors} fieldLabels={FIELD_LABELS} focusRequest={summaryFocusRequest} />
          <div role="status" aria-live="polite" className="visually-hidden">
            {typingHint}
          </div>

          <InputField
            name="projectName"
            label="Project name"
            helpText={`Keep it clear and descriptive. (${formData.projectName.length}/200 characters)`}
            maxLength={200}
            value={formData.projectName}
            error={formErrors.projectName}
            touched={touched.projectName || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <InputField
            name="organizationName"
            label="Organization name"
            helpText={`Enter the name of your municipality, tribal nation, or community organization. (${formData.organizationName.length}/200 characters)`}
            maxLength={200}
            autoComplete="organization"
            value={formData.organizationName}
            error={formErrors.organizationName}
            touched={touched.organizationName || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <InputField
            name="requestedAmount"
            label="Requested amount (USD)"
            helpText="Enter the total funding amount you're requesting for this project."
            placeholder="250,000"
            prefix="$"
            value={formData.requestedAmount}
            error={formErrors.requestedAmount}
            touched={touched.requestedAmount || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <div style={{ display: "flex", gap: spacing.lg, marginBottom: spacing.xl, flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "min(260px, 100%)" }}>
              <InputField
                name="location"
                label="Location"
                helpText={`Enter the city and state (e.g., "Boston, MA"). (${formData.location.length}/100 characters)`}
                maxLength={100}
                placeholder="Boston, MA"
                autoComplete="address-level2"
                value={formData.location}
                error={formErrors.location}
                touched={touched.location || false}
                onChange={handleInputChange}
                onBlur={handleBlur}
              />
            </div>
            <div style={{ flex: "1", minWidth: "min(260px, 100%)" }}>
              <InputField
                name="zipCode"
                label="Zip code"
                helpText="Enter the 5-digit ZIP code for the project location."
                maxLength={5}
                placeholder="02119"
                autoComplete="postal-code"
                value={formData.zipCode}
                error={formErrors.zipCode}
                touched={touched.zipCode || false}
                onChange={handleInputChange}
                onBlur={handleBlur}
              />
            </div>
          </div>

          <InputField
            name="contactName"
            label="Primary contact name"
            helpText={`Enter the name of the primary person responsible for this grant application. (${formData.contactName.length}/100 characters)`}
            maxLength={100}
            autoComplete="name"
            value={formData.contactName}
            error={formErrors.contactName}
            touched={touched.contactName || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <InputField
            name="contactEmail"
            label="Contact email"
            type="email"
            helpText="Enter a valid email address for project-related communications."
            maxLength={254}
            placeholder="name@example.com"
            autoComplete="email"
            value={formData.contactEmail}
            error={formErrors.contactEmail}
            touched={touched.contactEmail || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />
        </Card>

        <div style={{ marginTop: spacing.xl }}>
          <AutoSaveIndicator
            status={saveStatus}
            idleText={autoSaveIdleText}
            announce={false}
          />
        </div>

        <NavigationButtons
          showBack={false}
          onContinue={handleContinue}
        />
      </div>
  );
};

export default ProjectBasics;

/**
 * ProjectBasics Component
 * 
 * Form for collecting basic project information including project name,
 * organization details, funding request, and contact information.
 * 
 * Features:
 * - Real-time validation with accessible error messages
 * - Auto-save with debouncing
 * - LocalStorage fallback for data persistence
 * - WCAG 2.1 compliant form controls
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import Card from "../../components/ui/Card";
import AutoSaveIndicator from "../../components/ui/AutoSaveIndicator";
import NavigationButtons from "../../components/ui/NavigationButtons";
import FormErrorSummary from "../../components/ui/FormErrorSummary";
import { colors, typography, spacing, borderRadius } from "../../components/ui/styles";

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

// Field labels for error summary
const FIELD_LABELS: Record<string, string> = {
  projectName: "Project Name",
  organizationName: "Organization Name",
  requestedAmount: "Requested Amount",
  location: "Location",
  zipCode: "Zip Code",
  contactName: "Primary Contact Name",
  contactEmail: "Contact Email",
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
  value,
  error,
  touched,
  onChange,
  onBlur
}) => {
  const hasError = error && touched;
  
  return (
    <div style={{ marginBottom: spacing.xl }}>
      <label
        htmlFor={name}
        style={{
          display: "block",
          marginBottom: spacing.sm,
          fontWeight: typography.fontWeight.medium,
          color: colors.text,
          fontFamily: typography.fontFamily,
        }}
      >
        {label} <span style={{ color: colors.error }} aria-label="required">*</span>
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
          >
            {prefix}
          </span>
        )}
        <input
          type={type}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required
          aria-required="true"
          aria-invalid={hasError ? "true" : "false"}
          aria-describedby={hasError ? `${name}-help ${name}-error` : `${name}-help`}
          maxLength={maxLength}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: prefix ? "12px 12px 12px 28px" : "12px",
            border: `1px solid ${hasError ? colors.error : colors.border}`,
            borderRadius: borderRadius.md,
            fontSize: typography.fontSize.base,
            fontFamily: typography.fontFamily,
          }}
        />
      </div>
      <span
        id={`${name}-help`}
        style={{
          display: "block",
          fontSize: typography.fontSize.sm,
          color: colors.textSecondary,
          marginTop: spacing.xs,
          fontFamily: typography.fontFamily,
        }}
      >
        {helpText}
      </span>
      {hasError && (
        <span
          id={`${name}-error`}
          role="alert"
          aria-live="polite"
          style={{
            display: "block",
            fontSize: typography.fontSize.sm,
            color: colors.error,
            marginTop: spacing.xs,
            fontWeight: typography.fontWeight.medium,
            fontFamily: typography.fontFamily,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
});

InputField.displayName = 'InputField';

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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialLoad = useRef(true);
  const hasLoadedFromDocumentData = useRef(false);

  // Auto-save debounce refs
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save function (debounced)
  const autoSave = useCallback((data: ProjectBasicsFormData) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    setSaveStatus('saving');

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        localStorage.setItem('projectBasics', JSON.stringify(data));
        
        if (onUpdateData) {
          try {
            await onUpdateData({ projectBasics: data });
          } catch (error) {
            console.error('Database save failed, but localStorage updated:', error);
          }
        }
        
        setSaveStatus('saved');
        
        if (saveStatusTimeoutRef.current) {
          clearTimeout(saveStatusTimeoutRef.current);
        }
        saveStatusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setSaveStatus('idle');
      }
    }, 1000);
  }, [onUpdateData]);

  // Load existing data
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
      try {
        const savedData = localStorage.getItem('projectBasics');
        if (savedData) {
          const parsedData = JSON.parse(savedData);
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
            if (onUpdateData) {
              onUpdateData({ projectBasics: parsedData });
            }
          }
        }
        isInitialLoad.current = false;
      } catch (error) {
        console.error('Error loading from localStorage:', error);
        isInitialLoad.current = false;
      }
    }
  }, [documentData, onUpdateData]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    };
  }, []);

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
        if (!/^[a-zA-Z\s'-]+$/.test(value.trim())) return "Contact name can only contain letters, spaces, hyphens, and apostrophes";
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
      const errorSummary = document.getElementById('error-summary');
      if (errorSummary) errorSummary.focus();
      return;
    }

    if (onUpdateData) onUpdateData({ projectBasics: formData });
    localStorage.setItem('projectBasics', JSON.stringify(formData));
    onContinue();
  };

  // Filter errors for summary (only show touched fields)
  const displayErrors: Record<string, string | undefined> = {};
  Object.keys(formErrors).forEach((key) => {
    if (touched[key]) displayErrors[key] = formErrors[key as keyof FormErrors];
  });

  return (
    <>
      <style>{`
        input:focus, textarea:focus, select:focus, button:focus, a:focus {
          outline: 2px solid ${colors.primary} !important;
          outline-offset: 2px !important;
        }
      `}</style>
      
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "16px 0" }}>
        <Card
          header="Project Basics"
          headerActions={<AutoSaveIndicator status={saveStatus} />}
        >
          <div style={{ marginBottom: spacing["2xl"], color: colors.textSecondary }}>
            Let's start with some basic information about your project. These
            details will help us create your draft application.
          </div>

          <div style={{ marginBottom: spacing.lg, fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
            <span style={{ color: colors.error }} aria-hidden="true">*</span> Indicates required field
          </div>

          <FormErrorSummary errors={displayErrors} fieldLabels={FIELD_LABELS} />

          <InputField
            name="projectName"
            label="Project Name"
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
            label="Organization Name"
            helpText={`Enter the name of your municipality, tribal nation, or community organization. (${formData.organizationName.length}/200 characters)`}
            maxLength={200}
            value={formData.organizationName}
            error={formErrors.organizationName}
            touched={touched.organizationName || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <InputField
            name="requestedAmount"
            label="Requested Amount"
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
            <div style={{ flex: "1", minWidth: "260px" }}>
              <InputField
                name="location"
                label="Location"
                helpText={`Enter the city and state (e.g., "Boston, MA"). (${formData.location.length}/100 characters)`}
                maxLength={100}
                placeholder="Boston, MA"
                value={formData.location}
                error={formErrors.location}
                touched={touched.location || false}
                onChange={handleInputChange}
                onBlur={handleBlur}
              />
            </div>
            <div style={{ flex: "1", minWidth: "260px" }}>
              <InputField
                name="zipCode"
                label="Zip Code"
                helpText="Enter the 5-digit ZIP code for the project location."
                maxLength={5}
                placeholder="02119"
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
            label="Primary Contact Name"
            helpText={`Enter the name of the primary person responsible for this grant application. (${formData.contactName.length}/100 characters)`}
            maxLength={100}
            value={formData.contactName}
            error={formErrors.contactName}
            touched={touched.contactName || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <InputField
            name="contactEmail"
            label="Contact Email"
            type="email"
            helpText="Enter a valid email address for project-related communications."
            maxLength={254}
            placeholder="name@example.com"
            value={formData.contactEmail}
            error={formErrors.contactEmail}
            touched={touched.contactEmail || false}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />
        </Card>

        <NavigationButtons
          showBack={false}
          onContinue={handleContinue}
        />
      </div>
    </>
  );
};

export default ProjectBasics;

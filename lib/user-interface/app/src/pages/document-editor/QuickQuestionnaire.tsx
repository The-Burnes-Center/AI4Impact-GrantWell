/**
 * QuickQuestionnaire Component
 * 
 * A multi-question form for gathering project-specific information based on the selected NOFO.
 * Questions are dynamically loaded from the API based on the selected Notice of Funding Opportunity.
 * 
 * Features:
 * - Dynamic question loading from API
 * - Auto-save with debouncing
 * - LocalStorage fallback for data persistence
 * - Accessible form with ARIA attributes
 */
import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { useParams } from "react-router-dom";
import {
  Card,
  LoadingSpinner,
  AutoSaveIndicator,
  NavigationButtons,
  colors,
  typography,
} from "../../components/ui";

interface QuickQuestionnaireProps {
  onContinue: () => void;
  selectedNofo: string | null;
  onNavigate: (step: string) => void;
  documentData?: any;
  onUpdateData?: (data: any) => void;
}

interface QuestionData {
  id: number;
  question: string;
}

interface QuestionnaireFormData {
  [key: string]: string;
}

const QuickQuestionnaire: React.FC<QuickQuestionnaireProps> = ({
  onContinue,
  selectedNofo,
  onNavigate,
  documentData,
  onUpdateData
}) => {
  const [formData, setFormData] = useState<QuestionnaireFormData>({});
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noQuestionsFound, setNoQuestionsFound] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialLoad = useRef(true);
  const hasLoadedFromDocumentData = useRef(false);
  const appContext = useContext(AppContext);
  const { sessionId } = useParams();

  // Auto-save debounce refs
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load form data when documentData becomes available
  useEffect(() => {
    if (documentData?.questionnaire && !hasLoadedFromDocumentData.current) {
      setFormData(documentData.questionnaire);
      hasLoadedFromDocumentData.current = true;
      isInitialLoad.current = false;
    } else if (isInitialLoad.current && !documentData?.questionnaire && !hasLoadedFromDocumentData.current) {
      try {
        const savedData = localStorage.getItem('questionnaire');
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          const hasData = Object.keys(parsedData).length > 0 && 
                         Object.values(parsedData).some((val: any) => val && val.trim && val.trim().length > 0);
          
          if (hasData) {
            setFormData(parsedData);
            if (onUpdateData) {
              onUpdateData({ questionnaire: parsedData });
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

  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      setError(null);
      setNoQuestionsFound(false);

      try {
        if (!selectedNofo) {
          setNoQuestionsFound(true);
          setLoading(false);
          return;
        }

        if (appContext && selectedNofo) {
          try {
            const apiClient = new ApiClient(appContext);
            const result = await apiClient.landingPage.getNOFOQuestions(selectedNofo);

            if (
              result?.data?.questions &&
              Array.isArray(result.data.questions) &&
              result.data.questions.length > 0
            ) {
              setQuestions(result.data.questions);
              
              if (Object.keys(formData).length === 0 && !hasLoadedFromDocumentData.current) {
                const initialFormData: QuestionnaireFormData = {};
                result.data.questions.forEach((q) => {
                  initialFormData[`question_${q.id}`] = "";
                });
                setFormData(initialFormData);
              }
            } else {
              setNoQuestionsFound(true);
            }
          } catch (error) {
            console.error("Error fetching questions from API:", error);
            setNoQuestionsFound(true);
          }
        } else {
          setNoQuestionsFound(true);
        }
      } catch (error) {
        console.error("Error in fetchQuestions:", error);
        setError("Failed to load questions. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [selectedNofo, appContext]);

  // Auto-save function (debounced)
  const autoSave = useCallback((data: QuestionnaireFormData) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    setSaveStatus('saving');

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        localStorage.setItem('questionnaire', JSON.stringify(data));
        
        if (onUpdateData) {
          try {
            await onUpdateData({ questionnaire: data });
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

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prevFormData) => {
      const updatedFormData = {
        ...prevFormData,
        [name]: value,
      };
      if (!isInitialLoad.current) {
        autoSave(updatedFormData);
      }
      return updatedFormData;
    });
  }, [autoSave]);

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

  const handleCreateDraft = async () => {
    if (onUpdateData) {
      onUpdateData({ questionnaire: formData });
    }
    localStorage.setItem('questionnaire', JSON.stringify(formData));
    onContinue();
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 0" }}>
        <LoadingSpinner message="Loading questions..." showMessage centered />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 0", textAlign: "center" }}>
        <p style={{ color: colors.error, marginBottom: "16px" }}>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            background: colors.primary,
            color: colors.white,
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // No questions found state
  if (noQuestionsFound) {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 0" }}>
        <Card>
          <p style={{ fontSize: "16px", marginBottom: "16px", textAlign: "center" }}>
            No questions found for this NOFO. You can continue to the next step.
          </p>
        </Card>
        <NavigationButtons
          onBack={() => onNavigate("projectBasics")}
          showContinue={false}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "16px 0" }}>
      <Card
        header="Questionnaire"
        headerActions={<AutoSaveIndicator status={saveStatus} />}
      >
        <p style={{ color: colors.textSecondary, marginBottom: "24px", fontFamily: typography.fontFamily }}>
          Answer these simple questions to help us create a draft of your
          application. Don't worry about perfect answers - you can edit everything
          later.
        </p>

        <div style={{ background: colors.white, borderRadius: "8px", padding: "24px" }}>
          {questions.map((questionItem) => (
            <div key={questionItem.id} style={{ marginBottom: "24px" }}>
              <label
                htmlFor={`question_${questionItem.id}`}
                style={{
                  display: "block",
                  marginBottom: "12px",
                  fontWeight: typography.fontWeight.medium,
                  color: colors.text,
                  fontSize: typography.fontSize.base,
                  fontFamily: typography.fontFamily,
                }}
              >
                {questionItem.id}. {questionItem.question}
              </label>
              <textarea
                id={`question_${questionItem.id}`}
                name={`question_${questionItem.id}`}
                value={formData[`question_${questionItem.id}`] || ""}
                onChange={handleInputChange}
                aria-describedby={`question_${questionItem.id}_help`}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "6px",
                  fontSize: typography.fontSize.base,
                  minHeight: "120px",
                  resize: "vertical",
                  fontFamily: typography.fontFamily,
                }}
                placeholder="Enter your answer here."
              />
              <span
                id={`question_${questionItem.id}_help`}
                style={{
                  display: "block",
                  fontSize: typography.fontSize.sm,
                  color: colors.textSecondary,
                  marginTop: "6px",
                  lineHeight: "1.4",
                  fontFamily: typography.fontFamily,
                }}
              >
                Provide a detailed answer. You can edit this later in the document editor.
              </span>
            </div>
          ))}
        </div>
      </Card>

      <NavigationButtons
        onBack={() => onNavigate("projectBasics")}
        onContinue={handleCreateDraft}
      />
    </div>
  );
};

export default QuickQuestionnaire;

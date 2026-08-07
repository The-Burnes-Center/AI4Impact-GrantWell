/**
 * NOFO-specific questions, loaded from the API. Saving is owned by the parent's
 * useDraftSave; this component only reports changes.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import AutoSaveIndicator, { type SaveStatus } from "../../components/ui/AutoSaveIndicator";
import NavigationButtons from "../../components/ui/NavigationButtons";
import { colors, typography } from "../../components/ui/styles";
import { readDraftCache } from "../../common/helpers/document-editor-utils";
import type { DocumentData } from "../../common/types/document";

interface QuickQuestionnaireProps {
  onContinue: () => void;
  selectedNofo: string | null;
  onNavigate: (step: string) => void;
  documentData?: DocumentData | null;
  onUpdateData?: (data: Partial<DocumentData>) => void;
  saveStatus?: SaveStatus;
  onRetrySave?: () => void;
}

interface QuestionData {
  // Parsed questions use sequential integer ids; admin-authored custom questions use string ids.
  id: number | string;
  question: string;
  helpText?: string;
  source?: "custom";
}

interface QuestionnaireFormData {
  [key: string]: string;
}

const QuickQuestionnaire: React.FC<QuickQuestionnaireProps> = ({
  onContinue,
  selectedNofo,
  onNavigate,
  documentData,
  onUpdateData,
  saveStatus = "idle",
  onRetrySave,
}) => {
  const [formData, setFormData] = useState<QuestionnaireFormData>({});
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noQuestionsFound, setNoQuestionsFound] = useState(false);
  const isInitialLoad = useRef(true);
  const hasLoadedFromDocumentData = useRef(false);
  const apiClient = useApiClient();

  useEffect(() => {
    if (documentData?.questionnaire && !hasLoadedFromDocumentData.current) {
      setFormData(documentData.questionnaire);
      hasLoadedFromDocumentData.current = true;
      isInitialLoad.current = false;
    } else if (isInitialLoad.current && !documentData?.questionnaire && !hasLoadedFromDocumentData.current) {
      const cached = readDraftCache<QuestionnaireFormData>(documentData?.id, "questionnaire");
      if (cached && Object.values(cached).some((value) => typeof value === "string" && value.trim())) {
        setFormData(cached);
        onUpdateData?.({ questionnaire: cached });
      }
      isInitialLoad.current = false;
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

        if (selectedNofo) {
          try {
            const result = await apiClient.landingPage.getNOFOQuestions(selectedNofo);

            if (
              result?.data?.questions &&
              Array.isArray(result.data.questions) &&
              result.data.questions.length > 0
            ) {
              setQuestions(result.data.questions);
              
              if (Object.keys(formData).length === 0 && !hasLoadedFromDocumentData.current) {
                const initialFormData: QuestionnaireFormData = {};
                result.data.questions.forEach((q: { id: string | number }) => {
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
  }, [selectedNofo, apiClient]);

  const autoSave = useCallback((data: QuestionnaireFormData) => {
    onUpdateData?.({ questionnaire: data });
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

  const handleCreateDraft = async () => {
    onUpdateData?.({ questionnaire: formData });
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
        headerActions={<AutoSaveIndicator status={saveStatus} onRetry={onRetrySave} />}
      >
        <p style={{ color: colors.textSecondary, marginBottom: "24px", fontFamily: typography.fontFamily }}>
          Answer these simple questions to help us create a draft of your
          application. Don't worry about perfect answers - you can edit everything
          later.
        </p>

        <div style={{ background: colors.white, borderRadius: "8px", padding: "24px" }}>
          {questions.map((questionItem, index) => (
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
                {index + 1}. {questionItem.question}
                {questionItem.source === "custom" && (
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.textSecondary,
                    }}
                  >
                    (Added by your agency)
                  </span>
                )}
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
                {questionItem.helpText || "Provide a detailed answer. You can edit this later in the document editor."}
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

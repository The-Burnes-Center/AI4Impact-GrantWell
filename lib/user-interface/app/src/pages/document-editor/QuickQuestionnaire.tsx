import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { DraftsClient } from "../../common/api-client/drafts-client";
import { Auth } from "aws-amplify";
import { useParams } from "react-router-dom";

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
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load form data when documentData becomes available
  useEffect(() => {
    // Load from documentData if available and we haven't loaded it yet
    if (documentData?.questionnaire && !hasLoadedFromDocumentData.current) {
      setFormData(documentData.questionnaire);
      hasLoadedFromDocumentData.current = true;
      isInitialLoad.current = false;
    } 
    // Fallback to localStorage only if documentData is not available and we haven't loaded yet
    else if (isInitialLoad.current && !documentData?.questionnaire && !hasLoadedFromDocumentData.current) {
      try {
        const savedData = localStorage.getItem('questionnaire');
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          // Check if localStorage has actual data (not just empty object)
          const hasData = Object.keys(parsedData).length > 0 && 
                         Object.values(parsedData).some((val: any) => val && val.trim && val.trim().length > 0);
          
          if (hasData) {
            setFormData(parsedData);
            // Also update parent component with localStorage data
            if (onUpdateData) {
              onUpdateData({
                questionnaire: parsedData
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

        // Try to fetch questions from the API
        if (appContext && selectedNofo) {
          try {
            const apiClient = new ApiClient(appContext);
            const result = await apiClient.landingPage.getNOFOQuestions(
              selectedNofo
            );

            if (
              result?.data?.questions &&
              Array.isArray(result.data.questions) &&
              result.data.questions.length > 0
            ) {
              setQuestions(result.data.questions);
              
              // Only initialize form data if it's empty AND we haven't loaded from documentData yet
              // This prevents overwriting saved data when questions are fetched
              if (Object.keys(formData).length === 0 && !hasLoadedFromDocumentData.current) {
                const initialFormData: QuestionnaireFormData = {};
                result.data.questions.forEach((q) => {
                  initialFormData[`question_${q.id}`] = "";
                });
                setFormData(initialFormData);
              }
            } else {
              console.warn("No questions found for this NOFO");
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
  }, [selectedNofo, appContext]); // Removed documentData dependency

  // Auto-save function (debounced)
  const autoSave = useCallback((data: QuestionnaireFormData) => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Show saving indicator immediately when user stops typing
    setSaveStatus('saving');

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Save to localStorage immediately
        localStorage.setItem('questionnaire', JSON.stringify(data));
        
        // Update parent component (which saves to database)
        if (onUpdateData) {
          try {
            await onUpdateData({
              questionnaire: data
            });
          } catch (error) {
            // If database save fails, localStorage is still updated
            console.error('Database save failed, but localStorage updated:', error);
          }
        }
        
        // Show saved status
        setSaveStatus('saved');
        
        // Clear saved status after 2 seconds
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
    }, 1000); // Wait 1 second after user stops typing
  }, [onUpdateData]);

  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const updatedFormData = {
      ...formData,
      [name]: value,
    };
    setFormData(updatedFormData);

    // Auto-save after user stops typing (debounced) - but not on initial load
    if (!isInitialLoad.current) {
      autoSave(updatedFormData);
    }
  };

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
    // Save questionnaire data to session
    if (onUpdateData) {
      onUpdateData({
        questionnaire: formData
      });
    }

    // Save to localStorage for draft generation
    localStorage.setItem('questionnaire', JSON.stringify(formData));
    
    onContinue();
  };

  if (loading) {
    return (
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "32px 0",
          textAlign: "center",
        }}
      >
        <p>Loading questions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "32px 0",
          color: "#e53e3e",
          textAlign: "center",
        }}
      >
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "16px",
            padding: "8px 16px",
            background: "#14558F",
            color: "white",
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

  if (noQuestionsFound) {
    return (
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "32px 0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            marginBottom: "24px",
          }}
        >
          <p style={{ fontSize: "16px", marginBottom: "16px" }}>
            No questions found for this NOFO. You can continue to the next step.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={() => onNavigate("projectBasics")}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 20px",
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              color: "#3d4451",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
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
              style={{ marginRight: "8px" }}
            >
              <path d="M19 12H5"></path>
              <path d="m12 19-7-7 7-7"></path>
            </svg>
            Back
          </button>
          <button
            disabled={true}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 24px",
              background: "#a0aec0", // Grayed out color
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: 500,
              cursor: "not-allowed",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              opacity: 0.7,
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
            >
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
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
            marginBottom: "24px",
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
              Questionnaire
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
            <p
              style={{
                color: "#3d4451",
                marginBottom: "24px",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            >
              Answer these simple questions to help us create a draft of your
              application. Don't worry about perfect answers - you can edit everything
              later.
            </p>

            <div
              style={{
                background: "white",
                borderRadius: "8px",
                padding: "24px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                marginBottom: "24px",
              }}
            >
        {questions.map((questionItem) => (
          <div key={questionItem.id} style={{ marginBottom: "24px" }}>
            <label
              htmlFor={`question_${questionItem.id}`}
              style={{
                display: "block",
                marginBottom: "12px",
                fontWeight: 500,
                color: "#2d3748",
                fontSize: "16px",
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
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "16px",
                minHeight: "120px",
                resize: "vertical",
                fontFamily: "'Noto Sans', sans-serif",
              }}
              placeholder="Enter your answer here."
            />
            <span
              id={`question_${questionItem.id}_help`}
              style={{
                display: "block",
                fontSize: "14px",
                color: "#4a5568",
                marginTop: "6px",
                lineHeight: "1.4",
                fontFamily: "'Noto Sans', sans-serif",
              }}
            >
              Provide a detailed answer. You can edit this later in the document editor.
            </span>
          </div>
        ))}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
        <button
          onClick={() => onNavigate("projectBasics")}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 20px",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            color: "#3d4451",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
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
            style={{ marginRight: "8px" }}
          >
            <path d="M19 12H5"></path>
            <path d="m12 19-7-7 7-7"></path>
          </svg>
          Back
        </button>
        <button
          onClick={handleCreateDraft}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 24px",
            background: "#14558F",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "16px",
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
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
          >
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
          </svg>
        </button>
      </div>
      </div>
    </>
  );
};

export default QuickQuestionnaire;

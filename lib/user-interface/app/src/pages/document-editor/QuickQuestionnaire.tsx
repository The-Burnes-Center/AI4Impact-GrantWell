import React, { useState, useEffect, useContext } from "react";
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
  const appContext = useContext(AppContext);
  const { sessionId } = useParams();

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
              initializeFormData(result.data.questions);
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

    // Helper function to initialize form data
    const initializeFormData = (questions: QuestionData[]) => {
      const initialFormData: QuestionnaireFormData = {};
      questions.forEach((q) => {
        initialFormData[`question_${q.id}`] = "";
      });

      // Load saved answers from documentData if available
      if (documentData?.questionnaire) {
        Object.keys(documentData.questionnaire).forEach((key) => {
          initialFormData[key] = documentData.questionnaire[key];
        });
      }

      setFormData(initialFormData);
    };

    fetchQuestions();
  }, [selectedNofo, appContext, documentData]);

  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const updatedFormData = {
      ...formData,
      [name]: value,
    };
    setFormData(updatedFormData);
  };

  const handleCreateDraft = async () => {
    // Save questionnaire data to session
    if (onUpdateData) {
      onUpdateData({
        questionnaire: formData
      });
    }
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
            background: "#4361ee",
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
              color: "#4a5568",
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
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "32px 0",
      }}
    >
      <p
        style={{
          color: "#4a5568",
          marginBottom: "24px",
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
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "16px",
                minHeight: "120px",
                resize: "vertical",
              }}
              placeholder="Enter your answer here."
            />
          </div>
        ))}
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
            color: "#4a5568",
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
            background: "#4361ee",
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
  );
};

export default QuickQuestionnaire;

import React, { useState, useEffect } from "react";

interface QuickQuestionnaireProps {
  onContinue: () => void;
  selectedNofo: string | null;
}

interface QuestionnaireFormData {
  problemSolution: string;
  beneficiaries: string;
  activities: string;
  expectedResults: string;
  supportingData: string;
  additionalInfo: string;
}

const QuickQuestionnaire: React.FC<QuickQuestionnaireProps> = ({
  onContinue,
  selectedNofo,
}) => {
  const [formData, setFormData] = useState<QuestionnaireFormData>({
    problemSolution: "",
    beneficiaries: "",
    activities: "",
    expectedResults: "",
    supportingData: "",
    additionalInfo: "",
  });

  // Load previous data if available
  useEffect(() => {
    const savedQuestionnaire = localStorage.getItem("quickQuestionnaire");
    if (savedQuestionnaire) {
      setFormData(JSON.parse(savedQuestionnaire));
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleCreateDraft = () => {
    // Save questionnaire data to localStorage
    localStorage.setItem("quickQuestionnaire", JSON.stringify(formData));
    onContinue();
  };

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
        {selectedNofo && (
          <span
            style={{
              display: "block",
              marginTop: "8px",
              color: "#4361ee",
              fontWeight: 500,
            }}
          >
            Selected NOFO: {selectedNofo}
          </span>
        )}
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
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: 500,
              color: "#2d3748",
              fontSize: "16px",
            }}
          >
            1. What problem will your project solve?
          </label>
          <textarea
            id="problemSolution"
            name="problemSolution"
            value={formData.problemSolution}
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
            placeholder="Example: Our downtown area has high vacancy rates and deteriorating infrastructure that makes it unsafe and unappealing."
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: 500,
              color: "#2d3748",
              fontSize: "16px",
            }}
          >
            2. Who will benefit from this project?
          </label>
          <textarea
            id="beneficiaries"
            name="beneficiaries"
            value={formData.beneficiaries}
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
            placeholder="Example: Local businesses, residents, visitors, and particularly seniors and people with disabilities who currently struggle with accessibility."
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: 500,
              color: "#2d3748",
              fontSize: "16px",
            }}
          >
            3. What are the main activities you'll complete?
          </label>
          <textarea
            id="activities"
            name="activities"
            value={formData.activities}
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
            placeholder="Example: Sidewalk repairs, street lighting installation, facade improvements, and creating a public gathering space."
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: 500,
              color: "#2d3748",
              fontSize: "16px",
            }}
          >
            4. What results do you expect to achieve?
          </label>
          <textarea
            id="expectedResults"
            name="expectedResults"
            value={formData.expectedResults}
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
            placeholder="Example: Reduced vacancy rates, increased foot traffic, improved safety, and a 15% increase in business revenue."
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: 500,
              color: "#2d3748",
              fontSize: "16px",
            }}
          >
            5. Do you have any specific data or statistics about the problem?
          </label>
          <textarea
            id="supportingData"
            name="supportingData"
            value={formData.supportingData}
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
            placeholder="Example: 37% vacancy rate in storefronts, 68% of residents feel unsafe downtown after dark, 22% decline in business revenue since 2018."
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: 500,
              color: "#2d3748",
              fontSize: "16px",
            }}
          >
            6. Upload any relevant documents or supporting materials
          </label>
          <div
            style={{
              marginTop: "8px",
            }}
          >
            <div
              style={{
                border: "2px dashed #d4daff",
                borderRadius: "8px",
                padding: "24px",
                textAlign: "center",
                background: "#f7fafc",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: "40px",
                  height: "40px",
                  stroke: "#4361ee",
                  fill: "none",
                  strokeWidth: 2,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  margin: "0 auto 12px",
                  display: "block",
                }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p style={{ marginBottom: "16px", color: "#4a5568" }}>
                Drag and drop files here or click to browse
              </p>
              <button
                style={{
                  background: "#4361ee",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Select Files
              </button>
              <input type="file" multiple style={{ display: "none" }} />
            </div>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "#718096",
              marginTop: "8px",
            }}
          >
            You can upload multiple files at once. You'll also be able to add
            more documents later in the process if needed.
          </p>
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: 500,
              color: "#2d3748",
              fontSize: "16px",
            }}
          >
            7. Is there anything else you'd like to mention about your project?
          </label>
          <textarea
            id="additionalInfo"
            name="additionalInfo"
            value={formData.additionalInfo}
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
            placeholder="Add any additional information that wasn't covered in the previous questions. This is your opportunity to share any other important aspects of your project."
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
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
          Create Draft
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

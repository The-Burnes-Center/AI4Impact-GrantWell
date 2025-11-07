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

  // Load existing data if available
  useEffect(() => {
    if (documentData?.projectBasics) {
      setFormData(documentData.projectBasics);
    }
  }, [documentData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleContinue = () => {
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

  return (
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
            background: "#4361ee",
            color: "white",
            padding: "20px 24px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600 }}>
            Project Basics
          </h1>
        </div>

        <div style={{ padding: "24px" }}>
          <div style={{ marginBottom: "24px", color: "#4a5568" }}>
            Let's start with some basic information about your project. These
            details will help us create your draft application.
          </div>

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
              Project Name
            </label>
            <input
              type="text"
              id="projectName"
              name="projectName"
              value={formData.projectName}
              onChange={handleInputChange}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              style={{
                display: "block",
                fontSize: "12px",
                color: "#718096",
                marginTop: "4px",
              }}
            >
              Keep it clear and descriptive. 5-10 words recommended.
            </span>
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
              Organization Name
            </label>
            <input
              type="text"
              id="organizationName"
              name="organizationName"
              value={formData.organizationName}
              onChange={handleInputChange}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              style={{
                display: "block",
                fontSize: "12px",
                color: "#718096",
                marginTop: "4px",
              }}
            >
              Enter the name of your municipality, tribal nation, or community organization.
            </span>
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
              Requested Amount
            </label>
            <input
              type="text"
              id="requestedAmount"
              name="requestedAmount"
              value={formData.requestedAmount}
              onChange={handleInputChange}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              style={{
                display: "block",
                fontSize: "12px",
                color: "#718096",
                marginTop: "4px",
              }}
            >
              Enter the total funding amount you're requesting for this project. Example: "$250,000"
            </span>
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
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "16px",
                }}
              />
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#718096",
                  marginTop: "4px",
                }}
              >
                Enter the city and state where the project will take place. Example: "Boston, MA"
              </span>
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
                Zip Code
              </label>
              <input
                type="text"
                id="zipCode"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleInputChange}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "16px",
                }}
              />
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#718096",
                  marginTop: "4px",
                }}
              >
                Enter the ZIP code for the project location. Example: "02119"
              </span>
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
              Primary Contact Name
            </label>
            <input
              type="text"
              id="contactName"
              name="contactName"
              value={formData.contactName}
              onChange={handleInputChange}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              style={{
                display: "block",
                fontSize: "12px",
                color: "#718096",
                marginTop: "4px",
              }}
            >
              Enter the name of the primary person responsible for this grant application.
            </span>
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
              Contact Email
            </label>
            <input
              type="email"
              id="contactEmail"
              name="contactEmail"
              value={formData.contactEmail}
              onChange={handleInputChange}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "16px",
              }}
            />
            <span
              style={{
                display: "block",
                fontSize: "12px",
                color: "#718096",
                marginTop: "4px",
              }}
            >
              Enter a valid email address for project-related communications.
            </span>
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
            onClick={handleContinue}
            style={{
              padding: "12px 24px",
              background: "#4361ee",
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
            >
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectBasics;

import React from "react";
import { useNavigate } from "react-router-dom";

interface WelcomePageProps {
  onContinue: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onContinue }) => {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 0" }}>
      <div
        style={{
          textAlign: "center",
          marginBottom: "48px",
        }}
      >
        <h1
          style={{
            color: "#2c3e50",
            fontSize: "36px",
            margin: "0 0 16px",
            fontWeight: "700",
          }}
        >
          Welcome to GrantWell
        </h1>
        <h2
          style={{
            color: "#4361ee",
            fontSize: "20px",
            margin: "0",
            fontWeight: "500",
          }}
        >
          AI-Powered Grant Writing Assistant
        </h2>
      </div>

      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "32px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                backgroundColor: "#4361ee",
                color: "white",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              1
            </div>
            <div>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#2d3748",
                }}
              >
                Answer Simple Questions
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "#4a5568",
                  fontSize: "16px",
                  lineHeight: 1.6,
                }}
              >
                We'll guide you through key questions about your project to gather
                the essential information needed for your grant application.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                backgroundColor: "#4361ee",
                color: "white",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              2
            </div>
            <div>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#2d3748",
                }}
              >
                Upload Supporting Documents
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "#4a5568",
                  fontSize: "16px",
                  lineHeight: 1.6,
                }}
              >
                Add any supporting documents that will help our AI understand your
                project better and generate more accurate content.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div
              style={{
                backgroundColor: "#4361ee",
                color: "white",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              3
            </div>
            <div>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#2d3748",
                }}
              >
                Review & Edit AI-Generated Content
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "#4a5568",
                  fontSize: "16px",
                  lineHeight: 1.6,
                }}
              >
                Our AI will generate high-quality content that you can review,
                refine, and perfect for your grant application.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "32px" }}>
          <button
            onClick={onContinue}
            style={{
              display: "block",
              width: "100%",
              padding: "16px",
              backgroundColor: "#4361ee",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "18px",
              cursor: "pointer",
              transition: "background-color 0.2s",
              fontWeight: "600",
              boxShadow: "0 2px 4px rgba(67, 97, 238, 0.3)",
              marginBottom: "16px",
            }}
          >
            Start New Application
          </button>
          <button
            onClick={() => navigate("/document-editor/drafts")}
            style={{
              display: "block",
              width: "100%",
              padding: "16px",
              backgroundColor: "white",
              color: "#4361ee",
              border: "2px solid #4361ee",
              borderRadius: "8px",
              fontSize: "18px",
              cursor: "pointer",
              transition: "background-color 0.2s",
              fontWeight: "600",
            }}
          >
            View Existing Drafts
          </button>
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          color: "#718096",
          fontSize: "14px",
        }}
      >
        <p style={{ margin: "0 0 8px" }}>
          Need help? Contact{" "}
          <a
            href="mailto:FedFundsInfra@mass.gov"
            style={{
              color: "#4361ee",
              textDecoration: "none",
              fontWeight: "500",
            }}
          >
            FedFundsInfra@mass.gov
          </a>
        </p>
      </div>
    </div>
  );
};

export default WelcomePage; 
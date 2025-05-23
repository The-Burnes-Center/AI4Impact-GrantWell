import React from "react";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onStart,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
          width: "90%",
          maxWidth: "600px",
          position: "relative",
          animation: "slideIn 0.3s ease-out",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "none",
            border: "none",
            fontSize: "24px",
            color: "#666",
            cursor: "pointer",
            padding: "8px",
            lineHeight: 1,
            borderRadius: "50%",
            transition: "all 0.2s",
          }}
        >
          ×
        </button>

        <div style={{ padding: "32px" }}>
          <div
            style={{
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            <h1
              style={{
                color: "#2c3e50",
                fontSize: "36px",
                margin: "0 0 8px",
                fontWeight: "700",
              }}
            >
              Welcome to GrantWell
            </h1>
            <h2
              style={{
                color: "#4361ee",
                fontSize: "18px",
                margin: "0",
                fontWeight: "500",
              }}
            >
              AI-Powered Grant Writing Assistant
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#4361ee",
                  color: "white",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  fontWeight: "bold",
                  flexShrink: 0,
                }}
              >
                1
              </div>
              <div>
                <h3
                  style={{
                    margin: "0 0 4px",
                    fontSize: "16px",
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
                    fontSize: "14px",
                    lineHeight: 1.5,
                  }}
                >
                  We'll guide you through key questions about your project to
                  gather the essential information.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#4361ee",
                  color: "white",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  fontWeight: "bold",
                  flexShrink: 0,
                }}
              >
                2
              </div>
              <div>
                <h3
                  style={{
                    margin: "0 0 4px",
                    fontSize: "16px",
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
                    fontSize: "14px",
                    lineHeight: 1.5,
                  }}
                >
                  Add any supporting documents that will help our AI understand
                  your project better.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#4361ee",
                  color: "white",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  fontWeight: "bold",
                  flexShrink: 0,
                }}
              >
                3
              </div>
              <div>
                <h3
                  style={{
                    margin: "0 0 4px",
                    fontSize: "16px",
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
                    fontSize: "14px",
                    lineHeight: 1.5,
                  }}
                >
                  Our AI will generate high-quality content that you can refine
                  to perfect your application.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onStart}
            style={{
              display: "block",
              width: "100%",
              padding: "16px",
              backgroundColor: "#4361ee",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "18px",
              cursor: "pointer",
              transition: "background-color 0.2s",
              marginBottom: "24px",
              fontWeight: "600",
              boxShadow: "0 2px 4px rgba(67, 97, 238, 0.3)",
            }}
          >
            Go to Application <span style={{ marginLeft: "8px" }}>→</span>
          </button>

          <div
            style={{
              textAlign: "center",
              color: "#718096",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <p style={{ margin: 0 }}>
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
      </div>
    </div>
  );
};

export default WelcomeModal;

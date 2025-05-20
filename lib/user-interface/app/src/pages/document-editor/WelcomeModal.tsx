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
          <h1
            style={{
              color: "#2c3e50",
              fontSize: "40px",
              margin: "0 0 8px",
              textAlign: "center",
            }}
          >
            GrantWell
          </h1>
          <h2
            style={{
              color: "#666",
              fontSize: "20px",
              margin: "0 0 32px",
              textAlign: "center",
              fontWeight: "normal",
            }}
          >
            Grant Writing Made Simple
          </h2>

          <p
            style={{
              color: "#666",
              lineHeight: 1.6,
              marginBottom: "32px",
              textAlign: "center",
            }}
          >
            Welcome to GrantWell, your step-by-step assistant for creating
            successful grant applications. We'll guide you through each part of
            the process with simple instructions and helpful examples.
          </p>

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
              fontWeight: 500,
            }}
          >
            Start New Application <span style={{ marginLeft: "8px" }}>→</span>
          </button>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              marginBottom: "32px",
            }}
          >
            <button
              style={{
                padding: "12px",
                backgroundColor: "#f8f9fa",
                border: "1px solid #dee2e6",
                borderRadius: "6px",
                color: "#2c3e50",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "20px" }}>▶</span> Watch How It Works (2
              min)
            </button>
          </div>

          <div
            style={{
              textAlign: "center",
              color: "#666",
              fontSize: "14px",
            }}
          >
            Need help? Contact{" "}
            <a
              href="mailto:FedFundsInfra@mass.gov"
              style={{ color: "#4361ee", textDecoration: "none" }}
            >
              FedFundsInfra@mass.gov
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;

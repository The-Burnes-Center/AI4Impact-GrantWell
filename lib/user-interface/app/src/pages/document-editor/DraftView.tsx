import React, { useState, useEffect, useContext } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";

interface DraftViewProps {
  onStartEditing: () => void;
  selectedNofo: string | null;
  sessionId: string;
}

const DraftView: React.FC<DraftViewProps> = ({
  onStartEditing,
  selectedNofo,
  sessionId,
}) => {
  const [draftData, setDraftData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appContext = useContext(AppContext);

  useEffect(() => {
    const fetchDraftData = async () => {
      if (!appContext || !selectedNofo || !sessionId) return;

      try {
        const apiClient = new ApiClient(appContext);
        const username = (await Auth.currentAuthenticatedUser()).username;
        
        // Get draft from database
        const currentDraft = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username
        });

        if (currentDraft) {
          setDraftData(currentDraft);
        }
      } catch (error) {
        console.error("Error loading draft data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDraftData();
  }, [appContext, selectedNofo, sessionId]);

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "60vh"
      }}>
        <div style={{
          width: "40px",
          height: "40px",
          border: "4px solid #f3f3f3",
          borderTop: "4px solid #3498db",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }}></div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "32px",
          textAlign: "center",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          maxWidth: "560px",
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            background: "#4ade80",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "32px",
              height: "32px",
              stroke: "white",
              fill: "none",
              strokeWidth: 3,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          >
            <path d="M20 6L9 17L4 12"></path>
          </svg>
        </div>

        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#111827",
            marginBottom: "16px",
          }}
        >
          Draft Created!
        </h1>

        <p
          style={{
            color: "#4b5563",
            marginBottom: "24px",
            maxWidth: "440px",
            margin: "0 auto 24px",
          }}
        >
          We've created a starting draft of your grant application based on your
          answers. Now you can review and improve each section.
        </p>

        {draftData && (
          <div
            style={{
              background: "#f0f4ff",
              padding: "24px",
              borderRadius: "8px",
              textAlign: "left",
              marginBottom: "24px",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#1e40af",
                marginBottom: "16px",
              }}
            >
              Draft Overview:
            </h2>
            <div style={{ marginBottom: "16px" }}>
              <strong style={{ color: "#4b5563" }}>Title:</strong>{" "}
              <span style={{ color: "#4b5563" }}>{draftData.title}</span>
            </div>
            {draftData.projectBasics && (
              <div style={{ marginBottom: "16px" }}>
                <strong style={{ color: "#4b5563" }}>Project Basics:</strong>
                <ul style={{ margin: "8px 0", paddingLeft: "20px", color: "#4b5563" }}>
                  {Object.entries(draftData.projectBasics).map(([key, value]: [string, any]) => (
                    <li key={key}>
                      <strong>{key}:</strong> {value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {draftData.sections && (
              <div>
                <strong style={{ color: "#4b5563" }}>Sections:</strong>
                <ul style={{ margin: "8px 0", paddingLeft: "20px", color: "#4b5563" }}>
                  {Object.keys(draftData.sections).map((sectionName) => (
                    <li key={sectionName}>{sectionName}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            background: "#f0f4ff",
            padding: "24px",
            borderRadius: "8px",
            textAlign: "left",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#1e40af",
              marginBottom: "16px",
            }}
          >
            What happens next:
          </h2>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            <li
              style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: "12px",
              }}
            >
              <span
                style={{
                  color: "#4361ee",
                  marginRight: "8px",
                  fontSize: "18px",
                  lineHeight: "1.2",
                }}
              >
                ›
              </span>
              <span style={{ color: "#4b5563" }}>
                Go through each section one by one
              </span>
            </li>
            <li
              style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: "12px",
              }}
            >
              <span
                style={{
                  color: "#4361ee",
                  marginRight: "8px",
                  fontSize: "18px",
                  lineHeight: "1.2",
                }}
              >
                ›
              </span>
              <span style={{ color: "#4b5563" }}>
                Edit the pre-filled content or add your own
              </span>
            </li>
            <li
              style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: "12px",
              }}
            >
              <span
                style={{
                  color: "#4361ee",
                  marginRight: "8px",
                  fontSize: "18px",
                  lineHeight: "1.2",
                }}
              >
                ›
              </span>
              <span style={{ color: "#4b5563" }}>
                Use our AI assistant to improve any section
              </span>
            </li>
            <li
              style={{
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  color: "#4361ee",
                  marginRight: "8px",
                  fontSize: "18px",
                  lineHeight: "1.2",
                }}
              >
                ›
              </span>
              <span style={{ color: "#4b5563" }}>
                Review and export when you're done
              </span>
            </li>
          </ul>
        </div>

        <button
          onClick={onStartEditing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "14px 28px",
            background: "#4361ee",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          Start Editing
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

export default DraftView;

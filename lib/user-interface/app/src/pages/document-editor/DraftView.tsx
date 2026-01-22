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
  const [loadingMessage, setLoadingMessage] = useState<string>("Loading draft...");
  const appContext = useContext(AppContext);

  useEffect(() => {
    const fetchDraftData = async () => {
      if (!appContext || !selectedNofo || !sessionId) return;

      try {
        setIsLoading(true);
        setLoadingMessage("Loading draft...");
        
        const apiClient = new ApiClient(appContext);
        const username = (await Auth.currentAuthenticatedUser()).username;
        
        // Get draft from database
        // getDraft() will wait if draft generation is in progress
        const currentDraft = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username,
          onProgress: (message: string, attempt: number, maxAttempts: number) => {
            setLoadingMessage(message);
            if (attempt === 15) {
              setLoadingMessage("Draft generation is taking longer than expected. Please wait...");
            }
            if (attempt === 30) {
              setLoadingMessage("Draft generation is still in progress. This may take up to 2 minutes...");
            }
          }
        });

        if (currentDraft) {
          setDraftData(currentDraft);
          setLoadingMessage("Draft loaded successfully!");
        } else {
          setLoadingMessage("Draft not found");
        }
      } catch (error) {
        console.error("Error loading draft data:", error);
        setLoadingMessage("Failed to load draft");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDraftData();
  }, [appContext, selectedNofo, sessionId]);

  if (isLoading) {
    return (
      <div 
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading draft"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "60vh",
          padding: "32px"
        }}
      >
        <div 
          role="img"
          aria-label="Loading spinner"
          style={{
            width: "40px",
            height: "40px",
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #3498db",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginBottom: "16px"
          }}
        ></div>
        <p 
          id="draft-loading-message"
          style={{ color: "#5a6169", fontSize: "16px", marginBottom: "8px", textAlign: "center" }}
        >
          {loadingMessage}
        </p>
        {loadingMessage.includes("generation") && (
          <p 
            id="draft-loading-help"
            style={{ color: "#9ca3af", fontSize: "14px", textAlign: "center", maxWidth: "400px" }}
          >
            This may take 30-60 seconds. Please don't close this page.
          </p>
        )}
        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "300px",
        background: "#f0f4ff",
        padding: "32px",
        borderRadius: "8px",
        textAlign: "center",
      }}
    >
      <h2 style={{ color: "#1e40af", fontSize: "22px", fontWeight: 700, marginBottom: "16px" }}>
        Draft Created Successfully!
      </h2>
      <p style={{ color: "#374151", fontSize: "16px", marginBottom: "32px" }}>
        Your draft has been created. You can now start editing your application.
      </p>
      <button
        onClick={onStartEditing}
        style={{
          padding: "12px 32px",
          background: "#14558F",
          color: "white",
          border: "none",
          borderRadius: "6px",
          fontSize: "18px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Start Editing
      </button>
    </div>
  );
};

export default DraftView;

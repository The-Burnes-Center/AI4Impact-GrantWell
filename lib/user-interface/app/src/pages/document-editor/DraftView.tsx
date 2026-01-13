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

import React, { useState, useEffect } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { Auth } from "aws-amplify";
import type { DocumentDraft } from "../../common/api-client/drafts-client";
import "../../styles/document-editor.css";

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
  const [draftData, setDraftData] = useState<DocumentDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string>("Loading draft...");
  const apiClient = useApiClient();

  useEffect(() => {
    const fetchDraftData = async () => {
      if (!selectedNofo || !sessionId) return;

      try {
        setIsLoading(true);
        setLoadingMessage("Loading draft...");
        
        const username = (await Auth.currentAuthenticatedUser()).username;
        
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
  }, [apiClient, selectedNofo, sessionId]);

  if (isLoading) {
    return (
      <div 
        className="dv-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading draft"
      >
        <div className="dv-spinner" role="img" aria-label="Loading spinner" />
        <p className="dv-loading__message">{loadingMessage}</p>
        {loadingMessage.includes("generation") && (
          <p className="dv-loading__help">
            This may take 30-60 seconds. Please don't close this page.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="dv-success">
      <h2 className="dv-success__title">Draft Created Successfully!</h2>
      <p className="dv-success__text">
        Your draft has been created. You can now start editing your application.
      </p>
      <button className="dv-success__btn" onClick={onStartEditing}>
        Start Editing
      </button>
    </div>
  );
};

export default DraftView;

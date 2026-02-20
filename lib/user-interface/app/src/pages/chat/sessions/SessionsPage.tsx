import { useState, useEffect } from "react";
import Sessions from "../../../components/chat/SessionList";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useApiClient } from "../../../hooks/use-api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import UnifiedNavigation from "../../../components/navigation/UnifiedNavigation";
import "../../../styles/dashboard.css";

export default function SessionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");
  const apiClient = useApiClient();
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the latest session ID when the component mounts
  useEffect(() => {
    const fetchLatestSession = async () => {
      setIsLoading(true);
      try {
        const username = await Auth.currentAuthenticatedUser().then(
          (value) => value.username
        );

        if (username) {
          const result = await apiClient.sessions.getSessions(
            username,
            documentIdentifier,
            true
          );

          // If there are sessions, set the latest one's ID
          if (result && result.length > 0) {
            // Sort by timestamp to get the most recent session
            const sortedSessions = [...result].sort(
              (a, b) =>
                new Date(b.time_stamp).getTime() -
                new Date(a.time_stamp).getTime()
            );
            setLatestSessionId(sortedSessions[0].session_id);
          } else {
            // If no sessions exist, create a session ID anyway for the Chat button
            setLatestSessionId(uuidv4());
          }
        }
      } catch (e) {
        console.error("Error fetching latest session:", e);
        // If there's an error, still set a fallback session ID
        setLatestSessionId(uuidv4());
      } finally {
        setIsLoading(false);
      }
    };

    fetchLatestSession();
  }, [apiClient, documentIdentifier]);

  // Handle navigation when a session is selected
  const handleSessionSelect = (sessionId: string) => {
    setLatestSessionId(sessionId);

    // Navigate to the chatbot playground with the selected session ID and document identifier
    const queryParams = documentIdentifier
      ? `?folder=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/chat/${sessionId}${queryParams}`);
  };

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <nav aria-label="Application navigation" style={{ flexShrink: 0 }}>
        <UnifiedNavigation />
      </nav>
      <div className="dashboard-container" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <div className="breadcrumb-item">
            <button
              className="breadcrumb-link"
              onClick={handleHomeClick}
            >
              Home
            </button>
          </div>
          <div className="breadcrumb-item" aria-current="page">
            Sessions
          </div>
        </nav>

        <div className="dashboard-main-content">
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "48px" }} role="status" aria-label="Loading sessions">
              <p style={{ color: "#6b7280" }}>Loading sessions...</p>
            </div>
          ) : (
            <Sessions
              toolsOpen={true}
              documentIdentifier={documentIdentifier}
              onSessionSelect={handleSessionSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}

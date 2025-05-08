import { useState, useEffect, useContext } from "react";
import BaseAppLayout from "../playground/base-app-layout";
import Sessions from "../../../components/chatbot/sessions";
import { CHATBOT_NAME } from "../../../common/constants";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ApiClient } from "../../../common/api-client/api-client";
import { AppContext } from "../../../common/app-context";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";

export default function SessionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");
  const appContext = useContext(AppContext);
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);

  // Fetch the latest session ID when the component mounts
  useEffect(() => {
    const fetchLatestSession = async () => {
      if (!appContext) return;

      try {
        const apiClient = new ApiClient(appContext);
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
      }
    };

    fetchLatestSession();
  }, [appContext, documentIdentifier]);

  // Handle navigation when a session is selected
  const handleSessionSelect = (sessionId: string) => {
    setLatestSessionId(sessionId);

    // Navigate to the chatbot playground with the selected session ID and document identifier
    const queryParams = documentIdentifier
      ? `?folder=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/chatbot/playground/${sessionId}${queryParams}`);
  };

  // Styles for the breadcrumbs
  const breadcrumbsContainerStyle = {
    padding: "8px 0",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
  };

  const breadcrumbLinkStyle = {
    color: "#0073bb",
    textDecoration: "none",
    cursor: "pointer",
  };

  const breadcrumbSeparatorStyle = {
    margin: "0 8px",
    color: "#5f6b7a",
  };

  const breadcrumbCurrentStyle = {
    color: "#5f6b7a",
    fontWeight: 400,
  };

  // Handle navigation
  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Include document identifier in the navigation if available
    const queryParams = documentIdentifier
      ? `?folder=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/${queryParams}`);
  };

  return (
    <BaseAppLayout
      header={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "white",
          }}
        >
          <nav style={breadcrumbsContainerStyle} aria-label="Breadcrumbs">
            <a href="/" style={breadcrumbLinkStyle} onClick={handleHomeClick}>
              {CHATBOT_NAME}
            </a>
            <span style={breadcrumbSeparatorStyle}>/</span>
            <span style={breadcrumbCurrentStyle}>Sessions</span>
          </nav>
        </div>
      }
      documentIdentifier={documentIdentifier}
      sessionId={latestSessionId}
      content={
        <Sessions
          toolsOpen={true}
          documentIdentifier={documentIdentifier}
          onSessionSelect={handleSessionSelect}
        />
      }
    />
  );
}

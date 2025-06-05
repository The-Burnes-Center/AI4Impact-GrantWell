import { useState, useEffect, useContext } from "react";
import BaseAppLayout from "../chatbot/playground/base-app-layout";
import Drafts from "../../components/document-editor/drafts";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppContext } from "../../common/app-context";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { DraftsClient } from "../../common/api-client/drafts-client";

export default function DraftsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("nofo");
  const appContext = useContext(AppContext);
  const [latestDraftId, setLatestDraftId] = useState<string | null>(null);

  // Fetch the latest draft ID when the component mounts
  useEffect(() => {
    const fetchLatestDraft = async () => {
      if (!appContext) return;

      try {
        const draftsClient = new DraftsClient(appContext);
        const username = await Auth.currentAuthenticatedUser().then(
          (value) => value.username
        );

        if (username) {
          const result = await draftsClient.getDrafts(
            username,
            documentIdentifier,
            true
          );

          // If there are drafts, set the latest one's ID
          if (result && result.length > 0) {
            // Sort by timestamp to get the most recent draft
            const sortedDrafts = [...result].sort(
              (a, b) =>
                new Date(b.lastModified).getTime() -
                new Date(a.lastModified).getTime()
            );
            setLatestDraftId(sortedDrafts[0].sessionId);
          } else {
            // If no drafts exist, create a draft ID anyway for the New Draft button
            setLatestDraftId(uuidv4());
          }
        }
      } catch (e) {
        console.error("Error fetching latest draft:", e);
        // If there's an error, still set a fallback draft ID
        setLatestDraftId(uuidv4());
      }
    };

    fetchLatestDraft();
  }, [appContext, documentIdentifier]);

  // Handle navigation when a draft is selected
  const handleDraftSelect = (sessionId: string) => {
    setLatestDraftId(sessionId);
    navigate(`/document-editor/${sessionId}`);
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
      ? `?nofo=${encodeURIComponent(documentIdentifier)}`
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
              GrantWell
            </a>
            <span style={breadcrumbSeparatorStyle}>/</span>
            <span style={breadcrumbCurrentStyle}>Document Drafts</span>
          </nav>
        </div>
      }
      documentIdentifier={documentIdentifier}
      sessionId={latestDraftId}
      content={
        <Drafts
          documentIdentifier={documentIdentifier}
          onDraftSelect={handleDraftSelect}
        />
      }
    />
  );
} 
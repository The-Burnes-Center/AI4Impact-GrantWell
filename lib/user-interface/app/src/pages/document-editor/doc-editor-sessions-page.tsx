import { useState, useEffect, useContext } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import DocEditorSessions from "../../components/document-editor/doc-editor-sessions";

export default function DocEditorSessionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("nofo");
  const appContext = useContext(AppContext);
  const [latestDraftId, setLatestDraftId] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatestDraft = async () => {
      if (!appContext) return;

      try {
        const apiClient = new ApiClient(appContext);
        const username = await Auth.currentAuthenticatedUser().then(
          (value) => value.username
        );

        if (username) {
          const result = await apiClient.drafts.getDrafts(username, documentIdentifier);

          if (result && result.length > 0) {
            const sortedDrafts = [...result].sort(
              (a, b) =>
                new Date(b.lastModified).getTime() -
                new Date(a.lastModified).getTime()
            );
            setLatestDraftId(sortedDrafts[0].sessionId);
          } else {
            setLatestDraftId(uuidv4());
          }
        }
      } catch (e) {
        console.error("Error fetching latest draft:", e);
        setLatestDraftId(uuidv4());
      }
    };

    fetchLatestDraft();
  }, [appContext, documentIdentifier]);

  const handleDraftSelect = (draftId: string) => {
    setLatestDraftId(draftId);
    const queryParams = documentIdentifier
      ? `?nofo=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/document-editor${queryParams}`);
  };

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

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const queryParams = documentIdentifier
      ? `?nofo=${encodeURIComponent(documentIdentifier)}`
      : "";
    navigate(`/${queryParams}`);
  };

  return (
    <div>
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
          <span style={breadcrumbCurrentStyle}>Drafts</span>
        </nav>
      </div>
      <DocEditorSessions
        toolsOpen={true}
        documentIdentifier={documentIdentifier}
        onSessionSelect={handleDraftSelect}
      />
    </div>
  );
} 
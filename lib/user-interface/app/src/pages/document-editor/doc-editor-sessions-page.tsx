import { useState, useEffect, useContext } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import DocEditorSessions from "../../components/document-editor/doc-editor-sessions";
import DocumentNavigation from "./document-navigation";

export default function DocEditorSessionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("nofo");
  const appContext = useContext(AppContext);
  const [latestDraftId, setLatestDraftId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const handleDraftSelect = async (draftId: string) => {
    setLatestDraftId(draftId);
    try {
      const apiClient = new ApiClient(appContext);
      const username = await Auth.currentAuthenticatedUser().then(
        (value) => value.username
      );

      if (username) {
        const drafts = await apiClient.drafts.getDrafts(username);
        const selectedDraft = drafts.find(draft => draft.sessionId === draftId);
        if (!selectedDraft || !selectedDraft.documentIdentifier) {
          console.error("Could not find draft or its NOFO identifier");
          return;
        }
        const queryParams = `?step=projectBasics&nofo=${encodeURIComponent(selectedDraft.documentIdentifier)}`;
        navigate(`/document-editor/${draftId}${queryParams}`);
      }
    } catch (e) {
      console.error("Error fetching draft:", e);
    }
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

  const handleNavigateToStep = (step: string) => {
    if (latestDraftId) {
      const queryParams = documentIdentifier
        ? `?step=${step}&nofo=${encodeURIComponent(documentIdentifier)}`
        : `?step=${step}`;
      navigate(`/document-editor/${latestDraftId}${queryParams}`);
    }
  };

  return (
    <div className="document-editor-root" style={{ display: "flex", minHeight: "100vh" }}>
      <DocumentNavigation
        documentIdentifier={documentIdentifier || undefined}
        currentStep="drafts"
        onNavigate={handleNavigateToStep}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      <div
        className="document-content"
        style={{
          marginLeft: sidebarOpen ? "240px" : "60px",
          transition: "margin-left 0.3s ease",
          width: `calc(100% - ${sidebarOpen ? "240px" : "60px"})`,
          display: "flex",
          flexDirection: "column",
        }}
      >
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
    </div>
  );
} 
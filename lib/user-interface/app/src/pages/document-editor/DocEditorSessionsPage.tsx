import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useApiClient } from "../../hooks/use-api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { statusToStep } from "../../common/helpers/document-editor-utils";
import DocEditorSessions from "../../components/document-editor/DocEditorSessions";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import "../../styles/dashboard.css";

export default function DocEditorSessionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const apiClient = useApiClient();
  const [latestDraftId, setLatestDraftId] = useState<string | null>(null);
  const [showAllNOFOs, setShowAllNOFOs] = useState(false);

  // Get documentIdentifier from URL params or query params
  const docId = params.documentIdentifier || searchParams.get('folder') || searchParams.get('nofo') || null;

  useEffect(() => {
    const fetchLatestDraft = async () => {
      try {
        const username = await Auth.currentAuthenticatedUser().then(
          (value) => value.username
        );

        if (username) {
          // Get all drafts regardless of NOFO
          const result = await apiClient.drafts.getDrafts(username, null);

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
  }, [apiClient]);

  const handleDraftSelect = async (draftId: string) => {
    setLatestDraftId(draftId);
    try {
      const username = await Auth.currentAuthenticatedUser().then(
        (value) => value.username
      );

      if (username) {
        // Get full draft details to check status
        const selectedDraft = await apiClient.drafts.getDraft({
          sessionId: draftId,
          userId: username
        });
        
        if (!selectedDraft || !selectedDraft.documentIdentifier) {
          console.error("Could not find draft or its NOFO identifier");
          return;
        }
        
        const status = selectedDraft.status || 'project_basics';
        const step = statusToStep(status);
        
        const queryParams = `?step=${step}&nofo=${encodeURIComponent(selectedDraft.documentIdentifier)}`;
        navigate(`/document-editor/${draftId}${queryParams}`);
      }
    } catch (e) {
      console.error("Error fetching draft:", e);
    }
  };

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <nav aria-label="Application navigation" style={{ flexShrink: 0 }}>
        <UnifiedNavigation
          documentIdentifier={docId || undefined}
        />
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
            Drafts
          </div>
        </nav>

        <div className="dashboard-main-content">
          <DocEditorSessions
            toolsOpen={true}
            documentIdentifier={showAllNOFOs ? null : docId}
            onSessionSelect={handleDraftSelect}
            showAllNOFOs={showAllNOFOs}
            onToggleShowAllNOFOs={() => setShowAllNOFOs(!showAllNOFOs)}
            hasDocId={!!docId}
          />
        </div>
      </div>
    </div>
  );
} 
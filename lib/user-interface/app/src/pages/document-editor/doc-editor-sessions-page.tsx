import { useState, useEffect, useContext } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import DocEditorSessions from "../../components/document-editor/doc-editor-sessions";
import UnifiedNavigation from "../../components/unified-navigation";
import "../Dashboard/styles.css";

export default function DocEditorSessionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const appContext = useContext(AppContext);
  const [latestDraftId, setLatestDraftId] = useState<string | null>(null);
  const [showAllNOFOs, setShowAllNOFOs] = useState(false);

  // Get documentIdentifier from URL params or query params
  const docId = params.documentIdentifier || searchParams.get('folder') || searchParams.get('nofo') || null;

  useEffect(() => {
    const fetchLatestDraft = async () => {
      if (!appContext) return;

      try {
        const apiClient = new ApiClient(appContext);
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
  }, [appContext]);

  const handleDraftSelect = async (draftId: string) => {
    setLatestDraftId(draftId);
    try {
      const apiClient = new ApiClient(appContext);
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
        
        // Determine step based on status
        let step = 'projectBasics';
        const status = selectedDraft.status || 'nofo_selected';
        
        switch (status) {
          case 'nofo_selected':
            // NOFO selected but no project basics yet - go directly to project basics
            step = 'projectBasics';
            break;
          case 'in_progress':
            // Check which section they're on
            if (selectedDraft.projectBasics && Object.keys(selectedDraft.projectBasics).length > 0) {
              if (selectedDraft.questionnaire && Object.keys(selectedDraft.questionnaire).length > 0) {
                // Both project basics and questionnaire done
                // Check if draft sections exist - if yes, go to draftCreated, otherwise uploadDocuments
                if (selectedDraft.sections && Object.keys(selectedDraft.sections).length > 0) {
                  step = 'draftCreated';
                } else {
                  step = 'uploadDocuments';
                }
              } else {
                // Project basics done, go to questionnaire
                step = 'questionnaire';
              }
            } else {
              // No project basics, start there
              step = 'projectBasics';
            }
            break;
          case 'draft_generated':
            // Draft has been generated, go directly to draftCreated view
            step = 'draftCreated';
            break;
          case 'review_ready':
            // Ready for review
            step = 'reviewApplication';
            break;
          case 'submitted':
            // Already submitted, go to review
            step = 'reviewApplication';
            break;
          default:
            step = 'projectBasics';
        }
        
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
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                color: "inherit",
                textDecoration: "underline",
              }}
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
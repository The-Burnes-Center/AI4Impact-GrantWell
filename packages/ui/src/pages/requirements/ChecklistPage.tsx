import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams, useLocation, useNavigate, useSearchParams } from "react-router";
import ModelMarkdown from "../../components/common/ModelMarkdown";
import { citationSup } from "../../components/chat/citation-sup";
import { remarkCitationMarkers } from "../../components/chat/citations";
import { EMPTY_TAB, requirementsMarkdown, type TabText } from "./requirements-markdown";
import { LuUser, LuFileText, LuList, LuClock, LuInfo } from "react-icons/lu";
import { useApiClient } from "../../hooks/use-api-client";
import { useInert } from "../../hooks/use-inert";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import HelpModal from "./components/HelpModal";
import { GRANT_TYPES, grantTypeTint, type GrantTypeId } from "../../common/types/nofo";
import { GrantInReviewError } from "../../common/api-client/grant-in-review";
import "../../styles/checklists.css";

function RequirementsList({ text }: { text: TabText }) {
  const plugins = React.useMemo(() => (text.citations.length ? [remarkCitationMarkers(text.citations)] : []), [text.citations]);
  const sup = React.useMemo(() => citationSup(text.citations), [text.citations]);
  return (
    <ModelMarkdown className="custom-markdown" remarkPlugins={plugins} components={{ sup }}>
      {text.markdown}
    </ModelMarkdown>
  );
}

interface LlmData {
  grantName: string;
  eligibility: TabText;
  documents: TabText;
  narrative: TabText;
  deadlines: TabText;
}

const TAB_IDS = ["eligibility", "documents", "narrative", "deadlines"] as const;
type TabId = typeof TAB_IDS[number];

const TAB_CONFIG: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "eligibility", label: "Eligibility", icon: <LuUser size={18} aria-hidden="true" /> },
  { id: "documents", label: "Required documents", icon: <LuFileText size={18} aria-hidden="true" /> },
  { id: "narrative", label: "Narrative sections", icon: <LuList size={18} aria-hidden="true" /> },
  { id: "deadlines", label: "Key deadlines", icon: <LuClock size={18} aria-hidden="true" /> },
];

const Checklists: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { documentIdentifier } = useParams<{ documentIdentifier: string }>();
  const [searchParams] = useSearchParams();
  const folderParam =
    searchParams.get("grant") ?? searchParams.get("folder") ?? searchParams.get("nofo") ?? documentIdentifier;
  const apiClient = useApiClient();

  const [llmData, setLlmData] = useState<LlmData>({ grantName: "", eligibility: EMPTY_TAB, documents: EMPTY_TAB, narrative: EMPTY_TAB, deadlines: EMPTY_TAB });
  const [grantType, setGrantType] = useState<GrantTypeId | null>(null);
  const [stateGuidance, setStateGuidance] = useState<{ stateName: string; note: string } | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [inReviewMessage, setInReviewMessage] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<TabId>("eligibility");
  const [showHelp, setShowHelp] = useState(false);
  const inertMainRef = useInert<HTMLDivElement>(showHelp);

  // Show help modal automatically on first visit
  useEffect(() => {
    if (!isLoading && !localStorage.getItem("checklistsHelpSeen")) {
      setShowHelp(true);
    }
  }, [isLoading]);

  // Handle URL hash for direct tab access
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as TabId;
    if (TAB_IDS.includes(hash)) setActiveTabId(hash);
  }, [location]);

  // Fetch NOFO summary data
  useEffect(() => {
    if (!documentIdentifier) return;

    // The summary answers 403 for a grant with no metadata row, and an admin gets a 500 when its files are gone.
    const grantIsMissing = async (err: unknown) => {
      if ((err as { status?: number })?.status === 404 || (err as Error)?.message === "ACCESS_DENIED_STATE") return true;
      try {
        const nofoResult = await apiClient.landingPage.getNOFOs();
        return Array.isArray(nofoResult?.nofoData) && !nofoResult.nofoData.some((n: { name: string }) => n.name === documentIdentifier);
      } catch {
        return false;
      }
    };

    const fetchData = async () => {
      try {
        const result = await apiClient.landingPage.getNOFOSummary(documentIdentifier, { citations: true });

        try {
          const nofoResult = await apiClient.landingPage.getNOFOs();
          if (nofoResult.nofoData) {
            const match = nofoResult.nofoData.find((n: { name: string; grant_type?: string }) => n.name === documentIdentifier);
            if (match) setGrantType(match.grant_type || null);
          }
        } catch { /* grant type is optional */ }

        setLlmData({
          grantName: result.data.GrantName || "Grant",
          eligibility: requirementsMarkdown(result.data.EligibilityCriteria),
          documents: requirementsMarkdown(result.data.RequiredDocuments),
          narrative: requirementsMarkdown(result.data.ProjectNarrativeSections),
          deadlines: requirementsMarkdown(result.data.KeyDeadlines),
        });

        // Server merges the viewer's own state's overlay onto federal grants (if any).
        const guidance = (result.data as { stateGuidance?: { stateName?: string; note?: string } }).stateGuidance;
        setStateGuidance(guidance?.note ? { stateName: guidance.stateName || "your state", note: guidance.note } : null);
      } catch (err) {
        console.error("Error loading NOFO summary:", err);
        if (err instanceof GrantInReviewError) setInReviewMessage(err.message);
        else if (await grantIsMissing(err)) setNotFound(true);
        else setError("Failed to load grant requirements. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [documentIdentifier, apiClient]);

  // Redirect if no NOFO selected
  useEffect(() => {
    if (!isLoading && !folderParam && !documentIdentifier) {
      navigate("/");
    }
  }, [isLoading, folderParam, documentIdentifier, navigate]);

  const handleTabClick = useCallback((tabId: TabId) => {
    setActiveTabId(tabId);
    window.location.hash = tabId;
    setTimeout(() => document.getElementById(`tab-${tabId}`)?.focus(), 0);
  }, []);

  const handleTabsKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = TAB_IDS.indexOf(activeTabId);
    if (e.key === "ArrowRight") { e.preventDefault(); handleTabClick(TAB_IDS[(idx + 1) % TAB_IDS.length]); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); handleTabClick(TAB_IDS[(idx - 1 + TAB_IDS.length) % TAB_IDS.length]); }
    else if (e.key === "Home") { e.preventDefault(); handleTabClick(TAB_IDS[0]); }
    else if (e.key === "End") { e.preventDefault(); handleTabClick(TAB_IDS[TAB_IDS.length - 1]); }
  }, [activeTabId, handleTabClick]);

  const tabContents: Record<TabId, { title: string; content: TabText }> = {
    eligibility: { title: "Ensure you adhere to the extracted eligibility criteria before continuing with your application.", content: llmData.eligibility },
    documents: { title: "Include the following documents in your application.", content: llmData.documents },
    narrative: { title: "The following sections must be included in your application.", content: llmData.narrative },
    deadlines: { title: "Note the following key deadlines for this grant.", content: llmData.deadlines },
  };

  return (
    <div className="checklist-layout" style={{ flex: "1 0 auto" }}>
      <UnifiedNavigation documentIdentifier={folderParam} />

      <div ref={inertMainRef} className="checklist-main" aria-hidden={showHelp}>
        <div className="checklist-main-container">
          {isLoading ? (
            <>
            <h1 className="visually-hidden">Requirements</h1>
            <div className="checklist-loading" role="status" aria-live="polite">
              <div className="checklist-loading__spinner"><div className="loading-spinner" /></div>
              <h2 className="checklist-loading__title">Loading requirements</h2>
              <p className="checklist-loading__text">Retrieving grant information and requirements...</p>
              <div className="checklist-loading__tip">
                <span style={{ fontSize: "24px" }} aria-hidden="true">💡</span>
                <p className="checklist-loading__tip-text">
                  Our AI reviews eligibility criteria, deadlines, and requirements to save you hours of research time.
                </p>
              </div>
            </div>
            </>
          ) : inReviewMessage ? (
            <div className="checklist-error">
              <h1 className="checklist-error__title">{inReviewMessage}</h1>
              <Link className="gw-btn gw-btn--primary checklist-error__btn" to="/home">
                Go to home
              </Link>
            </div>
          ) : notFound ? (
            <div className="checklist-error">
              <h1 className="checklist-error__title">Grant not found</h1>
              <p className="checklist-error__text">
                We couldn&apos;t find this grant. It may have been removed, or the link is wrong.
              </p>
              <Link className="gw-btn gw-btn--primary checklist-error__btn" to="/home">
                Go to home
              </Link>
            </div>
          ) : error ? (
            <div className="checklist-error" role="alert">
              <h1 className="checklist-error__title">Unable to load requirements</h1>
              <p className="checklist-error__text">{error}</p>
              <button className="gw-btn gw-btn--primary checklist-error__btn" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          ) : (
            <div className="checklist-content">
              <div className="checklist-content__header">
                <div className="checklist-content__header-inner">
                  <h1 className="checklist-content__heading">
                    Requirements for{" "}
                    <span className="checklist-content__heading-accent">{llmData.grantName}</span>
                    {grantType && GRANT_TYPES[grantType] && (
                      <>
                        <span className="visually-hidden">,</span>{" "}
                        <span
                          className="gw-tag checklist-grant-badge"
                          style={{
                            backgroundColor: grantTypeTint(GRANT_TYPES[grantType].color, 8),
                            color: GRANT_TYPES[grantType].color,
                            border: `1px solid ${grantTypeTint(GRANT_TYPES[grantType].color, 25)}`,
                          }}
                        >
                          {GRANT_TYPES[grantType].label}
                        </span>
                      </>
                    )}
                  </h1>
                  <p className="checklist-content__description">
                    Key requirement checkpoints for this grant. Review these
                    requirements to ensure eligibility and understand what documents and narrative sections
                    you&#39;ll need to prepare.
                  </p>
                </div>
                <button className="gw-btn gw-btn--secondary checklist-help-btn" onClick={() => setShowHelp(true)}>
                  <LuInfo size={16} aria-hidden="true" /> Help
                </button>
              </div>

              {stateGuidance && (
                <div role="note" className="gw-alert gw-alert--info checklist-state-guidance">
                  <div>
                    <h2 className="gw-alert__title">Additional guidance for {stateGuidance.stateName}</h2>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{stateGuidance.note}</p>
                  </div>
                </div>
              )}

              <div className="checklist-tabs">
                <div className="gw-tabs checklist-tabs__header" role="tablist" tabIndex={-1} aria-label="Grant requirements" onKeyDown={handleTabsKeyDown}>
                  {TAB_CONFIG.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    return (
                      <button
                        key={tab.id}
                        className={`gw-tab checklist-tab${isActive ? " checklist-tab--active" : ""}`}
                        onClick={() => handleTabClick(tab.id)}
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tab.id}`}
                        id={`tab-${tab.id}`}
                      >
                        {tab.icon} {tab.label}
                      </button>
                    );
                  })}
                </div>

                {TAB_IDS.map((tabId) => (
                  <div
                    key={tabId}
                    className="checklist-tabs__content"
                    style={{ display: tabId === activeTabId ? "block" : "none" }}
                    role="tabpanel"
                    id={`tabpanel-${tabId}`}
                    aria-labelledby={`tab-${tabId}`}
                    hidden={tabId !== activeTabId}
                    tabIndex={0}
                  >
                    <p className="checklist-content__description">{tabContents[tabId].title}</p>
                    <div className="checklist-tabs__markdown">
                      <RequirementsList text={tabContents[tabId].content} />

                      {tabId === "eligibility" && (
                        <div className="gw-alert gw-alert--info checklist-info-box">
                          <LuInfo size={20} aria-hidden="true" />
                          <div>
                            <h2 className="gw-alert__title">Not sure if your organization qualifies?</h2>
                            <p className="checklist-info-box__text">
                              Chat with AI can help assess your organization&#39;s eligibility based on
                              these criteria. Click &quot;Chat with AI&quot; in the navigation panel
                              and ask: &quot;Is my organization eligible for this grant?&quot;
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="checklist-content__note">
                Note: Always refer to the official grant documentation for final requirements and details.
              </p>
            </div>
          )}
        </div>
      </div>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};

export default Checklists;

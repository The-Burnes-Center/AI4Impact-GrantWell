import React, { useState, useEffect, useCallback } from "react";
import { useParams, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { LuUser, LuFileText, LuList, LuClock, LuInfo } from "react-icons/lu";
import { useApiClient } from "../../hooks/use-api-client";
import { useHeaderOffset } from "../../hooks/use-header-offset";
import { v4 as uuidv4 } from "uuid";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import HelpModal from "./components/HelpModal";
import type { GrantTypeId } from "../../common/types/nofo";
import "../../styles/checklists.css";

const GRANT_TYPES: Record<string, { label: string; color: string }> = {
  federal: { label: "Federal", color: "#1a4480" },
  state: { label: "State", color: "#2e8540" },
  quasi: { label: "Quasi", color: "#8168b3" },
  philanthropic: { label: "Philanthropic", color: "#e66f0e" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

interface LlmData {
  grantName: string;
  eligibility: string;
  documents: string;
  narrative: string;
  deadlines: string;
}

const TAB_IDS = ["eligibility", "documents", "narrative", "deadlines"] as const;
type TabId = typeof TAB_IDS[number];

const TAB_CONFIG: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "eligibility", label: "Eligibility", icon: <LuUser size={18} /> },
  { id: "documents", label: "Required Documents", icon: <LuFileText size={18} /> },
  { id: "narrative", label: "Narrative Sections", icon: <LuList size={18} /> },
  { id: "deadlines", label: "Key Deadlines", icon: <LuClock size={18} /> },
];

const Checklists: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { documentIdentifier } = useParams<{ documentIdentifier: string }>();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder") || documentIdentifier;
  const apiClient = useApiClient();
  const topOffset = useHeaderOffset();

  const [llmData, setLlmData] = useState<LlmData>({ grantName: "", eligibility: "", documents: "", narrative: "", deadlines: "" });
  const [grantType, setGrantType] = useState<GrantTypeId | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<TabId>("eligibility");
  const [showHelp, setShowHelp] = useState(false);

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

    const processApiItems = (items: any[]) => {
      if (!items || !Array.isArray(items)) return "";
      return items
        .map((section) => {
          const itemText = section.item !== undefined
            ? (typeof section.item === "object" ? JSON.stringify(section.item) : String(section.item))
            : "Unknown";
          const descText = section.description !== undefined
            ? (typeof section.description === "object" ? JSON.stringify(section.description) : String(section.description))
            : "No description";
          return `- **${itemText}**: ${descText}`;
        })
        .join("\n");
    };

    const fetchData = async () => {
      try {
        const result = await apiClient.landingPage.getNOFOSummary(documentIdentifier);

        try {
          const nofoResult = await apiClient.landingPage.getNOFOs();
          if (nofoResult.nofoData) {
            const match = nofoResult.nofoData.find((n: any) => n.name === documentIdentifier);
            if (match) setGrantType(match.grant_type || null);
          }
        } catch { /* grant type is optional */ }

        setLlmData({
          grantName: result.data.GrantName || "Grant",
          eligibility: processApiItems(result.data.EligibilityCriteria),
          documents: processApiItems(result.data.RequiredDocuments),
          narrative: processApiItems(result.data.ProjectNarrativeSections),
          deadlines: processApiItems(result.data.KeyDeadlines),
        });
      } catch (err) {
        console.error("Error loading NOFO summary:", err);
        setError("Failed to load grant requirements. Please try again.");
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

  const linkUrl = `/chat/${uuidv4()}?folder=${encodeURIComponent(documentIdentifier || "")}`;

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

  const tabContents: Record<TabId, { title: string; content: string }> = {
    eligibility: { title: "Ensure you adhere to the extracted eligibility criteria before continuing with your application.", content: llmData.eligibility },
    documents: { title: "Include the following documents in your proposal.", content: llmData.documents },
    narrative: { title: "The following sections must be included in the project narrative.", content: llmData.narrative },
    deadlines: { title: "Note the following key deadlines for this grant.", content: llmData.deadlines },
  };

  return (
    <div className="checklist-layout" style={{ minHeight: `calc(100vh - ${topOffset}px)` }}>
      <nav aria-label="Requirements navigation" aria-hidden={showHelp} style={{ margin: 0, padding: 0, flexShrink: 0 }}>
        <UnifiedNavigation documentIdentifier={folderParam} />
      </nav>

      <div className="checklist-main" aria-hidden={showHelp}>
        <div className="checklist-main-container">
          {isLoading ? (
            <div className="checklist-loading">
              <div className="checklist-loading__spinner"><div className="loading-spinner" /></div>
              <h2 className="checklist-loading__title">Loading NOFO Data</h2>
              <p className="checklist-loading__text">Retrieving grant information and requirements...</p>
              <div className="checklist-loading__tip">
                <span style={{ fontSize: "24px" }}>💡</span>
                <p className="checklist-loading__tip-text">
                  Our AI reviews eligibility criteria, deadlines, and requirements to save you hours of research time.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="checklist-error">
              <h2 className="checklist-error__title">Unable to Load Requirements</h2>
              <p className="checklist-error__text">{error}</p>
              <button className="checklist-error__btn" onClick={() => window.location.reload()}>
                Try Again
              </button>
            </div>
          ) : (
            <div className="checklist-content">
              <div className="checklist-content__header">
                <div className="checklist-content__header-inner">
                  <h1 className="checklist-content__heading">
                    <span>Application Requirements for </span>
                    <span className="checklist-content__heading-accent">{llmData.grantName}</span>
                    {grantType && GRANT_TYPES[grantType] && (
                      <span
                        className="checklist-grant-badge"
                        style={{
                          backgroundColor: `${GRANT_TYPES[grantType].color}15`,
                          color: GRANT_TYPES[grantType].color,
                          border: `1px solid ${GRANT_TYPES[grantType].color}40`,
                        }}
                      >
                        {GRANT_TYPES[grantType].label}
                      </span>
                    )}
                  </h1>
                  <p className="checklist-content__description">
                    Key requirement checkpoints for this Notice of Funding Opportunity (NOFO). Review these
                    requirements to ensure eligibility and understand what documents and narrative sections
                    you&#39;ll need to prepare.
                  </p>
                </div>
                <button className="checklist-help-btn" onClick={() => setShowHelp(true)}>
                  <LuInfo size={16} /> Help
                </button>
              </div>

              <div className="checklist-tabs">
                <div className="checklist-tabs__header" role="tablist" aria-label="Grant requirements" onKeyDown={handleTabsKeyDown}>
                  {TAB_CONFIG.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    return (
                      <button
                        key={tab.id}
                        className={`checklist-tab${isActive ? " checklist-tab--active" : ""}`}
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
                  >
                    <p className="checklist-content__description">{tabContents[tabId].title}</p>
                    <div className="checklist-tabs__markdown">
                      <ReactMarkdown className="custom-markdown">
                        {tabContents[tabId].content}
                      </ReactMarkdown>

                      {tabId === "eligibility" && (
                        <div className="checklist-info-box">
                          <LuInfo size={22} color="#14558F" />
                          <div>
                            <p className="checklist-info-box__title">Not sure if your organization qualifies?</p>
                            <p className="checklist-info-box__text">
                              Our AI-powered chatbot can help assess your organization&#39;s eligibility based on
                              these criteria. Click the &quot;Chat with AI&quot; button in the navigation panel
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
                Note: Always refer to the official NOFO documentation for final requirements and details.
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

import React, { useState, useEffect, useCallback } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { Auth } from "aws-amplify";
import {
  Save,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle,
  History,
  Undo2,
} from "lucide-react";
import SectionsSidebar from "./components/SectionsSidebar";
import AutoSaveIndicator from "../../components/ui/AutoSaveIndicator";
import VersionHistoryPanel from "../../components/document-editor/VersionHistoryPanel";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import { readDraftCache, writeDraftCache } from "../../common/helpers/document-editor-utils";
import type { DraftJobStatus, DraftVersionMeta } from "../../common/api-client/drafts-client";
import type { useDraftSave } from "../../hooks/use-draft-save";
import "../../styles/document-editor.css";

interface SectionEditorProps {
  onContinue: () => void;
  selectedNofo: string | null;
  sessionId: string;
  onNavigate: (step: string) => void;
  activeJobId?: string;
  isGenerating?: boolean;
  draftSave: ReturnType<typeof useDraftSave>;
}

interface Section {
  name: string;
  description: string;
}

const SectionEditor: React.FC<SectionEditorProps> = ({
  onContinue,
  selectedNofo,
  sessionId,
  onNavigate,
  activeJobId,
  isGenerating: initialIsGenerating,
  draftSave,
}) => {
  const [activeSection, setActiveSection] = useState(0);
  const [editorContent, setEditorContent] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<{
    [key: string]: string;
  }>({});
  const [, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState<string>("");
  const [generating, setGenerating] = useState(!!activeJobId && !!initialIsGenerating);
  const [failedSections, setFailedSections] = useState<string[]>([]);
  const [completedSectionCount, setCompletedSectionCount] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [labelPromptOpen, setLabelPromptOpen] = useState(false);
  const [undoCandidate, setUndoCandidate] = useState<DraftVersionMeta | null>(null);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const apiClient = useApiClient();
  const { saveFields, flush, saveStatus, retry } = draftSave;

  // Load sections from NOFO summary API
  useEffect(() => {
    const fetchSections = async () => {
      setLoading(true);

      try {
        if (selectedNofo) {
          const result = await apiClient.landingPage.getNOFOSummary(
            selectedNofo
          );

          if (result && result.data && result.data.ProjectNarrativeSections) {
            // Convert API sections to the format used by this component
            const apiSections = result.data.ProjectNarrativeSections;

            if (Array.isArray(apiSections) && apiSections.length > 0) {
              const formattedSections = apiSections.map((section: { item?: string; description?: string }) => ({
                name: section.item || "Untitled Section",
                description: section.description || "No description provided.",
              }));

              setSections(formattedSections);
            } else {
              setDefaultSections();
            }
          } else {
            setDefaultSections();
          }
        } else {
          setDefaultSections();
        }
      } catch (error) {
        console.error("Error loading NOFO narrative sections:", error);
        setDefaultSections();
      } finally {
        setLoading(false);
      }
    };

    const setDefaultSections = () => {
      const defaultSections = [
        { name: "Project Summary", description: "A brief summary of your project." },
        { name: "Statement of Need", description: "Explain the problem your project will solve." },
        { name: "Goals & Objectives", description: "List the goals and objectives of your project." },
        { name: "Project Activities", description: "Describe the main activities you will complete." },
        { name: "Evaluation Plan", description: "How will you measure success?" },
      ];
      setSections(defaultSections);
    };

    fetchSections();

    const fetchDraftSections = async () => {
      try {
        if (sessionId) {
          const username = (await Auth.currentAuthenticatedUser()).username;
          const draft = await apiClient.drafts.getDraft({
            sessionId: sessionId,
            userId: username
          });
          const cached = readDraftCache<Record<string, string>>(sessionId, "sections");
          setSectionAnswers({ ...(draft?.sections || {}), ...(cached || {}) });
        }
      } catch (error) {
        console.error("Error loading draft sections from API:", error);
        setSectionAnswers(readDraftCache<Record<string, string>>(sessionId, "sections") || {});
      }
    };

    if (!generating) {
      fetchDraftSections();
    }
  }, [selectedNofo, apiClient, sessionId, generating]);

  // ── Live polling when generation is in progress ───────────────────
  useEffect(() => {
    if (!activeJobId || !generating) return;

    const interval = setInterval(async () => {
      try {
        const jobStatus: DraftJobStatus = await apiClient.drafts.pollDraftJob(activeJobId);

        // Update sections as they arrive
        if (jobStatus.sections) {
          setSectionAnswers(prev => {
            const merged = { ...prev, ...jobStatus.sections };
            writeDraftCache(sessionId, "sections", merged);
            return merged;
          });
        }

        if (typeof jobStatus.completedSectionCount === 'number') {
          setCompletedSectionCount(prev => Math.max(prev, jobStatus.completedSectionCount!));
        }

        // Update editor if active section just completed and editor is empty
        if (sections[activeSection]) {
          const activeName = sections[activeSection].name;
          if (jobStatus.sections?.[activeName] && !sectionAnswers[activeName]) {
            setEditorContent(jobStatus.sections[activeName]);
          }
        }

        // Check for completion
        if (jobStatus.status === 'completed' || jobStatus.status === 'partial') {
          setGenerating(false);
          clearInterval(interval);
          if (jobStatus.failedSections?.length) {
            setFailedSections(jobStatus.failedSections);
          }
          try {
            await saveFields(
              {
                sections: { ...sectionAnswers, ...jobStatus.sections },
                status: 'editing_sections',
              },
              {
                changedSections: Object.keys(jobStatus.sections || {}),
                source: 'ai_generated',
                immediate: true,
              }
            );
          } catch (err) {
            console.error('Error saving completed draft:', err);
          }
        }

        if (jobStatus.status === 'error') {
          setGenerating(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Error polling draft job:', err);
        // Continue polling on transient errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId, generating, apiClient, sections, activeSection, sectionAnswers, sessionId, saveFields]);

  // Update editor content when active section changes
  useEffect(() => {
    if (sections[activeSection]) {
      const sectionKey = sections[activeSection].name;
      const savedContent = sectionAnswers[sectionKey] || "";
      setEditorContent(savedContent);
    }
  }, [activeSection, sections, sectionAnswers]);

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setEditorContent(value);

    const section = sections[activeSection];
    if (!section) return;

    setSectionAnswers((prev) => {
      const updated = { ...prev, [section.name]: value };
      saveFields(
        { sections: updated, status: 'editing_sections' },
        { changedSections: [section.name], source: 'autosave' }
      );
      return updated;
    });
  };

  const commitActiveSection = useCallback(async () => {
    const section = sections[activeSection];
    if (!section) return;
    const updated = { ...sectionAnswers, [section.name]: editorContent };
    setSectionAnswers(updated);
    await saveFields(
      { sections: updated, status: 'editing_sections' },
      { changedSections: [section.name], source: 'manual', immediate: true }
    );
  }, [sections, activeSection, sectionAnswers, editorContent, saveFields]);

  const handleSaveVersion = async () => {
    setSavingVersion(true);
    try {
      await commitActiveSection();
      await flush();
      await apiClient.drafts.createVersion({
        sessionId,
        label: versionLabel.trim() || undefined,
      });
      setVersionLabel("");
      setLabelPromptOpen(false);
    } catch (error) {
      console.error("Error saving version:", error);
    } finally {
      setSavingVersion(false);
    }
  };

  const handleSaveAndContinue = async () => {
    try {
      await commitActiveSection();
    } catch (error) {
      console.error("Error saving before continue:", error);
    }

    if (activeSection < sections.length - 1) {
      setActiveSection(activeSection + 1);
    } else {
      onContinue();
    }
  };

  const handleRegenerateContent = async () => {
    const section = sections[activeSection];
    if (!section || !selectedNofo) return;

    try {
      setRegenerating(true);
      setRegenerateProgress('Generating content...');

      const username = (await Auth.currentAuthenticatedUser()).username;
      const currentDraft = await apiClient.drafts.getDraft({
        sessionId: sessionId,
        userId: username
      });

      if (!currentDraft) {
        throw new Error('No draft found');
      }

      const result = await apiClient.drafts.generateDraft({
        query: `Generate content for the ${section.name} section. ${section.description}`,
        documentIdentifier: selectedNofo,
        projectBasics: currentDraft.projectBasics || {},
        questionnaire: currentDraft.questionnaire || {},
        sessionId: sessionId,
        onProgress: (status: string) => {
          setRegenerateProgress(`Generating content for ${section.name}... (${status})`);
        }
      });

      if (result.sections && result.sections[section.name]) {
        setEditorContent(result.sections[section.name]);
        const updated = { ...sectionAnswers, [section.name]: result.sections[section.name] };
        setSectionAnswers(updated);

        await saveFields(
          { sections: updated, status: 'editing_sections' },
          { changedSections: [section.name], source: 'ai_regenerated', immediate: true }
        );

        setRegenerateProgress('Content generated successfully!');
      } else {
        throw new Error('No content generated for this section');
      }
    } catch (error) {
      console.error('Error generating content:', error);
      console.error(error instanceof Error ? error.message : 'Failed to generate content. Please try again.');
    } finally {
      setRegenerating(false);
      setTimeout(() => setRegenerateProgress(""), 2000);
    }
  };

  const handleRetryFailedSections = useCallback(async () => {
    if (!selectedNofo || failedSections.length === 0) return;

    try {
      setGenerating(true);
      setFailedSections([]);

      const username = (await Auth.currentAuthenticatedUser()).username;
      const currentDraft = await apiClient.drafts.getDraft({ sessionId, userId: username });
      if (!currentDraft) throw new Error('No draft found');

      const result = await apiClient.drafts.generateDraft({
        query: 'Generate all sections for the grant application',
        documentIdentifier: selectedNofo,
        projectBasics: currentDraft.projectBasics || {},
        questionnaire: currentDraft.questionnaire || {},
        sessionId,
        onJobUpdate: (jobStatus: DraftJobStatus) => {
          if (jobStatus.sections) {
            setSectionAnswers(prev => ({ ...prev, ...jobStatus.sections }));
          }
          if (typeof jobStatus.completedSectionCount === 'number') {
            setCompletedSectionCount(jobStatus.completedSectionCount);
          }
        },
      });

      if (result.sections) {
        const merged = { ...sectionAnswers, ...result.sections };
        setSectionAnswers(merged);
        await saveFields(
          { sections: merged, status: 'editing_sections' },
          {
            changedSections: Object.keys(result.sections),
            source: 'ai_generated',
            immediate: true,
          }
        );
      }
    } catch (error) {
      console.error('Error retrying failed sections:', error);
    } finally {
      setGenerating(false);
    }
  }, [selectedNofo, failedSections, sessionId, apiClient, sectionAnswers, saveFields]);

  const reloadAfterRestore = useCallback(async () => {
    const username = (await Auth.currentAuthenticatedUser()).username;
    const draft = await apiClient.drafts.getDraft({ sessionId, userId: username });
    if (!draft) return;
    draftSave.setBaseline(draft);
    const restored = draft.sections || {};
    setSectionAnswers(restored);
    writeDraftCache(sessionId, "sections", restored);
    const section = sections[activeSection];
    if (section) setEditorContent(restored[section.name] || "");
  }, [apiClient, sessionId, draftSave, sections, activeSection]);

  const refreshUndoCandidate = useCallback(async () => {
    const section = sections[activeSection];
    if (!section || !sessionId) {
      setUndoCandidate(null);
      return;
    }
    try {
      const versions = await apiClient.drafts.listVersions({ sessionId });
      setUndoCandidate(
        versions.find(
          (version) =>
            !version.oversize &&
            (version.source === "ai_regenerated" || version.source === "ai_generated") &&
            (version.changed_sections || []).includes(section.name)
        ) || null
      );
    } catch (error) {
      console.warn("Could not check for an undoable generation:", error);
      setUndoCandidate(null);
    }
  }, [apiClient, sessionId, sections, activeSection]);

  useEffect(() => {
    if (!generating) refreshUndoCandidate();
  }, [refreshUndoCandidate, generating]);

  const handleUndoGeneration = async () => {
    const section = sections[activeSection];
    if (!undoCandidate || !section) return;
    try {
      await apiClient.drafts.restoreVersion({
        sessionId,
        rev: undoCandidate.rev,
        sectionsOnly: [section.name],
      });
      await reloadAfterRestore();
      await refreshUndoCandidate();
    } catch (error) {
      console.error("Error undoing generation:", error);
    } finally {
      setUndoConfirmOpen(false);
    }
  };

  const activeSectionName = sections[activeSection]?.name;

  return (
    <div className="se-container">
      {/* Editor area - now on the left */}
      <div className="se-editor-area">
        <div className="se-editor-inner">
          {/* Partial failure banner */}
          {failedSections.length > 0 && (
            <div
              role="alert"
              style={{
                background: '#FEF3C7',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                fontSize: '14px',
              }}
            >
              <strong>{failedSections.length} section(s) failed to generate:</strong>
              <span>{failedSections.join(", ")}</span>
              <button
                onClick={handleRetryFailedSections}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: '1px solid #D97706',
                  background: '#FFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Retry Failed Sections
              </button>
              <span style={{ color: '#6B7280' }}>or write them manually below.</span>
            </div>
          )}

          {/* Generating banner */}
          {generating && (
            <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                role="status"
                aria-live="polite"
                style={{
                  background: '#DFECE0',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '14px',
                  color: '#195C53',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #23776C',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    flexShrink: 0,
                  }}
                />
                Generating sections ({completedSectionCount}/{sections.length})... You can edit completed sections while others are being written.
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#065f46',
              }}>
                <span style={{ fontSize: '15px', flexShrink: 0 }}>&#10003;</span>
                Your progress is automatically saved. You can leave and come back anytime.
              </div>
            </div>
          )}

          <div className="se-section-header">
            <h2 className="se-section-title" id="se-section-title">
              {activeSectionName || "Section Editor"}
            </h2>
            <div className="se-section-header-actions">
              <AutoSaveIndicator status={saveStatus} onRetry={retry} />
              {undoCandidate && (
                <button
                  type="button"
                  className="se-header-btn"
                  onClick={() => setUndoConfirmOpen(true)}
                >
                  <Undo2 size={16} aria-hidden="true" />
                  Undo AI rewrite
                </button>
              )}
              <button
                type="button"
                className="se-header-btn"
                onClick={() => setHistoryOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={historyOpen}
              >
                <History size={16} aria-hidden="true" />
                Version history
              </button>
            </div>
          </div>

          <div className="se-section-description">
            <p>
              {sections[activeSection]?.description}
            </p>
          </div>

          {/* Editor */}
          <div className="se-editor-card">
            {generating && !sectionAnswers[sections[activeSection]?.name] ? (
              <div
                className="se-skeleton-container"
                role="status"
                aria-label={`Generating ${sections[activeSection]?.name}...`}
              >
                <div className="se-skeleton-label">
                  <div className="se-skeleton-spinner" />
                  Generating {sections[activeSection]?.name}...
                </div>
                <div className="se-skeleton-lines">
                  <div className="se-skeleton-line" style={{ width: '92%' }} />
                  <div className="se-skeleton-line" style={{ width: '100%' }} />
                  <div className="se-skeleton-line" style={{ width: '85%' }} />
                  <div className="se-skeleton-line" style={{ width: '96%' }} />
                  <div className="se-skeleton-line" style={{ width: '78%' }} />
                  <div className="se-skeleton-line" style={{ width: '100%' }} />
                  <div className="se-skeleton-line" style={{ width: '88%' }} />
                  <div className="se-skeleton-line" style={{ width: '45%' }} />
                </div>
              </div>
            ) : (
              <textarea
                value={editorContent}
                onChange={handleEditorChange}
                className="se-textarea"
                aria-labelledby="se-section-title"
                placeholder={`Start writing your ${sections[activeSection]?.name} here...`}
              />
            )}
          </div>

          {/* Regenerate Content with AI button - DISABLED */}
          {false && (
            <button
              onClick={handleRegenerateContent}
              disabled={regenerating}
              className="se-regenerate-btn"
            >
              <RotateCcw size={20} className="se-icon--left" />
              {regenerating ? "Generating..." : "Regenerate Content with AI"}
            </button>
          )}
          {regenerating && regenerateProgress && (
            <div className="se-regenerate-progress">
              <div className="se-regenerate-spinner" />
              {regenerateProgress}
            </div>
          )}

          {/* Content Suggestions and Completion Checklist sections - DISABLED */}
          {false && (
            <div className="se-suggestions-grid">
              <div>
                <h3 className="se-suggestions-heading">
                  Content Suggestions
                </h3>
                <div className="se-suggestions-buttons">
                  <button className="se-suggestion-btn">
                    Add Community Impact
                  </button>
                  <button className="se-suggestion-btn">
                    Add Statistics
                  </button>
                  <button className="se-suggestion-btn">
                    Add Economic Impact
                  </button>
                  <button className="se-suggestion-btn">
                    Add Comparison
                  </button>
                </div>
              </div>

            <div>
              <h3 className="se-suggestions-heading">
                Completion Checklist
              </h3>
              <div className="se-checklist-card">
                <ul className="se-checklist-list">
                  <li className="se-checklist-item se-checklist-item--done">
                    <CheckCircle size={16} className="se-icon--left" />
                    <span>Described the problem</span>
                  </li>
                  <li className="se-checklist-item se-checklist-item--done">
                    <CheckCircle size={16} className="se-icon--left" />
                    <span>Included data</span>
                  </li>
                  <li className="se-checklist-item">
                    <div className="se-checklist-circle" />
                    <span>Explained who is affected</span>
                  </li>
                  <li className="se-checklist-item">
                    <div className="se-checklist-circle" />
                    <span>Connected to solution</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          )}

          <div className="se-actions-bar">
            <button
              id="save-button"
              className="se-save-btn"
              onClick={() => setLabelPromptOpen(true)}
              disabled={savingVersion}
            >
              <Save size={18} className="se-icon--left" />
              {savingVersion ? "Saving version..." : "Save version"}
            </button>

            <div className="se-nav-buttons">
              {activeSection > 0 && (
                <button
                  className="se-prev-btn"
                  onClick={() => setActiveSection(activeSection - 1)}
                >
                  <ChevronLeft size={18} className="se-icon--left" />
                  Previous
                </button>
              )}

              {activeSection < sections.length - 1 ? (
                <button
                  className="se-next-btn"
                  onClick={handleSaveAndContinue}
                >
                  Save and Review
                  <ChevronRight size={18} className="se-icon--right" />
                </button>
              ) : (
                <button
                  className="se-next-btn"
                  onClick={onContinue}
                >
                  Review Application
                  <ChevronRight size={18} className="se-icon--right" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sections panel - now on the right */}
      <SectionsSidebar
        sections={sections}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        sectionAnswers={sectionAnswers}
        generating={generating}
        completedSectionCount={completedSectionCount}
        failedSections={failedSections}
      />

      <VersionHistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessionId={sessionId}
        activeSectionName={activeSectionName}
        currentSections={sectionAnswers}
        onRestored={async () => {
          await reloadAfterRestore();
          await refreshUndoCandidate();
        }}
      />

      <ConfirmationModal
        isOpen={labelPromptOpen}
        onClose={() => setLabelPromptOpen(false)}
        onConfirm={handleSaveVersion}
        title="Save a version"
        confirmLabel="Save version"
        confirming={savingVersion}
        message={
          <>
            <span>
              This saves your work and keeps a named snapshot you can come back to.
              Labelled versions are never removed automatically.
            </span>
            <label htmlFor="version-label" className="se-version-label">
              Label (optional)
            </label>
            <input
              id="version-label"
              type="text"
              value={versionLabel}
              maxLength={120}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. Before budget rewrite"
              className="se-version-label-input"
            />
          </>
        }
      />

      <ConfirmationModal
        isOpen={undoConfirmOpen}
        onClose={() => setUndoConfirmOpen(false)}
        onConfirm={handleUndoGeneration}
        title="Undo AI rewrite"
        confirmLabel="Restore my earlier text"
        message={`This puts back the "${activeSectionName}" text from before the AI wrote over it. Other sections are left alone.`}
        warning="Your current text is saved as a version first, so you can redo this."
      />
    </div>
  );
};

export default SectionEditor;

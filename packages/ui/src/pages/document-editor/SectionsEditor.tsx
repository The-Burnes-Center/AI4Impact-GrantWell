import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { getCurrentUser } from "aws-amplify/auth";
import { LuSave, LuChevronLeft, LuChevronRight, LuHistory, LuUndo2 } from "react-icons/lu";
import SectionsSidebar from "./components/SectionsSidebar";
import AddSectionForm from "./components/AddSectionForm";
import { useNotifications } from "../../components/notifications/NotificationManager";
import AutoSaveIndicator from "../../components/ui/AutoSaveIndicator";
import VersionHistoryPanel from "../../components/document-editor/VersionHistoryPanel";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import { readDraftCache, resolveQuestionnaireAnswers, writeDraftCache } from "../../common/helpers/document-editor-utils";
import {
  grantSections,
  keyedById,
  newCustomSectionId,
  resolveApplicationSections,
  sectionOrderOf,
  toSectionId,
  type ApplicationSection,
} from "../../common/helpers/application-sections";
import type { DraftJobStatus, DraftVersionMeta } from "../../common/api-client/drafts-client";
import type { useDraftSave } from "../../hooks/use-draft-save";
import { DailyLimitError } from "../../common/api-client/daily-limit";
import "../../styles/document-editor.css";

interface SectionEditorProps {
  onContinue: () => void;
  selectedNofo: string | null;
  sessionId: string;
  activeJobId?: string;
  isGenerating?: boolean;
  draftSave: ReturnType<typeof useDraftSave>;
}

/** Share of the per-application storage limit at which the editor starts warning. */
const STORAGE_WARNING_SHARE = 0.75;

const SectionEditor: React.FC<SectionEditorProps> = ({
  onContinue,
  selectedNofo,
  sessionId,
  activeJobId,
  isGenerating: initialIsGenerating,
  draftSave,
}) => {
  const [activeSection, setActiveSection] = useState(0);
  const [editorContent, setEditorContent] = useState("");
  const [sections, setSections] = useState<ApplicationSection[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(!!activeJobId && !!initialIsGenerating);
  const [failedSections, setFailedSections] = useState<string[]>([]);
  const [completedSectionCount, setCompletedSectionCount] = useState(0);
  const [generationTotal, setGenerationTotal] = useState<number | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [labelPromptOpen, setLabelPromptOpen] = useState(false);
  const [undoCandidate, setUndoCandidate] = useState<DraftVersionMeta | null>(null);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const apiClient = useApiClient();
  const { addNotification } = useNotifications();
  const { saveFields, flush, saveStatus, retry, storageUse } = draftSave;

  // Read by the generation poll below; kept in refs so typing (which changes
  // sectionAnswers/editorContent) cannot tear down and restart the interval.
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const sectionTitleRef = useRef<HTMLHeadingElement>(null);
  const previousSectionRef = useRef(activeSection);
  const sectionsRef = useRef(sections);
  const grantSectionsRef = useRef<ApplicationSection[]>([]);
  const sectionAnswersRef = useRef(sectionAnswers);
  const generatingRef = useRef(generating);

  useEffect(() => {
    sectionsRef.current = sections;
    sectionAnswersRef.current = sectionAnswers;
    generatingRef.current = generating;
  }, [sections, sectionAnswers, generating]);

  const saveSections = useCallback(
    (
      answers: Record<string, string>,
      list: ApplicationSection[],
      options: Parameters<typeof saveFields>[1]
    ) =>
      saveFields(
        { sections: answers, sectionOrder: sectionOrderOf(list), status: "editing_sections" },
        options
      ),
    [saveFields]
  );

  const loadGrantSections = useCallback(async () => {
    if (!selectedNofo) return [];
    try {
      const result = await apiClient.landingPage.getNOFOSummary(selectedNofo);
      return grantSections(result?.data?.ProjectNarrativeSections);
    } catch (error) {
      console.error("Error loading the grant's narrative sections:", error);
      return [];
    }
  }, [apiClient, selectedNofo]);

  // Sections come from the grant; text comes from the application, which may
  // still be keyed by section name and is converted the first time it opens.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const grant = await loadGrantSections();
      let draft = null;
      try {
        if (sessionId) {
          const username = (await getCurrentUser()).username;
          draft = await apiClient.drafts.getDraft({ sessionId, userId: username });
        }
      } catch (error) {
        console.error("Error loading draft sections from API:", error);
      }
      if (cancelled) return;

      grantSectionsRef.current = grant;
      const resolved = resolveApplicationSections(grant, draft?.sections, draft?.sectionOrder);
      const answers = { ...resolved.answers };
      if (!generatingRef.current) {
        // Cache wins: it holds edits whose save was still pending at exit.
        Object.assign(answers, keyedById(readDraftCache<Record<string, string>>(sessionId, "sections"), resolved.sections));
      }
      setSections(resolved.sections);
      setSectionAnswers(answers);
      setLoaded(true);

      if (draft && !draft.sectionOrder && !generatingRef.current) {
        saveSections(answers, resolved.sections, { source: "manual", immediate: true }).catch((error) =>
          console.error("Error saving the converted application:", error)
        );
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [apiClient, sessionId, loadGrantSections, saveSections]);

  /** After a run, the server's merge is the truth: it keeps text saved while the run was going. */
  const finishGeneration = useCallback(
    async (job: Pick<DraftJobStatus, "sections" | "failedSections">) => {
      try {
        const username = (await getCurrentUser()).username;
        const draft = await apiClient.drafts.getDraft({ sessionId, userId: username });
        const resolved = resolveApplicationSections(
          grantSectionsRef.current,
          draft?.sections,
          draft?.sectionOrder
        );
        const answers = { ...resolved.answers };
        const generated = keyedById(job.sections, resolved.sections);
        const missing = Object.keys(generated).filter((id) => !(answers[id] ?? "").trim());
        for (const id of missing) answers[id] = generated[id];

        if (draft) draftSave.setBaseline(draft);
        setSections(resolved.sections);
        setSectionAnswers(answers);
        writeDraftCache(sessionId, "sections", answers);
        setFailedSections(
          (job.failedSections || [])
            .map((key) => toSectionId(key, resolved.sections) ?? key)
        );
        if (missing.length > 0) {
          await saveSections(answers, resolved.sections, {
            changedSections: missing,
            source: "ai_generated",
            immediate: true,
          });
        }
      } catch (error) {
        console.error("Error loading the finished application:", error);
      } finally {
        setGenerating(false);
        setGenerationTotal(undefined);
      }
    },
    [apiClient, sessionId, draftSave, saveSections]
  );

  // ── Live polling when generation is in progress ───────────────────
  useEffect(() => {
    if (!activeJobId || !generating) return;

    let finished = false;
    const interval = setInterval(async () => {
      if (finished) return;
      try {
        const jobStatus: DraftJobStatus = await apiClient.drafts.pollDraftJob(activeJobId);

        // Shown as it arrives; the editor is read-only, so nothing here is saved.
        if (jobStatus.sections) {
          const arrived = keyedById(jobStatus.sections, sectionsRef.current);
          setSectionAnswers((prev) => ({ ...prev, ...arrived }));
        }
        if (typeof jobStatus.completedSectionCount === "number") {
          setCompletedSectionCount((prev) => Math.max(prev, jobStatus.completedSectionCount!));
        }

        if (jobStatus.status === "completed" || jobStatus.status === "partial" || jobStatus.status === "error") {
          finished = true;
          clearInterval(interval);
          await finishGeneration(jobStatus);
        }
      } catch (err) {
        console.error("Error polling draft job:", err);
        // Continue polling on transient errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId, generating, apiClient, finishGeneration]);

  useEffect(() => {
    if (previousSectionRef.current === activeSection) return;
    previousSectionRef.current = activeSection;
    const area = editorAreaRef.current;
    if (area) {
      area.scrollTop = 0;
      if (area.scrollHeight <= area.clientHeight) area.scrollIntoView({ block: "start" });
    }
    sectionTitleRef.current?.focus({ preventScroll: true });
  }, [activeSection]);

  // Update editor content when active section changes
  useEffect(() => {
    const section = sections[activeSection];
    if (section) setEditorContent(sectionAnswers[section.id] || "");
  }, [activeSection, sections, sectionAnswers]);

  // Review Application flags the sections that were never opened; nothing else records it.
  useEffect(() => {
    const section = sections[activeSection];
    if (!section || !sessionId) return;
    const seen = readDraftCache<string[]>(sessionId, "sectionsViewed") || [];
    if (seen.includes(section.id)) return;
    writeDraftCache(sessionId, "sectionsViewed", [...seen, section.id]);
  }, [activeSection, sections, sessionId]);

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (generating) return;
    const value = e.target.value;
    setEditorContent(value);

    const section = sections[activeSection];
    if (!section) return;

    setSectionAnswers((prev) => {
      const updated = { ...prev, [section.id]: value };
      saveSections(updated, sectionsRef.current, { changedSections: [section.id], source: "autosave" });
      return updated;
    });
  };

  const commitActiveSection = useCallback(async () => {
    const section = sections[activeSection];
    if (!section || generating) return;
    const updated = { ...sectionAnswers, [section.id]: editorContent };
    setSectionAnswers(updated);
    await saveSections(updated, sections, {
      changedSections: [section.id],
      source: "manual",
      immediate: true,
    });
  }, [sections, activeSection, sectionAnswers, editorContent, saveSections, generating]);

  const handleAddSection = useCallback(
    (name: string) => {
      if (generating) return;
      const id = newCustomSectionId(name, sections);
      const updated = [...sections, { id, name, description: "", custom: true }];
      const answers = { ...sectionAnswers, [id]: "" };
      setSections(updated);
      setSectionAnswers(answers);
      setActiveSection(updated.length - 1);
      saveSections(answers, updated, { changedSections: [id], source: "manual", immediate: true }).catch(
        (error) => console.error("Error saving the new section:", error)
      );
    },
    [generating, sections, sectionAnswers, saveSections]
  );

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

  const handleRetryFailedSections = useCallback(async () => {
    if (!selectedNofo || failedSections.length === 0) return;
    const retrying = failedSections;

    try {
      setGenerating(true);
      setFailedSections([]);
      setCompletedSectionCount(0);
      setGenerationTotal(retrying.length);

      const username = (await getCurrentUser()).username;
      const currentDraft = await apiClient.drafts.getDraft({ sessionId, userId: username });
      if (!currentDraft) throw new Error("No draft found");

      const questionnaireAnswers = await resolveQuestionnaireAnswers(
        () => apiClient.landingPage.getNOFOQuestions(selectedNofo),
        currentDraft.questionnaire,
      );

      const result = await apiClient.drafts.generateDraft({
        query: "Generate all sections for the grant application",
        documentIdentifier: selectedNofo,
        projectBasics: currentDraft.projectBasics || {},
        questionnaire: currentDraft.questionnaire || {},
        questionnaireAnswers,
        additionalInfo: currentDraft.additionalInfo || "",
        sessionId,
        sectionIds: retrying,
        onJobUpdate: (jobStatus: DraftJobStatus) => {
          if (jobStatus.sections) {
            const arrived = keyedById(jobStatus.sections, sectionsRef.current);
            setSectionAnswers((prev) => ({ ...prev, ...arrived }));
          }
          if (typeof jobStatus.completedSectionCount === "number") {
            setCompletedSectionCount(jobStatus.completedSectionCount);
          }
        },
      });

      let final: Pick<DraftJobStatus, "sections" | "failedSections"> = { sections: result.sections };
      try {
        final = await apiClient.drafts.pollDraftJob(result.jobId);
      } catch (error) {
        console.warn("Could not read the finished job:", error);
      }
      await finishGeneration(final);
    } catch (error) {
      console.error("Error retrying failed sections:", error);
      setFailedSections(retrying);
      setGenerating(false);
      setGenerationTotal(undefined);
      if (error instanceof DailyLimitError) addNotification("error", error.message);
    }
  }, [selectedNofo, failedSections, sessionId, apiClient, finishGeneration, addNotification]);

  const reloadAfterRestore = useCallback(async () => {
    const username = (await getCurrentUser()).username;
    const draft = await apiClient.drafts.getDraft({ sessionId, userId: username });
    if (!draft) return;
    draftSave.setBaseline(draft);
    const resolved = resolveApplicationSections(grantSectionsRef.current, draft.sections, draft.sectionOrder);
    setSections(resolved.sections);
    setSectionAnswers(resolved.answers);
    writeDraftCache(sessionId, "sections", resolved.answers);
  }, [apiClient, sessionId, draftSave]);

  const refreshUndoCandidate = useCallback(async () => {
    const section = sections[activeSection];
    if (!section || !sessionId) {
      setUndoCandidate(null);
      return;
    }
    // Version rows written before section ids existed name the section instead.
    const isThisSection = (key: string) => key === section.id || key === section.name;
    try {
      const versions = await apiClient.drafts.listVersions({ sessionId });
      const aiIndex = versions.findIndex(
        (version) =>
          (version.source === "ai_regenerated" || version.source === "ai_generated") &&
          (version.changed_sections || []).some(isThisSection)
      );
      // A version now holds the state its write produced, so the text the AI
      // overwrote is the next row down — and only rows that actually have text
      // for this section are worth offering.
      const words = (version: DraftVersionMeta) =>
        version.section_word_counts?.[section.id] ?? version.section_word_counts?.[section.name] ?? 0;
      setUndoCandidate(
        (aiIndex === -1
          ? undefined
          : versions.slice(aiIndex + 1).find((version) => !version.oversize && words(version) > 0)) || null
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
        sectionsOnly: [section.id],
      });
      await reloadAfterRestore();
      await refreshUndoCandidate();
    } catch (error) {
      console.error("Error undoing generation:", error);
      addNotification(
        "error",
        error instanceof Error ? error.message : "That earlier text could not be restored."
      );
    } finally {
      setUndoConfirmOpen(false);
    }
  };

  const active = sections[activeSection];
  const activeSectionName = active?.name;
  const nearStorageLimit =
    !!storageUse && storageUse.limit > 0 && storageUse.bytes >= storageUse.limit * STORAGE_WARNING_SHARE;
  const failedNames = failedSections.map((id) => sections.find((s) => s.id === id)?.name ?? id);

  if (loaded && sections.length === 0 && !generating) {
    return (
      <div className="se-container">
        <div className="se-editor-area" ref={editorAreaRef}>
          <div className="se-editor-inner">
            <div className="se-empty-state">
              <h2 className="se-section-title">Sections</h2>
              <p>This grant doesn&apos;t list narrative sections. Add your own section to start writing.</p>
              <AddSectionForm onAdd={handleAddSection} startOpen />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="se-container">
      {/* Editor area - now on the left */}
      <div className="se-editor-area" ref={editorAreaRef}>
        <div className="se-editor-inner">
          {/* Always mounted so the failure text lands as a mutation, and holding
              the message alone so the retry button is not read out as part of it. */}
          <div role="alert" className="visually-hidden">
            {failedSections.length > 0
              ? `${failedSections.length} section(s) failed to generate: ${failedNames.join(", ")}.`
              : ""}
          </div>

          {/* Partial failure banner */}
          {failedSections.length > 0 && (
            <div
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
              <span>{failedNames.join(", ")}</span>
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
                aria-atomic="true"
                style={{
                  background: 'var(--gw-color-primary-light)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '14px',
                  color: 'var(--gw-color-primary-hover)',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid var(--gw-color-primary)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    flexShrink: 0,
                  }}
                />
                Generating sections ({completedSectionCount}/{generationTotal ?? sections.length})...
              </div>
              {/* Outside the atomic region: it never changes, so re-reading it on
                  every 2s poll would bury the count. */}
              <p id="se-lock-note" style={{ margin: 0, fontSize: '14px', color: 'var(--gw-color-primary-hover)' }}>
                Sections are read-only while they are being written. You can edit them when writing finishes.
              </p>
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
            <h2 className="se-section-title" id="se-section-title" ref={sectionTitleRef} tabIndex={-1}>
              {activeSectionName || "Section Editor"}
            </h2>
            <div className="se-section-header-actions">
              <AutoSaveIndicator status={saveStatus} onRetry={retry} />
              {undoCandidate && (
                <button
                  type="button"
                  className="se-header-btn"
                  onClick={() => setUndoConfirmOpen(true)}
                  disabled={generating}
                >
                  <LuUndo2 size={16} aria-hidden="true" />
                  Undo AI rewrite
                </button>
              )}
              <button
                type="button"
                className="se-header-btn"
                onClick={() => setHistoryOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={historyOpen}
                disabled={generating}
              >
                <LuHistory size={16} aria-hidden="true" />
                Version history
              </button>
            </div>
          </div>

          {nearStorageLimit && (
            <p className="se-storage-warning" role="status">
              This application is close to its size limit. Shorten long sections or move background
              material into supporting documents.
            </p>
          )}

          {active?.description && (
            <div className="se-section-description">
              <p>{active.description}</p>
            </div>
          )}

          {/* Editor */}
          <div className="se-editor-card">
            {generating && active && !sectionAnswers[active.id] ? (
              <div className="se-skeleton-container">
                <div className="se-skeleton-label">
                  <div className="se-skeleton-spinner" />
                  Generating {active.name}...
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
                className={`se-textarea${generating ? " se-textarea--locked" : ""}`}
                aria-labelledby="se-section-title"
                readOnly={generating}
                aria-readonly={generating || undefined}
                aria-describedby={generating ? "se-lock-note" : undefined}
                placeholder={active ? `Start writing your ${active.name} here...` : undefined}
              />
            )}
          </div>

          {/* Content Suggestions and Completion Checklist sections - DISABLED */}

          <div className="se-actions-bar">
            <button
              id="save-button"
              className="se-save-btn"
              onClick={() => setLabelPromptOpen(true)}
              disabled={savingVersion || generating}
            >
              <LuSave size={18} className="se-icon--left" />
              {savingVersion ? "Saving version..." : "Save version"}
            </button>
            <span role="status" aria-live="polite" className="visually-hidden">
              {saveStatus === "saved" ? "Progress saved" : ""}
            </span>
            <span role="alert" className="visually-hidden">
              {saveStatus === "error" ? "Save failed. Your changes are stored locally; try saving again." : ""}
            </span>

            <div className="se-nav-buttons">
              {activeSection > 0 && (
                <button
                  className="se-prev-btn"
                  onClick={() => setActiveSection(activeSection - 1)}
                >
                  <LuChevronLeft size={18} className="se-icon--left" />
                  Previous
                </button>
              )}

              <button
                className="se-next-btn"
                onClick={handleSaveAndContinue}
              >
                {activeSection < sections.length - 1
                  ? "Save section & continue"
                  : "Save section & review application"}
                <LuChevronRight size={18} className="se-icon--right" />
              </button>
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
        generationTotal={generationTotal}
        onAddSection={handleAddSection}
      />

      <VersionHistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessionId={sessionId}
        sections={sections}
        activeSectionId={active?.id}
        currentSections={sectionAnswers}
        currentRev={draftSave.getDraftSnapshot()?.rev}
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
        warning="Your current text is already kept as a version, so you can redo this."
      />
    </div>
  );
};

export default SectionEditor;

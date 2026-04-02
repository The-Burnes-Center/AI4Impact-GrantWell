import React, { useState, useEffect, useRef, useCallback } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { Auth } from "aws-amplify";
import {
  Bold,
  Italic,
  Underline,
  List,
  Save,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle,
} from "lucide-react";
import SectionsSidebar from "./components/SectionsSidebar";
import type { DraftJobStatus } from "../../common/api-client/drafts-client";
import "../../styles/document-editor.css";

interface SectionEditorProps {
  onContinue: () => void;
  selectedNofo: string | null;
  sessionId: string;
  onNavigate: (step: string) => void;
  activeJobId?: string;
  isGenerating?: boolean;
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
}) => {
  const [activeSection, setActiveSection] = useState(0);
  const [editorContent, setEditorContent] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<{
    [key: string]: string;
  }>({});
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState<string>("");
  const [generating, setGenerating] = useState(!!activeJobId && !!initialIsGenerating);
  const [failedSections, setFailedSections] = useState<string[]>([]);
  const [completedSectionCount, setCompletedSectionCount] = useState(0);
  const apiClient = useApiClient();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // Fetch draft from API and initialize sectionAnswers (only if not actively generating)
    const fetchDraftSections = async () => {
      try {
        if (sessionId) {
          const username = (await Auth.currentAuthenticatedUser()).username;
          const draft = await apiClient.drafts.getDraft({
            sessionId: sessionId,
            userId: username
          });
          if (draft && draft.sections) {
            setSectionAnswers(draft.sections);
            localStorage.setItem("sectionAnswers", JSON.stringify(draft.sections));
          } else {
            setSectionAnswers({});
          }
        }
      } catch (error) {
        console.error("Error loading draft sections from API:", error);
        setSectionAnswers({});
      }
    };

    if (!generating) {
      fetchDraftSections();
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
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
            localStorage.setItem("sectionAnswers", JSON.stringify(merged));
            return merged;
          });
        }

        // Track completed count for sidebar progress
        if (typeof jobStatus.completedSectionCount === 'number') {
          setCompletedSectionCount(jobStatus.completedSectionCount);
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
          // Save full draft to DraftTable
          try {
            const username = (await Auth.currentAuthenticatedUser()).username;
            const currentDraft = await apiClient.drafts.getDraft({ sessionId, userId: username });
            if (currentDraft) {
              await apiClient.drafts.updateDraft({
                ...currentDraft,
                sections: { ...currentDraft.sections, ...jobStatus.sections },
                status: 'editing_sections',
                lastModified: new Date().toISOString(),
              });
            }
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
  }, [activeJobId, generating, apiClient, sections, activeSection, sectionAnswers, sessionId]);

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

    if (sections[activeSection]) {
      const sectionKey = sections[activeSection].name;
      setSectionAnswers((prev) => {
        const updated = { ...prev, [sectionKey]: value };
        localStorage.setItem("sectionAnswers", JSON.stringify(updated));

        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = setTimeout(async () => {
          if (selectedNofo) {
            try {
              const username = (await Auth.currentAuthenticatedUser()).username;
              const currentDraft = await apiClient.drafts.getDraft({
                sessionId: sessionId,
                userId: username
              });

              if (currentDraft) {
                await apiClient.drafts.updateDraft({
                  sessionId: sessionId,
                  userId: username,
                  title: currentDraft.title || `Application for ${selectedNofo}`,
                  documentIdentifier: selectedNofo,
                  sections: updated,
                  projectBasics: currentDraft.projectBasics,
                  questionnaire: currentDraft.questionnaire,
                  lastModified: new Date().toISOString()
                });
              } else {
                await apiClient.drafts.updateDraft({
                  sessionId: sessionId,
                  userId: username,
                  title: `Application for ${selectedNofo}`,
                  documentIdentifier: selectedNofo,
                  sections: updated,
                  projectBasics: {},
                  questionnaire: {},
                  lastModified: new Date().toISOString()
                });
              }
            } catch (error) {
              console.error("Error auto-saving to database:", error);
            }
          }
        }, 2000);

        return updated;
      });
    }
  };

  const handleSaveProgress = async () => {
    if (sections[activeSection] && selectedNofo) {
      const sectionKey = sections[activeSection].name;
      const updated = { ...sectionAnswers, [sectionKey]: editorContent };
      setSectionAnswers(updated);
      localStorage.setItem("sectionAnswers", JSON.stringify(updated));

      try {
        const username = (await Auth.currentAuthenticatedUser()).username;
        const currentDraft = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username
        });

        if (currentDraft) {
          await apiClient.drafts.updateDraft({
            sessionId: sessionId,
            userId: username,
            title: currentDraft.title || `Application for ${selectedNofo}`,
            documentIdentifier: selectedNofo,
            sections: updated,
            projectBasics: currentDraft.projectBasics,
            questionnaire: currentDraft.questionnaire,
            status: 'editing_sections',
            lastModified: new Date().toISOString()
          });
        } else {
          await apiClient.drafts.updateDraft({
            sessionId: sessionId,
            userId: username,
            title: `Application for ${selectedNofo}`,
            documentIdentifier: selectedNofo,
            sections: updated,
            projectBasics: {},
            questionnaire: {},
            status: 'editing_sections',
            lastModified: new Date().toISOString()
          });
        }

        const saveButton = document.getElementById("save-button");
        if (saveButton) {
          const originalText = saveButton.innerText;
          saveButton.innerText = "Saved!";
          setTimeout(() => {
            saveButton.innerText = originalText;
          }, 1500);
        }
      } catch (error) {
        console.error("Error saving progress to database:", error);
        const saveButton = document.getElementById("save-button");
        if (saveButton) {
          const originalText = saveButton.innerText;
          saveButton.innerText = "Save failed";
          setTimeout(() => {
            saveButton.innerText = originalText;
          }, 2000);
        }
      }
    }
  };

  const handleSaveAndContinue = async () => {
    if (sections[activeSection]) {
      const sectionKey = sections[activeSection].name;
      const updated = { ...sectionAnswers, [sectionKey]: editorContent };
      setSectionAnswers(updated);
      localStorage.setItem("sectionAnswers", JSON.stringify(updated));

      if (selectedNofo) {
        try {
          const username = (await Auth.currentAuthenticatedUser()).username;
          const currentDraft = await apiClient.drafts.getDraft({
            sessionId: sessionId,
            userId: username
          });

          if (currentDraft) {
            await apiClient.drafts.updateDraft({
              sessionId: sessionId,
              userId: username,
              title: currentDraft.title || `Application for ${selectedNofo}`,
              documentIdentifier: selectedNofo,
              sections: updated,
              projectBasics: currentDraft.projectBasics,
              questionnaire: currentDraft.questionnaire,
              status: 'editing_sections',
              lastModified: new Date().toISOString()
            });
          } else {
            await apiClient.drafts.updateDraft({
              sessionId: sessionId,
              userId: username,
              title: `Application for ${selectedNofo}`,
              documentIdentifier: selectedNofo,
              sections: updated,
              projectBasics: {},
              questionnaire: {},
              status: 'editing_sections',
              lastModified: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error("Error saving before continue:", error);
        }
      }
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
        localStorage.setItem("sectionAnswers", JSON.stringify(updated));

        await apiClient.drafts.updateDraft({
          sessionId: sessionId,
          userId: username,
          title: currentDraft.title,
          documentIdentifier: selectedNofo,
          sections: {
            ...currentDraft.sections,
            [section.name]: result.sections[section.name]
          },
          projectBasics: currentDraft.projectBasics,
          questionnaire: currentDraft.questionnaire,
          status: 'editing_sections',
          lastModified: new Date().toISOString()
        });

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
        setSectionAnswers(prev => ({ ...prev, ...result.sections }));
        await apiClient.drafts.updateDraft({
          ...currentDraft,
          sections: { ...currentDraft.sections, ...result.sections },
          status: 'editing_sections',
          lastModified: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error retrying failed sections:', error);
    } finally {
      setGenerating(false);
    }
  }, [selectedNofo, failedSections, sessionId, apiClient]);

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
            <div
              role="status"
              aria-live="polite"
              style={{
                background: '#EFF6FF',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '14px',
                color: '#1D4ED8',
              }}
            >
              <div
                aria-hidden
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #3B82F6',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  flexShrink: 0,
                }}
              />
              Generating sections... They will appear as they complete. You can start editing completed sections.
            </div>
          )}

          <h2 className="se-section-title">
            {sections[activeSection]?.name || "Section Editor"}
          </h2>

          <div className="se-section-description">
            <p>
              {sections[activeSection]?.description}
            </p>
          </div>

          {/* Editor */}
          <div className="se-editor-card">
            <div className="se-toolbar">
              <button aria-label="Bold" className="se-toolbar-btn">
                <Bold size={18} />
              </button>
              <button aria-label="Italic" className="se-toolbar-btn">
                <Italic size={18} />
              </button>
              <button aria-label="Underline" className="se-toolbar-btn">
                <Underline size={18} />
              </button>
              <div className="se-toolbar-divider" />
              <button aria-label="Bulleted list" className="se-toolbar-btn">
                <List size={20} />
              </button>
            </div>
            <textarea
              value={editorContent}
              onChange={handleEditorChange}
              className="se-textarea"
              placeholder={
                generating && !sectionAnswers[sections[activeSection]?.name]
                  ? `Generating ${sections[activeSection]?.name}...`
                  : `Start writing your ${sections[activeSection]?.name} here...`
              }
            />
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
              onClick={handleSaveProgress}
            >
              <Save size={18} className="se-icon--left" />
              Save Progress
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
    </div>
  );
};

export default SectionEditor;

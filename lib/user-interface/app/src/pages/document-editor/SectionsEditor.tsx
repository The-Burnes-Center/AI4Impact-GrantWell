import React, { useState, useEffect, useRef } from "react";
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
import "../../styles/document-editor.css";

interface SectionEditorProps {
  onContinue: () => void;
  selectedNofo: string | null;
  sessionId: string;
  onNavigate: (step: string) => void;
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
              // Fallback to default sections if none found in API
              setDefaultSections();
            }
          } else {
            // Fallback to default sections if API doesn't return narrative sections
            setDefaultSections();
          }
        } else {
          // Fallback to default sections if no NOFO
          setDefaultSections();
        }
      } catch (error) {
        console.error("Error loading NOFO narrative sections:", error);
        setDefaultSections();
      } finally {
        setLoading(false);
      }
    };

    // Helper to set default sections when API data is unavailable
    const setDefaultSections = () => {
      const defaultSections = [
        {
          name: "Project Summary",
          description: "A brief summary of your project.",
        },
        {
          name: "Statement of Need",
          description: "Explain the problem your project will solve.",
        },
        {
          name: "Goals & Objectives",
          description: "List the goals and objectives of your project.",
        },
        {
          name: "Project Activities",
          description: "Describe the main activities you will complete.",
        },
        {
          name: "Evaluation Plan",
          description: "How will you measure success?",
        },
      ];

      setSections(defaultSections);
    };

    fetchSections();

    // Fetch draft from API and initialize sectionAnswers
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

    fetchDraftSections();

    // Cleanup auto-save timeout on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [selectedNofo, apiClient, sessionId]);

  // Update editor content when active section changes
  useEffect(() => {
    if (sections[activeSection]) {
      const sectionKey = sections[activeSection].name;
      const savedContent = sectionAnswers[sectionKey] || "";
      if (savedContent) {
        setEditorContent(savedContent);
      } else {
        setEditorContent("");
      }
    }
  }, [activeSection, sections, sectionAnswers]);

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setEditorContent(value);

    // Save answer to localStorage immediately
    if (sections[activeSection]) {
      const sectionKey = sections[activeSection].name;
      setSectionAnswers((prev) => {
        const updated = { ...prev, [sectionKey]: value };
        localStorage.setItem("sectionAnswers", JSON.stringify(updated));

        // Auto-save to database after 2 seconds of inactivity
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = setTimeout(async () => {
          if (selectedNofo) {
            try {
              const username = (await Auth.currentAuthenticatedUser()).username;
              
              // Get current draft to preserve other fields
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
                // Create new draft if it doesn't exist
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
              // Silently fail - user can manually save if needed
            }
          }
        }, 2000); // Auto-save after 2 seconds of no typing

        return updated;
      });
    }
  };

  const handleSaveProgress = async () => {
    // Save the current section content
    if (sections[activeSection] && selectedNofo) {
      const sectionKey = sections[activeSection].name;
      const updated = { ...sectionAnswers, [sectionKey]: editorContent };
      setSectionAnswers(updated);
      localStorage.setItem("sectionAnswers", JSON.stringify(updated));

      try {
        // Save to database
        const username = (await Auth.currentAuthenticatedUser()).username;
        
        // Get current draft to preserve other fields
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
                  status: 'editing_sections', // Save unified status
            lastModified: new Date().toISOString()
          });
        } else {
          // Create new draft if it doesn't exist
          await apiClient.drafts.updateDraft({
            sessionId: sessionId,
            userId: username,
            title: `Application for ${selectedNofo}`,
            documentIdentifier: selectedNofo,
            sections: updated,
            projectBasics: {},
            questionnaire: {},
                  status: 'editing_sections', // Save unified status
            lastModified: new Date().toISOString()
          });
        }

        // Visual feedback for save
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
        // Still show saved feedback even if DB save fails (localStorage is saved)
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
    // Save the current section content
    if (sections[activeSection]) {
      const sectionKey = sections[activeSection].name;
      const updated = { ...sectionAnswers, [sectionKey]: editorContent };
      setSectionAnswers(updated);
      localStorage.setItem("sectionAnswers", JSON.stringify(updated));

      // Save to database before continuing
      if (selectedNofo) {
        try {
          const username = (await Auth.currentAuthenticatedUser()).username;
          
          // Get current draft to preserve other fields
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
                  status: 'editing_sections', // Save unified status
              lastModified: new Date().toISOString()
            });
          } else {
            // Create new draft if it doesn't exist
            await apiClient.drafts.updateDraft({
              sessionId: sessionId,
              userId: username,
              title: `Application for ${selectedNofo}`,
              documentIdentifier: selectedNofo,
              sections: updated,
              projectBasics: {},
              questionnaire: {},
                  status: 'editing_sections', // Save unified status
              lastModified: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error("Error saving before continue:", error);
          // Continue anyway - localStorage is saved
        }
      }
    }

    // Move to the next section or continue to review
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
      
      // Get the current draft from the database
      const currentDraft = await apiClient.drafts.getDraft({
        sessionId: sessionId,
        userId: username
      });

      if (!currentDraft) {
        throw new Error('No draft found');
      }

      // Generate draft sections using data from the database
      // This uses async polling internally
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

      // Result is sections directly (Record<string, any>), not wrapped
      if (result && result[section.name]) {
        // Update the editor content with the generated section
        setEditorContent(result[section.name]);

        // Update the section answers state
        const updated = { ...sectionAnswers, [section.name]: result[section.name] };
        setSectionAnswers(updated);

        // Save to localStorage
        localStorage.setItem("sectionAnswers", JSON.stringify(updated));

        // Update the draft in the database with the new section
        const updatedDraft = await apiClient.drafts.updateDraft({
          sessionId: sessionId,
          userId: username,
          title: currentDraft.title,
          documentIdentifier: selectedNofo,
          sections: {
            ...currentDraft.sections,
            [section.name]: result[section.name]
          },
          projectBasics: currentDraft.projectBasics,
          questionnaire: currentDraft.questionnaire,
                  status: 'editing_sections', // Save unified status
          lastModified: new Date().toISOString()
        });

        // Verify the update was successful
        if (!updatedDraft.sections || !updatedDraft.sections[section.name]) {
          throw new Error('Failed to save section to database');
        }
        
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

  return (
    <div className="se-container">
      {/* Editor area - now on the left */}
      <div className="se-editor-area">
        <div className="se-editor-inner">
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
              placeholder={`Start writing your ${sections[activeSection]?.name} here...`}
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
      />
    </div>
  );
};

export default SectionEditor;

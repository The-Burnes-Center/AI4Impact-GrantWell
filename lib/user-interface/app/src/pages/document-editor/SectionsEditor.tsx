import React, { useState, useEffect, useContext, useRef } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";

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
  const appContext = useContext(AppContext);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load sections from NOFO summary API
  useEffect(() => {
    const fetchSections = async () => {
      setLoading(true);

      try {
        if (appContext && selectedNofo) {
          const apiClient = new ApiClient(appContext);
          const result = await apiClient.landingPage.getNOFOSummary(
            selectedNofo
          );

          if (result && result.data && result.data.ProjectNarrativeSections) {
            // Convert API sections to the format used by this component
            const apiSections = result.data.ProjectNarrativeSections;

            if (Array.isArray(apiSections) && apiSections.length > 0) {
              const formattedSections = apiSections.map((section) => ({
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
          // Fallback to default sections if no context or NOFO
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
        if (appContext && sessionId) {
          const apiClient = new ApiClient(appContext);
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
  }, [selectedNofo, appContext, sessionId]);

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
          if (appContext && selectedNofo) {
            try {
              const apiClient = new ApiClient(appContext);
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
    if (sections[activeSection] && appContext && selectedNofo) {
      const sectionKey = sections[activeSection].name;
      const updated = { ...sectionAnswers, [sectionKey]: editorContent };
      setSectionAnswers(updated);
      localStorage.setItem("sectionAnswers", JSON.stringify(updated));

      try {
        // Save to database
        const apiClient = new ApiClient(appContext);
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
      if (appContext && selectedNofo) {
        try {
          const apiClient = new ApiClient(appContext);
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
    if (!section || !appContext || !selectedNofo) return;

    try {
      setRegenerating(true);
      setRegenerateProgress('Generating content...');
      
      const apiClient = new ApiClient(appContext);
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
      // Show error to user
      alert(error instanceof Error ? error.message : 'Failed to generate content. Please try again.');
    } finally {
      setRegenerating(false);
      setTimeout(() => setRegenerateProgress(""), 2000);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 172px)", // Adjust for header and progress bar
      }}
    >
      {/* Editor area - now on the left */}
      <div
        style={{
          flex: 1,
          padding: "24px 32px",
          overflowY: "auto",
          background: "#f9fafb",
        }}
      >
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "12px",
            }}
          >
            {sections[activeSection]?.name || "Section Editor"}
          </h2>

          <div
            style={{
              background: "#f0f4ff",
              padding: "16px",
              borderRadius: "8px",
              borderLeft: "4px solid #14558F",
              marginBottom: "24px",
            }}
          >
            <p style={{ color: "#374151" }}>
              {sections[activeSection]?.description}
            </p>
          </div>

          {/* Editor */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              overflow: "hidden",
              marginBottom: "24px",
              background: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <button
                aria-label="Bold"
                style={{
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  borderRadius: "4px",
                  color: "#374151",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ fontWeight: "bold" }}>B</span>
              </button>
              <button
                aria-label="Italic"
                style={{
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  borderRadius: "4px",
                  color: "#374151",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ fontStyle: "italic" }}>I</span>
              </button>
              <button
                aria-label="Underline"
                style={{
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  borderRadius: "4px",
                  color: "#374151",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ textDecoration: "underline" }}>U</span>
              </button>
              <div
                style={{
                  width: "1px",
                  height: "24px",
                  background: "#e5e7eb",
                  margin: "0 8px",
                }}
              ></div>
              <button
                aria-label="Bulleted list"
                style={{
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  borderRadius: "4px",
                  color: "#374151",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <svg
                  viewBox="0 0 24 24"
                  style={{
                    width: "20px",
                    height: "20px",
                    stroke: "currentColor",
                    fill: "none",
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M21 12H3"></path>
                  <path d="M8 5h13"></path>
                  <path d="M8 19h13"></path>
                </svg>
              </button>
            </div>
            <textarea
              value={editorContent}
              onChange={handleEditorChange}
              style={{
                width: "100%",
                minHeight: "320px",
                padding: "16px",
                border: "none",
                outline: "none",
                resize: "vertical",
                fontSize: "16px",
                lineHeight: 1.6,
                color: "#1f2937",
              }}
              placeholder={`Start writing your ${sections[activeSection]?.name} here...`}
            ></textarea>
          </div>

          {/* Regenerate Content with AI button - DISABLED */}
          {false && (
            <button
              onClick={handleRegenerateContent}
              disabled={regenerating}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "12px",
                background: "#f0f4ff",
                color: "#14558F",
                border: "1px solid #d4daff",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: "pointer",
                marginBottom: "32px",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: "20px",
                  height: "20px",
                  stroke: "currentColor",
                  fill: "none",
                  strokeWidth: 2,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  marginRight: "8px",
                }}
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
              {regenerating ? "Generating..." : "Regenerate Content with AI"}
            </button>
          )}
          {regenerating && regenerateProgress && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px 16px",
                background: "#e0f2fe",
                border: "1px solid #0284c7",
                borderRadius: "6px",
                color: "#0369a1",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid #0284c7",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              {regenerateProgress}
            </div>
          )}
          <style>
            {`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}
          </style>

          {/* Content Suggestions and Completion Checklist sections - DISABLED */}
          {false && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "24px",
                marginBottom: "32px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    color: "#111827",
                    marginBottom: "12px",
                  }}
                >
                  Content Suggestions
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <button
                    style={{
                      padding: "8px 16px",
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      color: "#374151",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Add Community Impact
                  </button>
                  <button
                    style={{
                      padding: "8px 16px",
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      color: "#374151",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Add Statistics
                  </button>
                  <button
                    style={{
                      padding: "8px 16px",
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      color: "#374151",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Add Economic Impact
                  </button>
                  <button
                    style={{
                      padding: "8px 16px",
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      color: "#374151",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Add Comparison
                  </button>
                </div>
              </div>

            <div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: "12px",
                }}
              >
                Completion Checklist
              </h3>
              <div
                style={{
                  background: "white",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  <li
                    style={{
                      display: "flex",
                      alignItems: "center",
                      color: "#10b981",
                      marginBottom: "8px",
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      style={{
                        width: "16px",
                        height: "16px",
                        stroke: "currentColor",
                        fill: "none",
                        strokeWidth: 2,
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                        marginRight: "8px",
                      }}
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <path d="M22 4 12 14.01l-3-3"></path>
                    </svg>
                    <span>Described the problem</span>
                  </li>
                  <li
                    style={{
                      display: "flex",
                      alignItems: "center",
                      color: "#10b981",
                      marginBottom: "8px",
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      style={{
                        width: "16px",
                        height: "16px",
                        stroke: "currentColor",
                        fill: "none",
                        strokeWidth: 2,
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                        marginRight: "8px",
                      }}
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <path d="M22 4 12 14.01l-3-3"></path>
                    </svg>
                    <span>Included data</span>
                  </li>
                  <li
                    style={{
                      display: "flex",
                      alignItems: "center",
                      color: "#5a6169",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "1px solid #d1d5db",
                        borderRadius: "50%",
                        marginRight: "8px",
                      }}
                    ></div>
                    <span>Explained who is affected</span>
                  </li>
                  <li
                    style={{
                      display: "flex",
                      alignItems: "center",
                      color: "#5a6169",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "1px solid #d1d5db",
                        borderRadius: "50%",
                        marginRight: "8px",
                      }}
                    ></div>
                    <span>Connected to solution</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              id="save-button"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 16px",
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                color: "#374151",
                fontSize: "14px",
                cursor: "pointer",
              }}
              onClick={handleSaveProgress}
            >
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: "18px",
                  height: "18px",
                  stroke: "currentColor",
                  fill: "none",
                  strokeWidth: 2,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  marginRight: "8px",
                }}
              >
                <path d="M6 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.342a2 2 0 0 0-.602-1.43l-4.44-4.342A2 2 0 0 0 15.56 2H8a2 2 0 0 0-2 2z"></path>
                <path d="M21 9V9a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v0"></path>
              </svg>
              Save Progress
            </button>

            <div style={{ display: "flex", gap: "12px" }}>
              {activeSection > 0 && (
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    background: "white",
                    border: "1px solid #d4daff",
                    borderRadius: "6px",
                    color: "#14558F",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                  onClick={() => setActiveSection(activeSection - 1)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    style={{
                      width: "18px",
                      height: "18px",
                      stroke: "currentColor",
                      fill: "none",
                      strokeWidth: 2,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      marginRight: "8px",
                    }}
                  >
                    <path d="M19 12H5"></path>
                    <path d="m12 19-7-7 7-7"></path>
                  </svg>
                  Previous
                </button>
              )}

              {activeSection < sections.length - 1 ? (
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    background: "#14558F",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                  onClick={handleSaveAndContinue}
                >
                  Save and Review
                  <svg
                    viewBox="0 0 24 24"
                    style={{
                      width: "18px",
                      height: "18px",
                      stroke: "currentColor",
                      fill: "none",
                      strokeWidth: 2,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      marginLeft: "8px",
                    }}
                  >
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                </button>
              ) : (
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    background: "#14558F",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                  onClick={onContinue}
                >
                  Review Application
                  <svg
                    viewBox="0 0 24 24"
                    style={{
                      width: "18px",
                      height: "18px",
                      stroke: "currentColor",
                      fill: "none",
                      strokeWidth: 2,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      marginLeft: "8px",
                    }}
                  >
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sections panel - now on the right */}
      <div
        style={{
          width: "260px",
          background: "white",
          borderLeft: "1px solid #e5e7eb", // Changed from borderRight to borderLeft
          padding: "20px 16px",
          overflowY: "auto",
        }}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#111827",
            marginBottom: "16px",
          }}
        >
          Sections
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sections.map((section, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSection(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "12px",
                textAlign: "left",
                border: "none",
                borderRadius: "8px",
                    background: activeSection === idx ? "#14558F" : "transparent",
                color: activeSection === idx ? "white" : "#374151",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  background: activeSection === idx ? "white" : "#f3f4f6",
                  color: activeSection === idx ? "#14558F" : "#5a6169",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                {idx + 1}
              </div>
              <span style={{ flex: 1 }}>{section.name}</span>
              {sectionAnswers[section.name] && (
                <svg
                  viewBox="0 0 24 24"
                  style={{
                    width: "16px",
                    height: "16px",
                    stroke: activeSection === idx ? "white" : "#10b981",
                    fill: "none",
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <path d="M22 4 12 14.01l-3-3"></path>
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SectionEditor;

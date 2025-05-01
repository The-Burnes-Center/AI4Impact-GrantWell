import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import BaseAppLayout from "../../components/base-app-layout";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import "../../styles/document-editor.css";
import { v4 as uuidv4 } from "uuid";
import {
  AiService,
  AiGenerationRequest,
} from "../../components/rich-text-editor/ai-service";

// Import the components
import { AssistantPanel } from "./AssistantPanel";
import { DocumentEditorPanel } from "./DocumentEditorPanel";
import { SectionsPanel } from "./SectionsPanel";
import { SectionData, DocumentData, ChatMessage } from "./types";

export default function DocumentEditor() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder") || projectId;
  const appContext = useContext(AppContext);
  const apiClient = useMemo(() => new ApiClient(appContext), [appContext]);
  const aiService = useMemo(() => new AiService(apiClient), [apiClient]);

  // Refs
  const initialized = useRef(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);

  // Document state
  const [isLoading, setIsLoading] = useState(true);
  const [activeTabId, setActiveTabId] = useState("section-1");
  const [documentData, setDocumentData] = useState<DocumentData>({
    title: "Project Narrative",
    sections: [],
  });
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [activeSection, setActiveSection] = useState<SectionData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrativeSectionsData, setNarrativeSectionsData] = useState<any[]>([]);
  const [headerHeight, setHeaderHeight] = useState(110); // Default min-height

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "bot",
      content:
        "How can I help you with your document? Ask me about any section or for writing tips.",
    },
  ]);
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Add a new useState for the title expansion
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);

  // Add a function to handle title toggling
  const toggleTitleExpansion = useCallback(() => {
    setIsTitleExpanded((prev) => !prev);
  }, []);

  // Observer to measure header height and adjust document editor position
  useEffect(() => {
    if (!headerRef.current || !editorPanelRef.current) return;

    const updateEditorPosition = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        setHeaderHeight(height);

        // Update CSS variable
        document.documentElement.style.setProperty(
          "--header-min-height",
          `${height}px`
        );
      }
    };

    // Set up observer to watch for size changes in the header
    const resizeObserver = new ResizeObserver(updateEditorPosition);
    resizeObserver.observe(headerRef.current);

    // Initial measurement
    updateEditorPosition();

    return () => {
      resizeObserver.disconnect();
    };
  }, [documentData.title]);

  // In the observer effect, check if the title needs expansion
  useEffect(() => {
    if (!headerRef.current) return;

    const titleElement = headerRef.current.querySelector(
      ".document-title"
    ) as HTMLElement;
    const toggleButton = headerRef.current.querySelector(
      ".document-title-toggle"
    ) as HTMLElement;

    if (titleElement && toggleButton) {
      // Check if title content is truncated
      const isTruncated = titleElement.scrollHeight > titleElement.clientHeight;

      // Show toggle button if title is truncated
      toggleButton.style.display = isTruncated ? "block" : "none";
    }
  }, [headerHeight, documentData.title]);

  // Load document data
  useEffect(() => {
    if (initialized.current) return;

    const loadDocumentData = async () => {
      setIsLoading(true);

      try {
        let nofoTitle = "Project Narrative";
        let sections = [];

        if (folderParam) {
          try {
            const summary = await apiClient.landingPage.getNOFOSummary(
              folderParam
            );

            if (summary?.data?.GrantName) {
              nofoTitle = summary.data.GrantName;

              if (
                summary.data.ProjectNarrativeSections &&
                Array.isArray(summary.data.ProjectNarrativeSections) &&
                summary.data.ProjectNarrativeSections.length > 0
              ) {
                setNarrativeSectionsData(summary.data.ProjectNarrativeSections);

                sections = summary.data.ProjectNarrativeSections.map(
                  (section, index) => ({
                    id: `section-${index + 1}`,
                    title: section.item || `Section ${index + 1}`,
                    content: "<p></p>",
                    isComplete: false,
                  })
                );

                setDocumentData({ title: nofoTitle, sections });
                setActiveTabId(
                  sections.length > 0 ? sections[0].id : "section-1"
                );
                setActiveSection(sections.length > 0 ? sections[0] : null);
                updateCompletionPercentage(sections);
                initialized.current = true;
                setIsLoading(false);
                return;
              }
            } else {
              nofoTitle = formatTitleFromFolderName(folderParam);
            }
          } catch (error) {
            console.error("Error fetching NOFO summary:", error);
            nofoTitle = formatTitleFromFolderName(folderParam);
          }
        }

        // Use default sections if we get here
        const defaultSections = getDefaultSections();
        setDocumentData({ title: nofoTitle, sections: defaultSections });
        setActiveTabId("section-1");
        setActiveSection(defaultSections[0]);
        updateCompletionPercentage(defaultSections);
        initialized.current = true;
      } catch (error) {
        console.error("Error initializing document:", error);
        setError("Failed to initialize document. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDocumentData();
  }, [folderParam, apiClient]);

  // Helper function to format title from folder name
  const formatTitleFromFolderName = (folderName) => {
    return folderName
      .split("/")[0]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Helper function to get default sections
  const getDefaultSections = () => {
    return [
      {
        id: "section-1",
        title: "Executive Summary",
        content: "<p></p>",
        isComplete: false,
      },
      {
        id: "section-2",
        title: "Project Description",
        content: "<p></p>",
        isComplete: false,
      },
      {
        id: "section-3",
        title: "Goals and Objectives",
        content: "<p></p>",
        isComplete: false,
      },
      {
        id: "section-4",
        title: "Project Timeline",
        content: "<p></p>",
        isComplete: false,
      },
      {
        id: "section-5",
        title: "Budget Narrative",
        content: "<p></p>",
        isComplete: false,
      },
    ];
  };

  // Set active section when tab changes
  useEffect(() => {
    if (documentData.sections.length > 0 && !isLoading) {
      const section = documentData.sections.find((s) => s.id === activeTabId);
      if (section) {
        setActiveSection(section);
      } else if (documentData.sections.length > 0) {
        setActiveSection(documentData.sections[0]);
      }
    }
  }, [activeTabId, documentData.sections, isLoading]);

  // Handle section content changes
  const handleSectionContentChange = useCallback(
    (content: string) => {
      if (!activeSection) return;

      const updatedSections = documentData.sections.map((section) => {
        if (section.id === activeSection.id) {
          return {
            ...section,
            content: content,
            isComplete: content.trim().length > 50,
          };
        }
        return section;
      });

      setDocumentData((prevData) => ({
        ...prevData,
        sections: updatedSections,
      }));

      setActiveSection({
        ...activeSection,
        content: content,
        isComplete: content.trim().length > 50,
      });

      updateCompletionPercentage(updatedSections);
    },
    [activeSection, documentData.sections]
  );

  // Update completion percentage
  const updateCompletionPercentage = useCallback((sections: SectionData[]) => {
    if (sections.length === 0) return;

    const completedSections = sections.filter(
      (section) => section.isComplete
    ).length;
    const percentage = Math.round((completedSections / sections.length) * 100);
    setCompletionPercentage(percentage);
  }, []);

  // Handle document download
  const handleDownload = useCallback(
    (format: string) => {
      if (format === "txt") {
        const content = documentData.sections
          .map((section) => {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = section.content;
            return `## ${section.title}\n\n${tempDiv.textContent}\n\n`;
          })
          .join("");

        const element = document.createElement("a");
        const file = new Blob([content], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        element.download = `${documentData.title.replace(/\s+/g, "_")}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      } else {
        alert(`Downloading document in ${format} format...`);
      }
    },
    [documentData]
  );

  // Generate content with AI
  const handleGenerateContent = useCallback(async () => {
    if (!activeSection) return;

    setError(null);
    setIsGenerating(true);

    try {
      const request: AiGenerationRequest = {
        prompt:
          activeSection.content ||
          `Generate content for ${activeSection.title}`,
        sessionId: projectId || uuidv4(),
        documentIdentifier: folderParam || "",
        sectionTitle: activeSection.title,
      };

      const response = await aiService.generateSectionContent(request);

      if (response.success) {
        handleSectionContentChange(response.content);
      } else {
        setError(
          response.error || "Failed to generate content. Please try again."
        );
      }
    } catch (error) {
      console.error("Error generating content:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [
    activeSection,
    projectId,
    folderParam,
    aiService,
    handleSectionContentChange,
  ]);

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageInput,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setMessageInput("");
    setIsSending(true);

    try {
      // Simulate a response for now
      setTimeout(() => {
        const botResponse: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I can help you with your ${
            activeSection?.title || "document"
          }. What specific assistance do you need?`,
          timestamp: Date.now(),
        };
        setChatMessages((prev) => [...prev, botResponse]);
        setIsSending(false);
      }, 1000);
    } catch (error) {
      console.error("Error sending message:", error);
      setIsSending(false);
    }
  }, [messageInput, isSending, activeSection]);

  // Get section description
  const getSectionDescriptionText = useCallback(() => {
    if (!activeSection) return "";

    const sectionIndex = activeSection.id
      ? parseInt(activeSection.id.replace("section-", ""), 10) - 1
      : -1;

    if (sectionIndex >= 0 && narrativeSectionsData.length > sectionIndex) {
      const sectionData = narrativeSectionsData[sectionIndex];
      return (
        sectionData.description || "No description available for this section."
      );
    }

    return "Complete this section according to the grant requirements.";
  }, [activeSection, narrativeSectionsData]);

  // Header actions
  const headerActions = useMemo(
    () => (
      <div className="header-actions">
        <button
          className="btn btn-secondary"
          onClick={() => handleDownload("docx")}
        >
          Download
        </button>
        <button
          className="btn btn-primary"
          onClick={() =>
            navigate(
              `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(
                folderParam || ""
              )}`
            )
          }
        >
          Back to Chat
        </button>
      </div>
    ),
    [handleDownload, navigate, folderParam]
  );

  // Help panel content
  const helpPanelContent = (
    <div className="help-panel">
      <h3 style={{ fontSize: "24px", display: "inline", color: "#006499" }}>
        Document Editor
      </h3>
      <div style={{ color: "#006499" }}>
        <p>
          The Document Editor allows you to create and edit your project
          narrative without switching platforms.
        </p>
        <p>
          Use the tabs to navigate between different sections of your document.
        </p>
        <p>Features:</p>
        <ul>
          <li>Real-time progress tracking for each section</li>
          <li>AI-powered content generation for each section</li>
          <li>Rich text editing with formatting options</li>
          <li>Download in multiple formats</li>
          <li>Seamless integration with the chat interface</li>
        </ul>
        <p>
          Click "Generate with AI" in any section to have the AI create content
          based on your previous conversation.
        </p>
        <p>
          When you're done, you can download the complete document or return to
          the chat to continue refining your project narrative.
        </p>
      </div>
    </div>
  );

  // Updated DocumentEditorPanel component with improved section title handling
  const DocumentEditorPanel = useCallback(
    ({
      activeSection,
      handleSectionContentChange,
      handleGenerateContent,
      isGenerating,
      getSectionDescriptionText,
    }) => {
      if (!activeSection) return null;

      return (
        <div
          className="document-main"
          style={{ top: `calc(var(--header-top) + ${headerHeight}px)` }}
          ref={editorPanelRef}
        >
          <div className="section-container">
            <div className="section-header">
              <h2
                className="section-title"
                style={{
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  whiteSpace: "normal",
                  display: "block",
                  width: "100%",
                }}
              >
                {activeSection.title}
              </h2>
              <p className="section-description">
                {getSectionDescriptionText()}
              </p>
            </div>

            <div className="editor-wrapper">
              <div className="editor-with-button">
                <div
                  className="rich-text-editor"
                  dangerouslySetInnerHTML={{ __html: activeSection.content }}
                  contentEditable
                  onInput={(e) =>
                    handleSectionContentChange(e.currentTarget.innerHTML)
                  }
                />
                <button
                  className={`btn-generate ${isGenerating ? "generating" : ""}`}
                  onClick={handleGenerateContent}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <span className="loading-spinner" />
                      Generating...
                    </>
                  ) : (
                    "Generate with AI"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    },
    [headerHeight]
  );

  return (
    <BaseAppLayout
      documentIdentifier={folderParam}
      info={helpPanelContent}
      content={
        <main className="content-layout">
          {/* Document Header Section */}
          <header ref={headerRef} className="document-header">
            {/* Title and Actions Row */}
            <div className="header-content">
              <h4
                className={`document-title ${
                  isTitleExpanded ? "expanded" : ""
                }`}
              >
                {documentData.title}
              </h4>
              <button
                className="document-title-toggle"
                onClick={toggleTitleExpansion}
                aria-expanded={isTitleExpanded}
              >
                {isTitleExpanded ? "Show less" : "Show more"}
              </button>{" "}
              {headerActions}
            </div>

            {/* Progress Bar */}
            <div className="progress-bar-container">
              <div
                className={`progress-bar ${
                  completionPercentage === 100 ? "complete" : ""
                }`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="progress-details">
              {documentData.sections.filter((s) => s.isComplete).length} of{" "}
              {documentData.sections.length} sections completed
            </p>

            {/* Error Message */}
            {error && (
              <div className="alert error">
                {error}
                <button className="alert-close" onClick={() => setError(null)}>
                  ×
                </button>
              </div>
            )}
          </header>

          {/* Content Area */}
          {isLoading ? (
            <div className="loading-container">
              <div className="spinner" />
              <p>Loading document editor...</p>
            </div>
          ) : (
            <div>
              {/* Left Sidebar Chat Assistant */}
              <AssistantPanel
                activeSection={activeSection}
                chatMessages={chatMessages}
                isSending={isSending}
                messageInput={messageInput}
                setMessageInput={setMessageInput}
                handleSendMessage={handleSendMessage}
              />

              {/* Document editor area in the middle - Use our updated inline component */}
              <DocumentEditorPanel
                activeSection={activeSection}
                handleSectionContentChange={handleSectionContentChange}
                handleGenerateContent={handleGenerateContent}
                isGenerating={isGenerating}
                getSectionDescriptionText={getSectionDescriptionText}
              />

              {/* Sections sidebar on the right */}
              <SectionsPanel
                sections={documentData?.sections ?? []}
                activeSection={activeSection?.id || ""}
                onSectionChange={setActiveTabId}
              />
            </div>
          )}
        </main>
      }
    />
  );
}

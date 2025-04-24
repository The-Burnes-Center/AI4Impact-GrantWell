import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Header,
  SpaceBetween,
  Button,
  ProgressBar,
  Spinner,
  TextContent,
  ContentLayout,
  Container,
  ButtonDropdown,
  HelpPanel,
  Alert,
} from "@cloudscape-design/components";
import BaseAppLayout from "../../components/base-app-layout";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import "../../styles/checklists.css";
import "../../styles/document-editor.css";
import { v4 as uuidv4 } from "uuid";
import {
  AiService,
  AiGenerationRequest,
} from "../../components/rich-text-editor/ai-service";

// Import the components we've split out
import { AssistantPanel } from "./AssistantPanel";
import { DocumentEditorPanel } from "./DocumentEditorPanel";
import { SectionsPanel } from "./SectionsPanel";
import { SectionData, DocumentData, ChatMessage } from "./types";
import { getDefaultGuidanceText, getSectionDescription } from "./utils";

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

  // Document state variables
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

  // Chat state variables
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "bot",
      content:
        "How can I help you with your document? Ask me about any section or for writing tips.",
    },
  ]);
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Load document data with dynamic NOFO title
  useEffect(() => {
    if (initialized.current) return;

    const loadDocumentData = async () => {
      setIsLoading(true);

      try {
        // Get the NOFO title by fetching the summary
        let nofoTitle = "Project Narrative";

        if (folderParam) {
          try {
            const summary = await apiClient.landingPage.getNOFOSummary(
              folderParam
            );

            // Check if summary.data.GrantName exists
            if (summary?.data?.GrantName) {
              nofoTitle = summary.data.GrantName;

              // Get narrative sections from the summary if available
              if (
                summary.data.ProjectNarrativeSections &&
                Array.isArray(summary.data.ProjectNarrativeSections) &&
                summary.data.ProjectNarrativeSections.length > 0
              ) {
                // Store the complete narrative sections data for later reference
                setNarrativeSectionsData(summary.data.ProjectNarrativeSections);

                // Create sections with empty content
                const sections = summary.data.ProjectNarrativeSections.map(
                  (section, index) => ({
                    id: `section-${index + 1}`,
                    title: section.item || `Section ${index + 1}`,
                    content: "<p></p>", // Empty content
                    isComplete: false,
                  })
                );

                // Set document data
                setDocumentData({
                  title: nofoTitle,
                  sections: sections,
                });

                // Set active tab ID to first section
                const firstSectionId =
                  sections.length > 0 ? sections[0].id : "section-1";
                setActiveTabId(firstSectionId);

                // Set active section
                setActiveSection(sections.length > 0 ? sections[0] : null);

                // Update completion percentage
                updateCompletionPercentage(sections);

                // Mark as initialized
                initialized.current = true;
                setIsLoading(false);
                return;
              }
            } else {
              // If no specific grant name is found, use the folder name as title
              nofoTitle = folderParam
                .split("/")[0]
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase());
            }
          } catch (error) {
            console.error("Error fetching NOFO summary:", error);
            // Fall back to clean folder name if there's an error
            nofoTitle = folderParam
              .split("/")[0]
              .replace(/-/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase());
          }
        }

        // If we get here, we need to use default sections
        const defaultSections = [
          {
            id: "section-1",
            title: "Executive Summary",
            content: "<p></p>", // Empty content
            isComplete: false,
          },
          {
            id: "section-2",
            title: "Project Description",
            content: "<p></p>", // Empty content
            isComplete: false,
          },
          {
            id: "section-3",
            title: "Goals and Objectives",
            content: "<p></p>", // Empty content
            isComplete: false,
          },
          {
            id: "section-4",
            title: "Project Timeline",
            content: "<p></p>", // Empty content
            isComplete: false,
          },
          {
            id: "section-5",
            title: "Budget Narrative",
            content: "<p></p>", // Empty content
            isComplete: false,
          },
        ];

        // Set document data with defaults
        setDocumentData({
          title: nofoTitle,
          sections: defaultSections,
        });

        // Set active tab to first section
        setActiveTabId("section-1");

        // Set active section to first section
        setActiveSection(defaultSections[0]);

        // Update completion percentage
        updateCompletionPercentage(defaultSections);

        // Mark as initialized
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

  // Set active section when tab changes - separate from data loading
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

  // Function to handle section content changes
  const handleSectionContentChange = useCallback(
    (content: string) => {
      if (!activeSection) return;

      const updatedSections = documentData.sections.map((section) => {
        if (section.id === activeSection.id) {
          return {
            ...section,
            content: content,
            isComplete: content.trim().length > 50, // Simple heuristic to determine completion
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

  // Function to update completion percentage
  const updateCompletionPercentage = useCallback((sections: SectionData[]) => {
    if (sections.length === 0) return;

    const completedSections = sections.filter(
      (section) => section.isComplete
    ).length;
    const percentage = Math.round((completedSections / sections.length) * 100);
    setCompletionPercentage(percentage);
  }, []);

  // Function to download document
  const handleDownload = useCallback(
    (format: string) => {
      // Simple example for text download
      if (format === "txt") {
        // Create a text version of the HTML content
        const content = documentData.sections
          .map((section) => {
            // Simple conversion of HTML to text (not perfect, but works for basic content)
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
        // In a real implementation, this would call an API endpoint to generate and download the document
        alert(`Downloading document in ${format} format...`);
      }
    },
    [documentData]
  );

  // Function to generate content with AI
  const handleGenerateContent = useCallback(async () => {
    if (!activeSection) return;

    setError(null);
    setIsGenerating(true);

    try {
      // Prepare request to the AI service
      const request: AiGenerationRequest = {
        prompt:
          activeSection.content ||
          "Generate content for " + activeSection.title,
        sessionId: projectId || uuidv4(),
        documentIdentifier: folderParam || "",
        sectionTitle: activeSection.title,
      };

      // Call the AI service
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

  // Function to handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || isSending) return;

    // Add user message to chat
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
      // In a real implementation, this would call an API to get the response
      // For now, we'll simulate a response
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

    // Get the index from the section id (e.g., "section-1" -> 0)
    const sectionIndex = activeSection.id
      ? parseInt(activeSection.id.replace("section-", ""), 10) - 1
      : -1;

    // Get description from narrativeSectionsData if available
    if (sectionIndex >= 0 && narrativeSectionsData.length > sectionIndex) {
      const sectionData = narrativeSectionsData[sectionIndex];
      return (
        sectionData.description || "No description available for this section."
      );
    }

    return "Complete this section according to the grant requirements.";
  }, [activeSection, narrativeSectionsData]);

  // Memoize the header actions to prevent unnecessary re-renders
  const headerActions = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <ButtonDropdown
          items={[
            { id: "docx", text: "Word (.docx)" },
            { id: "pdf", text: "PDF (.pdf)" },
            { id: "txt", text: "Plain Text (.txt)" },
          ]}
          onItemClick={({ detail }) => handleDownload(detail.id)}
        >
          Download
        </ButtonDropdown>
        <Button
          variant="primary"
          onClick={() =>
            navigate(
              `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(
                folderParam || ""
              )}`
            )
          }
        >
          Back to Chat
        </Button>
      </SpaceBetween>
    ),
    [handleDownload, navigate, folderParam]
  );

  return (
    <BaseAppLayout
      documentIdentifier={folderParam}
      info={
        <HelpPanel
          header={
            <h3
              style={{ fontSize: "24px", display: "inline", color: "#006499" }}
            >
              Document Editor
            </h3>
          }
        >
          <div style={{ color: "#006499" }}>
            <p>
              The Document Editor allows you to create and edit your project
              narrative without switching platforms.
            </p>
            <p>
              Use the tabs to navigate between different sections of your
              document.
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
              Click "Generate with AI" in any section to have the AI create
              content based on your previous conversation.
            </p>
            <p>
              When you're done, you can download the complete document or return
              to the chat to continue refining your project narrative.
            </p>
          </div>
        </HelpPanel>
      }
      content={
        <ContentLayout
          header={
            <div
              style={{
                position: "absolute",
                left: "280px", // Align with document panel left edge
                right: "240px", // Align with document panel right edge
                textAlign: "center", // Center text content
                paddingTop: "20px",
                paddingBottom: "20px",
              }}
            >
              <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                <SpaceBetween size="m">
                  <Header
                    variant="h1"
                    actions={headerActions}
                    description={`Progress: ${completionPercentage}% complete`}
                  >
                    {documentData.title}
                  </Header>

                  <Box padding="s">
                    <ProgressBar
                      value={completionPercentage}
                      additionalInfo={`${
                        documentData.sections.filter((s) => s.isComplete).length
                      } of ${documentData.sections.length} sections completed`}
                      status={
                        completionPercentage === 100 ? "success" : "in-progress"
                      }
                    />
                  </Box>

                  {error && (
                    <Alert
                      type="error"
                      dismissible
                      onDismiss={() => setError(null)}
                    >
                      {error}
                    </Alert>
                  )}
                </SpaceBetween>
              </div>
            </div>
          }
        >
          {isLoading ? (
            <Container>
              <Box textAlign="center" padding="xl">
                <Spinner size="large" />
                <p>Loading document editor...</p>
              </Box>
            </Container>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar Chat Assistant */}
              <AssistantPanel
                activeSection={activeSection}
                chatMessages={chatMessages}
                isSending={isSending}
                messageInput={messageInput}
                setMessageInput={setMessageInput}
                handleSendMessage={handleSendMessage}
              />

              {/* Document editor area in the middle */}
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
        </ContentLayout>
      }
    />
  );
}

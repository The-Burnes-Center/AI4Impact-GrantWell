import React, { useState, useEffect, useContext } from "react";
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
import TipTapEditor from "../../components/rich-text-editor/tip-tap-editor";
import DocumentSidebar from "../../components/rich-text-editor/document-sidebar";
import { AiService, AiGenerationRequest } from "../../components/rich-text-editor/ai-service";

// Interface for section data
interface SectionData {
  id: string;
  title: string;
  content: string;
  isComplete: boolean;
}

// Interface for document data
interface DocumentData {
  title: string;
  sections: SectionData[];
}

export default function DocumentEditor() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder") || projectId;
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const aiService = new AiService(apiClient);
  
  // State variables
  const [isLoading, setIsLoading] = useState(true);
  const [activeTabId, setActiveTabId] = useState("section-1");
  const [documentData, setDocumentData] = useState<DocumentData>({
    title: "Project Narrative",
    sections: []
  });
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [activeSection, setActiveSection] = useState<SectionData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock data - in a real implementation, this would come from an API call
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      const mockData: DocumentData = {
        title: "Green and Resilient Springfield",
        sections: [
          {
            id: "section-1",
            title: "Executive Summary",
            content: "<p>This section provides a brief overview of the project, including its purpose, scope, and expected outcomes.</p>",
            isComplete: false
          },
          {
            id: "section-2",
            title: "Project Description",
            content: "<p>Detail the specific activities, methodologies, and approaches that will be employed in this project.</p>",
            isComplete: false
          },
          {
            id: "section-3",
            title: "Project Goals and Objectives",
            content: "<p>Clearly state the goals and objectives of the project, ensuring they are specific, measurable, achievable, relevant, and time-bound (SMART).</p>",
            isComplete: false
          },
          {
            id: "section-4", 
            title: "Project Timeline",
            content: "<p>Provide a detailed timeline for the project, including key milestones and deliverables.</p>",
            isComplete: false
          },
          {
            id: "section-5",
            title: "Budget Narrative",
            content: "<p>Explain how project funds will be allocated and justify each expenditure.</p>",
            isComplete: false
          }
        ]
      };
      
      setDocumentData(mockData);
      setActiveSection(mockData.sections.find(s => s.id === activeTabId) || null);
      updateCompletionPercentage(mockData.sections);
      setIsLoading(false);
    }, 1500);
  }, []);

  // Set active section when tab changes
  useEffect(() => {
    if (documentData.sections.length > 0) {
      setActiveSection(documentData.sections.find(s => s.id === activeTabId) || null);
    }
  }, [activeTabId, documentData.sections]);

  // Function to handle section content changes
  const handleSectionContentChange = (content: string) => {
    if (!activeSection) return;

    const updatedSections = documentData.sections.map(section => {
      if (section.id === activeSection.id) {
        return {
          ...section,
          content: content,
          isComplete: content.trim().length > 50 // Simple heuristic to determine completion
        };
      }
      return section;
    });

    const updatedDocumentData = {
      ...documentData,
      sections: updatedSections
    };

    setDocumentData(updatedDocumentData);
    setActiveSection({
      ...activeSection,
      content: content,
      isComplete: content.trim().length > 50
    });
    updateCompletionPercentage(updatedSections);
  };

  // Function to update completion percentage
  const updateCompletionPercentage = (sections: SectionData[]) => {
    if (sections.length === 0) return;
    
    const completedSections = sections.filter(section => section.isComplete).length;
    const percentage = Math.round((completedSections / sections.length) * 100);
    setCompletionPercentage(percentage);
  };

  // Function to download document
  const handleDownload = (format: string) => {
    // In a real implementation, this would call an API endpoint to generate and download the document
    alert(`Downloading document in ${format} format...`);
    
    // Simple example for text download
    if (format === 'txt') {
      // Create a text version of the HTML content
      const content = documentData.sections.map(section => {
        // Simple conversion of HTML to text (not perfect, but works for basic content)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = section.content;
        return `## ${section.title}\n\n${tempDiv.textContent}\n\n`;
      }).join('');
      
      const element = document.createElement('a');
      const file = new Blob([content], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `${documentData.title.replace(/\s+/g, '_')}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  // Function to generate content with AI
  const handleGenerateContent = async () => {
    if (!activeSection) return;
    
    setError(null);
    setIsGenerating(true);
    
    try {
      // Prepare request to the AI service
      const request: AiGenerationRequest = {
        prompt: activeSection.content || "Generate content for " + activeSection.title,
        sessionId: projectId || uuidv4(),
        documentIdentifier: folderParam || '',
        sectionTitle: activeSection.title
      };
      
      // Call the AI service
      const response = await aiService.generateSectionContent(request);
      
      if (response.success) {
        handleSectionContentChange(response.content);
      } else {
        setError(response.error || "Failed to generate content. Please try again.");
      }
    } catch (error) {
      console.error('Error generating content:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <BaseAppLayout
      documentIdentifier={folderParam}
      info={
        <HelpPanel
          header={<h3 style={{ fontSize: '24px', display: 'inline', color: '#006499' }}>Document Editor</h3>}
        >
          <div style={{ color: '#006499' }}>
            <p>
              The Document Editor allows you to create and edit your project narrative without switching platforms.
            </p>
            <p>
              Use the tabs to navigate between different sections of your document.
            </p>
            <p>
              Features:
            </p>
            <ul>
              <li>Real-time progress tracking for each section</li>
              <li>AI-powered content generation for each section</li>
              <li>Rich text editing with formatting options</li>
              <li>Download in multiple formats</li>
              <li>Seamless integration with the chat interface</li>
            </ul>
            <p>
              Click "Generate with AI" in any section to have the AI create content based on your previous conversation.
            </p>
            <p>
              When you're done, you can download the complete document or return to the chat to continue refining your project narrative.
            </p>
          </div>
        </HelpPanel>
      }
      content={
        <ContentLayout
          header={
            <SpaceBetween size="m">
              <Header
                variant="h1"
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <ButtonDropdown
                      items={[
                        { id: "docx", text: "Word (.docx)" },
                        { id: "pdf", text: "PDF (.pdf)" },
                        { id: "txt", text: "Plain Text (.txt)" }
                      ]}
                      onItemClick={({ detail }) => handleDownload(detail.id)}
                    >
                      Download
                    </ButtonDropdown>
                    <Button variant="primary" onClick={() => navigate(`/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(folderParam || '')}`)}>
                      Back to Chat
                    </Button>
                  </SpaceBetween>
                }
              >
                {documentData.title}
              </Header>
              
              <Box padding="s">
                <SpaceBetween direction="vertical" size="xs">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Document Progress</span>
                    <span>{completionPercentage}%</span>
                  </div>
                  <ProgressBar 
                    value={completionPercentage}
                    additionalInfo={`${documentData.sections.filter(s => s.isComplete).length} of ${documentData.sections.length} sections completed`}
                    status={completionPercentage === 100 ? "success" : "in-progress"}
                  />
                </SpaceBetween>
              </Box>

              {error && (
                <Alert type="error" dismissible onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              )}
            </SpaceBetween>
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
            <Container>
              <div className="document-layout">
                <DocumentSidebar 
                  sections={documentData.sections}
                  activeSection={activeTabId}
                  onSectionChange={setActiveTabId}
                />
                <div className="document-main">
                  {activeSection ? (
                    <div>
                      <TextContent>
                        <h2>{activeSection.title}</h2>
                        <p>
                          {activeSection.content.length === 0 
                            ? "This section hasn't been filled out yet. Use the 'Generate with AI' button to create content automatically, or write your own content below." 
                            : "Edit the content below as needed. You can regenerate this section with AI if desired."}
                        </p>
                      </TextContent>
                      
                      <Box margin={{ top: "m" }}>
                        <TipTapEditor 
                          content={activeSection.content}
                          onChange={handleSectionContentChange}
                          onGenerateAI={handleGenerateContent}
                          isGenerating={isGenerating}
                        />
                      </Box>
                    </div>
                  ) : (
                    <Box textAlign="center" padding="xl">
                      <p>Select a section from the sidebar to start editing</p>
                    </Box>
                  )}
                </div>
              </div>
            </Container>
          )}
        </ContentLayout>
      }
    />
  );
}
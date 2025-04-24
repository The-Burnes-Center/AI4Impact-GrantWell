import React from "react";
import { Box, TextContent, Spinner } from "@cloudscape-design/components";
import TipTapEditor from "../../components/rich-text-editor/tip-tap-editor";
import { DocumentEditorPanelProps } from "./types";

export const DocumentEditorPanel: React.FC<DocumentEditorPanelProps> = ({
  activeSection,
  handleSectionContentChange,
  handleGenerateContent,
  isGenerating,
  getSectionDescriptionText,
}) => {
  return (
    <div
      className="document-main"
      style={{
        position: "absolute", // Use absolute positioning
        top: "200px", // Increased from 160px to lower the panel
        bottom: 0,
        left: "280px", // Start exactly where assistant panel ends
        right: "240px", // End exactly where sections panel starts
        padding: "0 24px",
        overflow: "auto",
        height: "calc(100vh - 200px)", // Updated to match new top value
        backgroundColor: "white",
      }}
    >
      {activeSection ? (
        <div style={{ height: "100%" }}>
          <TextContent>
            <h2>{activeSection.title}</h2>
            <p>{getSectionDescriptionText()}</p>
          </TextContent>

          <div style={{ marginTop: "16px", height: "calc(100% - 150px)" }}>
            <div style={{ height: "100%", minHeight: "500px" }}>
              <TipTapEditor
                content={activeSection.content}
                onChange={handleSectionContentChange}
                onGenerateAI={handleGenerateContent}
                isGenerating={isGenerating}
              />
            </div>
          </div>
        </div>
      ) : (
        <Box textAlign="center" padding="xl">
          <p>Select a section from the sidebar to start editing</p>
        </Box>
      )}
    </div>
  );
};

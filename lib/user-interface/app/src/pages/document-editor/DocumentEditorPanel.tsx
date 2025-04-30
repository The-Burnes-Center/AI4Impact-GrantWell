import React from "react";
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
    <div className="document-main">
      {activeSection ? (
        <div className="section-container">
          <div className="section-header">
            <h2
              className="section-title"
              style={{
                wordBreak: "break-word",
                overflowWrap: "break-word",
                whiteSpace: "normal",
                width: "100%",
                maxWidth: "100%",
                display: "block",
              }}
            >
              {activeSection.title}
            </h2>
            <p className="section-description">{getSectionDescriptionText()}</p>
          </div>

          <div className="editor-wrapper">
            <div className="editor-with-button">
              <TipTapEditor
                content={activeSection.content}
                onChange={handleSectionContentChange}
                onGenerateAI={handleGenerateContent}
                isGenerating={isGenerating}
              />
              <button
                onClick={handleGenerateContent}
                disabled={isGenerating}
                className={`btn-generate ${isGenerating ? "generating" : ""}`}
                aria-label={
                  isGenerating
                    ? "Generating content..."
                    : "Generate content with AI"
                }
              >
                {isGenerating ? (
                  <>
                    <div className="loading-spinner"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <span>Generate with AI</span>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>Select a section from the sidebar to start editing</p>
        </div>
      )}
    </div>
  );
};

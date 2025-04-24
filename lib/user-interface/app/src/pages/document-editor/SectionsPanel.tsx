import React from "react";
import DocumentSidebar from "../../components/rich-text-editor/document-sidebar";
import { SectionsPanelProps } from "./types";

export const SectionsPanel: React.FC<SectionsPanelProps> = ({
  sections,
  activeSection,
  onSectionChange,
}) => {
  return (
    <div
      style={{
        width: "240px", // Slightly narrower
        position: "fixed", // Fixed position
        right: 0,
        top: "160px", // Adjust based on your header height
        bottom: 0,
        borderLeft: "1px solid #ccc",
        backgroundColor: "#f5f5f5",
        overflow: "auto",
        zIndex: 10,
        height: "calc(100vh - 160px)", // Calculate height based on viewport
      }}
    >
      <DocumentSidebar
        sections={sections}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />
    </div>
  );
};

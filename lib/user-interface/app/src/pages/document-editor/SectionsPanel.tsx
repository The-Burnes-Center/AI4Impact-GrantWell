import React from "react";
import { SectionsPanelProps } from "./types";

export const SectionsPanel: React.FC<SectionsPanelProps> = ({
  sections,
  activeSection,
  onSectionChange,
}) => {
  return (
    <div className="sections-panel">
      <div className="document-sidebar">
        <h3>Sections</h3>
        <ul>
          {sections.map((section) => (
            <li
              key={section.id}
              className={section.id === activeSection ? "active" : ""}
              onClick={() => onSectionChange(section.id)}
            >
              <div className="section-list-item">
                <span
                  className={section.id === activeSection ? "active-text" : ""}
                >
                  {section.title}
                </span>
                {section.isComplete && <span className="completed">✓</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

import React from "react";
import { CheckCircle } from "lucide-react";

interface Section {
  name: string;
  description: string;
}

interface SectionsSidebarProps {
  sections: Section[];
  activeSection: number;
  setActiveSection: (idx: number) => void;
  sectionAnswers: { [key: string]: string };
}

const SectionsSidebar: React.FC<SectionsSidebarProps> = ({
  sections,
  activeSection,
  setActiveSection,
  sectionAnswers,
}) => {
  return (
    <div className="se-sidebar">
      <h3 className="se-sidebar__title">Sections</h3>
      <div className="se-sidebar__list">
        {sections.map((section, idx) => (
          <button
            key={idx}
            onClick={() => setActiveSection(idx)}
            className={`se-sidebar__btn${activeSection === idx ? " se-sidebar__btn--active" : ""}`}
          >
            <div className="se-sidebar__number">{idx + 1}</div>
            <span className="se-sidebar__name">{section.name}</span>
            {sectionAnswers[section.name] && (
              <CheckCircle size={16} className="se-sidebar__check" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SectionsSidebar;

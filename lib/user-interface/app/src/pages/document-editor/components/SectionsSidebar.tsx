import React from "react";
import { CheckCircle, Circle, AlertCircle, Loader } from "lucide-react";

interface Section {
  name: string;
  description: string;
}

interface SectionsSidebarProps {
  sections: Section[];
  activeSection: number;
  setActiveSection: (idx: number) => void;
  sectionAnswers: { [key: string]: string };
  generating?: boolean;
  completedSectionCount?: number;
  failedSections?: string[];
}

const SectionsSidebar = React.memo(function SectionsSidebar({
  sections,
  activeSection,
  setActiveSection,
  sectionAnswers,
  generating,
  completedSectionCount = 0,
  failedSections = [],
}: SectionsSidebarProps) {
  const getStatusIcon = (section: Section, idx: number) => {
    // Section has content — completed
    if (sectionAnswers[section.name]) {
      return <CheckCircle size={16} className="se-sidebar__check" aria-label={`${section.name}: completed`} />;
    }

    // Section explicitly failed
    if (failedSections.includes(section.name)) {
      return <AlertCircle size={16} style={{ color: '#EF4444' }} aria-label={`${section.name}: failed`} />;
    }

    // Currently generating — show spinner for sections in the active concurrency window
    if (generating) {
      // Estimate which sections are actively generating:
      // sections at indices [completedSectionCount .. completedSectionCount + 5) are in-flight
      const isActivelyGenerating = idx >= completedSectionCount && idx < completedSectionCount + 5;
      if (isActivelyGenerating) {
        return (
          <Loader
            size={16}
            className="se-sidebar__spinner"
            style={{ color: '#3B82F6', animation: 'spin 1s linear infinite' }}
            aria-label={`${section.name}: generating`}
          />
        );
      }
      // Pending — not yet started
      return <Circle size={16} style={{ color: '#D1D5DB' }} aria-label={`${section.name}: pending`} />;
    }

    return null;
  };

  return (
    <div className="se-sidebar">
      <h3 className="se-sidebar__title">
        Sections
        {generating && (
          <span style={{ fontSize: '13px', fontWeight: 400, color: '#6B7280', marginLeft: 8 }}>
            {completedSectionCount}/{sections.length} generated
          </span>
        )}
      </h3>
      <div className="se-sidebar__list">
        {sections.map((section, idx) => (
          <button
            key={idx}
            onClick={() => setActiveSection(idx)}
            className={`se-sidebar__btn${activeSection === idx ? " se-sidebar__btn--active" : ""}`}
            aria-label={`Section ${idx + 1} of ${sections.length}: ${section.name}`}
          >
            <div className="se-sidebar__number">{idx + 1}</div>
            <span className="se-sidebar__name">{section.name}</span>
            {getStatusIcon(section, idx)}
          </button>
        ))}
      </div>
    </div>
  );
});

export default SectionsSidebar;

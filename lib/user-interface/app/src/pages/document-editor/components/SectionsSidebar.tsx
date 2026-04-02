import React from "react";
import { CheckCircle, AlertCircle, Loader, Lock } from "lucide-react";

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
  const isSectionReady = (section: Section) => {
    return !!sectionAnswers[section.name] || failedSections.includes(section.name);
  };

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
      // Pending — locked
      return <Lock size={14} style={{ color: '#9CA3AF' }} aria-label={`${section.name}: pending`} />;
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
        {sections.map((section, idx) => {
          const locked = generating && !isSectionReady(section);
          return (
            <button
              key={idx}
              onClick={() => { if (!locked) setActiveSection(idx); }}
              className={`se-sidebar__btn${activeSection === idx ? " se-sidebar__btn--active" : ""}${locked ? " se-sidebar__btn--locked" : ""}`}
              aria-label={`Section ${idx + 1} of ${sections.length}: ${section.name}${locked ? " (generating, not yet available)" : ""}`}
              aria-disabled={locked}
              title={locked ? "This section is still being generated" : undefined}
              style={locked ? { cursor: "not-allowed", opacity: 0.55 } : undefined}
            >
              <div className="se-sidebar__number">{idx + 1}</div>
              <span className="se-sidebar__name">{section.name}</span>
              {getStatusIcon(section, idx)}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default SectionsSidebar;

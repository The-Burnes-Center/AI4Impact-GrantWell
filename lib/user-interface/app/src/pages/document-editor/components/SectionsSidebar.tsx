import React from "react";
import { CheckCircle, AlertCircle, Loader, Lock } from "lucide-react";

interface Section {
  name: string;
  description: string;
}

const CONCURRENCY_WINDOW = 5;

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

  // Backend generates sections in a sliding window of CONCURRENCY_WINDOW; anything
  // past it is still queued. Icon and accessible name must both use this test.
  const isActivelyGenerating = (idx: number) =>
    !!generating && idx >= completedSectionCount && idx < completedSectionCount + CONCURRENCY_WINDOW;

  const getStatus = (section: Section, idx: number) => {
    if (sectionAnswers[section.name]) return "completed";
    if (failedSections.includes(section.name)) return "failed";
    if (!generating) return "";
    return isActivelyGenerating(idx) ? "generating" : "pending";
  };

  const getStatusIcon = (section: Section, idx: number) => {
    switch (getStatus(section, idx)) {
      case "completed":
        return <CheckCircle size={16} className="se-sidebar__check" aria-label={`${section.name}: completed`} />;
      case "failed":
        return <AlertCircle size={16} style={{ color: '#EF4444' }} aria-label={`${section.name}: failed`} />;
      case "generating":
        return (
          <Loader
            size={16}
            className="se-sidebar__spinner"
            style={{ color: '#23776C', animation: 'spin 1s linear infinite' }}
            aria-label={`${section.name}: generating`}
          />
        );
      case "pending":
        return <Lock size={14} style={{ color: '#6b7280' }} aria-label={`${section.name}: pending`} />;
      default:
        return null;
    }
  };

  // Coarse on purpose: the generator flips up to CONCURRENCY_WINDOW sections at
  // once, so announcing each pending -> generating -> completed step would flood
  // the queue. Empty until the section list arrives, so the text lands as a
  // mutation on an already-mounted region.
  const overallStatus =
    sections.length === 0
      ? ""
      : generating
        ? `Generating ${sections.length} sections.`
        : completedSectionCount > 0
          ? `Section generation finished. ${completedSectionCount} of ${sections.length} sections generated.`
          : "";

  return (
    <div className="se-sidebar">
      <div role="status" aria-live="polite" className="visually-hidden">
        {overallStatus}
      </div>
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
          const status = getStatus(section, idx);
          return (
            <button
              key={idx}
              onClick={() => { if (!locked) setActiveSection(idx); }}
              className={`se-sidebar__btn${activeSection === idx ? " se-sidebar__btn--active" : ""}${locked ? " se-sidebar__btn--locked" : ""}`}
              aria-label={`Section ${idx + 1} of ${sections.length}: ${section.name}${status ? `, ${status}` : ""}${locked ? " (not yet available)" : ""}`}
              aria-current={activeSection === idx ? "true" : undefined}
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

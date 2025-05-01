import React from 'react';
import { SideNavigation } from '@cloudscape-design/components';

interface SectionItem {
  id: string;
  title: string;
  isComplete: boolean;
}

interface DocumentSidebarProps {
  sections: SectionItem[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
}

const DocumentSidebar: React.FC<DocumentSidebarProps> = ({ 
  sections, 
  activeSection, 
  onSectionChange 
}) => {
  const items = sections.map(section => ({
    type: 'link',
    text: section.title,
    href: `#${section.id}`,
    info: section.isComplete ? '✓' : '',
  }));

  return (
    <div className="document-sidebar">
      <SideNavigation
        header={{ text: 'Document Sections', href: '#' }}
        items={items}
        activeHref={`#${activeSection}`}
        onFollow={event => {
          event.preventDefault();
          const sectionId = event.detail.href.substring(1); // Remove the '#' character
          onSectionChange(sectionId);
        }}
      />
    </div>
  );
};

export default DocumentSidebar; 
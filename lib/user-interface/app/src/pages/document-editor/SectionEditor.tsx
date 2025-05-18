import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ApiClient } from '../../common/api-client/api-client';
import { AppContext } from '../../common/app-context';
import '../styles/section-editor.css';

interface Section {
  name: string;
  description: string;
  guidance?: string;
}

const SectionEditor: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sectionIndex } = useParams<{ sectionIndex: string }>();
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [currentSectionIdx, setCurrentSectionIdx] = useState<number>(0);
  const [sectionAnswers, setSectionAnswers] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const appContext = React.useContext(AppContext);
  const apiClient = new ApiClient(appContext);

  // Fetch NOFO and section list on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const nofo = searchParams.get('nofo');
    if (nofo) {
      setSelectedNofo(decodeURIComponent(nofo));
      fetchSections(decodeURIComponent(nofo));
    }
    // Load saved answers
    const saved = localStorage.getItem('sectionAnswers');
    if (saved) {
      setSectionAnswers(JSON.parse(saved));
    }
  }, [location]);

  // Set current section index from URL
  useEffect(() => {
    if (sectionIndex) {
      setCurrentSectionIdx(Number(sectionIndex));
    }
  }, [sectionIndex]);

  // Fetch section list from NOFO (reuse your backend logic)
  const fetchSections = async (nofo: string) => {
    setLoading(true);
    try {
      // This should call your backend or S3 to get the section list for the NOFO
      // For now, we'll mock it:
      // const result = await apiClient.landingPage.getNOFOSummary(nofo);
      // const sectionList = result.data.ProjectNarrativeSections.map(s => ({ name: s.item, description: s.description }));
      // setSections(sectionList);
      // MOCK:
      setSections([
        { name: 'Project Summary', description: 'A brief summary of your project.' },
        { name: 'Statement of Need', description: 'Explain the problem your project will solve.' },
        { name: 'Goals & Objectives', description: 'List the goals and objectives of your project.' },
        { name: 'Project Activities', description: 'Describe the main activities you will complete.' },
        { name: 'Evaluation Plan', description: 'How will you measure success?' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Save answer to localStorage
  const handleAnswerChange = (value: string) => {
    const sectionKey = sections[currentSectionIdx]?.name || '';
    const updated = { ...sectionAnswers, [sectionKey]: value };
    setSectionAnswers(updated);
    localStorage.setItem('sectionAnswers', JSON.stringify(updated));
  };

  // Navigation
  const goToSection = (idx: number) => {
    const queryParams = selectedNofo ? `?nofo=${encodeURIComponent(selectedNofo)}` : '';
    navigate(`/document-editor/section/${idx}${queryParams}`);
  };

  const handleContinue = () => {
    if (currentSectionIdx < sections.length - 1) {
      goToSection(currentSectionIdx + 1);
    } else {
      // End of sections, go to review/export
      navigate(`/document-editor/review`);
    }
  };

  const handleSave = () => {
    localStorage.setItem('sectionAnswers', JSON.stringify(sectionAnswers));
    // Optionally show a toast/notification
  };

  if (loading || !sections.length) {
    return <div className="section-editor-loading">Loading sections...</div>;
  }

  const section = sections[currentSectionIdx];
  const answer = sectionAnswers[section.name] || '';

  return (
    <div className="section-editor-container">
      {/* Navigation Bar */}
      <div className="section-nav-bar">
        {sections.map((s, idx) => (
          <div
            key={s.name}
            className={`section-nav-item${idx === currentSectionIdx ? ' active' : ''}`}
            onClick={() => goToSection(idx)}
          >
            {s.name}
          </div>
        ))}
      </div>

      {/* Section Title and Guidance */}
      <div className="section-header">
        <h2>{section.name}</h2>
        <div className="section-guidance">
          <div className="section-about">
            <strong>About this section:</strong> {section.description}
          </div>
          <div className="section-help-buttons">
            <button className="help-btn">See Example</button>
            <button className="help-btn">Write This For Me</button>
          </div>
        </div>
      </div>

      {/* Rich Text Editor (simple textarea for now) */}
      <div className="section-editor-box">
        <textarea
          className="section-textarea"
          value={answer}
          onChange={e => handleAnswerChange(e.target.value)}
          placeholder={`Write your answer for "${section.name}" here...`}
          rows={8}
        />
      </div>

      {/* Suggestions and Checklist (mocked for now) */}
      <div className="section-suggestions">
        <div className="suggestion-title">Add to your answer:</div>
        <div className="suggestion-list">
          <div className="suggestion-item">Add Community Impact</div>
          <div className="suggestion-item">Add Statistics</div>
          <div className="suggestion-item">Add Economic Impact</div>
          <div className="suggestion-item">Add Comparison</div>
        </div>
      </div>
      <div className="section-checklist">
        <div className="checklist-title">Section Checklist:</div>
        <ul>
          <li className="checklist-complete">Described the current problem</li>
          <li className="checklist-complete">Included specific data</li>
          <li className="checklist-incomplete">Explained who is affected</li>
          <li className="checklist-incomplete">Connected to your solution</li>
        </ul>
      </div>

      {/* Navigation Buttons */}
      <div className="section-editor-actions">
        <button className="save-btn" onClick={handleSave}>Save Progress</button>
        <button className="continue-btn" onClick={handleContinue}>
          {currentSectionIdx < sections.length - 1 ? 'Continue to Next Section' : 'Finish & Review'}
        </button>
      </div>
    </div>
  );
};

export default SectionEditor; 
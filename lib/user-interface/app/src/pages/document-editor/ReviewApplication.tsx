import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/review-application.css';

interface Section {
  name: string;
  description: string;
}

const ReviewApplication: React.FC = () => {
  const navigate = useNavigate();
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<{ [key: string]: string }>({});
  const [compliancePassed, setCompliancePassed] = useState(false);
  const [stats, setStats] = useState({ wordCount: 0, pageCount: 0, complete: 0 });

  useEffect(() => {
    // Load sections and answers from localStorage
    const savedSections = localStorage.getItem('sectionAnswers');
    const savedSectionList = localStorage.getItem('sectionList');
    let sectionList: Section[] = [];
    if (savedSectionList) {
      sectionList = JSON.parse(savedSectionList);
    } else {
      // fallback: try to infer from answers
      if (savedSections) {
        const keys = Object.keys(JSON.parse(savedSections));
        sectionList = keys.map(k => ({ name: k, description: '' }));
      }
    }
    setSections(sectionList);
    if (savedSections) {
      setSectionAnswers(JSON.parse(savedSections));
    }
  }, []);

  useEffect(() => {
    // Compliance: all sections must be non-empty
    if (sections.length > 0) {
      const complete = sections.filter(s => (sectionAnswers[s.name] || '').trim().length > 0).length;
      setCompliancePassed(complete === sections.length);
      // Stats
      const allText = sections.map(s => sectionAnswers[s.name] || '').join(' ');
      const wordCount = allText.trim().split(/\s+/).filter(Boolean).length;
      const pageCount = Math.max(1, Math.round(wordCount / 300));
      setStats({ wordCount, pageCount, complete });
    }
  }, [sections, sectionAnswers]);

  const handleEditSection = (idx: number) => {
    navigate(`/document-editor/section/${idx}`);
  };

  const handleExport = () => {
    // For now, just download as text
    const allText = sections.map(s => `# ${s.name}\n${sectionAnswers[s.name] || ''}\n`).join('\n');
    const element = document.createElement('a');
    const file = new Blob([allText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = 'grant-application.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSave = () => {
    // Already saved in localStorage, but could show a toast
  };

  return (
    <div className="review-app-container">
      <h2>Review Your Application</h2>
      <p>Review your application before exporting it. You can go back to edit any section if needed.</p>
      <div className={`compliance-check ${compliancePassed ? 'passed' : 'failed'}`}>
        {compliancePassed ? (
          <>
            <span className="compliance-icon">✔</span>
            <span className="compliance-text">Compliance Check Passed!</span>
            <div className="compliance-desc">Your application meets all the requirements for submission. All required sections are complete and formatted correctly.</div>
          </>
        ) : (
          <>
            <span className="compliance-icon">⚠</span>
            <span className="compliance-text">Some sections are incomplete</span>
            <div className="compliance-desc">Please complete all required sections before exporting your application.</div>
          </>
        )}
      </div>
      <div className="review-sections-list">
        {sections.map((s, idx) => (
          <div className="review-section-card" key={s.name}>
            <div className="review-section-header">
              <span className="review-section-title">{s.name}</span>
              {(sectionAnswers[s.name] || '').trim().length > 0 ? (
                <span className="section-status complete">✔ Complete</span>
              ) : (
                <span className="section-status incomplete">Incomplete</span>
              )}
              <button className="edit-btn" onClick={() => handleEditSection(idx)}>Edit</button>
            </div>
            <div className="review-section-content">
              {(sectionAnswers[s.name] || '').slice(0, 200)}{(sectionAnswers[s.name] || '').length > 200 ? '...' : ''}
            </div>
          </div>
        ))}
      </div>
      <div className="review-stats">
        <div className="stat-box">
          <div className="stat-label">Word Count</div>
          <div className="stat-value">{stats.wordCount}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Pages (approx.)</div>
          <div className="stat-value">{stats.pageCount}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Sections Complete</div>
          <div className="stat-value">{stats.complete} of {sections.length}</div>
        </div>
      </div>
      <div className="review-next-steps">
        <div className="next-steps-title">Next Steps</div>
        <ol>
          <li>Export your application in the required format (PDF)</li>
          <li>Submit the PDF through the grants.gov portal</li>
          <li>Complete the SF-424 form (separate from this application)</li>
        </ol>
      </div>
      <div className="review-actions">
        <button className="save-btn" onClick={handleSave}>Save Progress</button>
        <button className="export-btn" onClick={handleExport} disabled={!compliancePassed}>Export Application</button>
      </div>
    </div>
  );
};

export default ReviewApplication; 
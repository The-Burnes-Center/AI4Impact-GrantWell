import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/draft-preview.css';

const DraftPreview: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [projectBasics, setProjectBasics] = useState<any>(null);
  const [questionnaire, setQuestionnaire] = useState<any>(null);
  const [draftContent, setDraftContent] = useState<string>('');

  // Load data from previous steps
  useEffect(() => {
    // Get data from location state or localStorage
    const locationState = location.state || {};
    
    // Get NOFO info
    const nofo = locationState.nofo;
    if (nofo) {
      setSelectedNofo(nofo);
    } else {
      const searchParams = new URLSearchParams(location.search);
      const urlNofo = searchParams.get('nofo');
      if (urlNofo) {
        setSelectedNofo(decodeURIComponent(urlNofo));
      }
    }

    // Get project basics
    const basics = locationState.projectBasics;
    if (basics) {
      setProjectBasics(basics);
    } else {
      const savedBasics = localStorage.getItem('projectBasics');
      if (savedBasics) {
        setProjectBasics(JSON.parse(savedBasics));
      }
    }

    // Get questionnaire responses
    const questions = locationState.questionnaire;
    if (questions) {
      setQuestionnaire(questions);
    } else {
      const savedQuestionnaire = localStorage.getItem('quickQuestionnaire');
      if (savedQuestionnaire) {
        setQuestionnaire(JSON.parse(savedQuestionnaire));
      }
    }
  }, [location]);

  // Generate draft content when data is loaded
  useEffect(() => {
    if (projectBasics && questionnaire) {
      generateDraftContent();
    }
  }, [projectBasics, questionnaire]);

  // Generate draft content from collected information
  const generateDraftContent = () => {
    // Create a basic template for the draft
    const draft = `
# ${projectBasics.projectName}
### ${projectBasics.municipalityName}

## Project Summary
Our project addresses a critical need in our community. ${questionnaire.problemSolution}

## Project Details
**Requested Amount:** ${projectBasics.requestedAmount}
**Project Duration:** ${projectBasics.projectDuration}

## Supporting Data
${questionnaire.supportingData}

## Project Beneficiaries
${questionnaire.beneficiaries}

## Main Activities
${questionnaire.activities}

## Expected Outcomes
${questionnaire.expectedResults}

## Contact Information
**Primary Contact:** ${projectBasics.contactName}
**Email:** ${projectBasics.contactEmail}
    `;

    setDraftContent(draft);
  };

  const handleEditProject = () => {
    const queryParams = selectedNofo ? `?nofo=${encodeURIComponent(selectedNofo)}` : '';
    navigate(`/document-editor/project-basics${queryParams}`, { 
      state: { 
        projectBasics,
        nofo: selectedNofo 
      } 
    });
  };

  const handleEditQuestionnaire = () => {
    const queryParams = selectedNofo ? `?nofo=${encodeURIComponent(selectedNofo)}` : '';
    navigate(`/document-editor/questionnaire${queryParams}`, { 
      state: { 
        projectBasics,
        questionnaire,
        nofo: selectedNofo 
      } 
    });
  };

  const handleExportDocument = () => {
    // Simple download as text file for demo purposes
    const element = document.createElement('a');
    const file = new Blob([draftContent], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${projectBasics?.projectName || 'grant-application'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="draft-preview-container">
      <div className="draft-preview-card">
        <div className="draft-preview-header">
          <h1>Application Draft</h1>
        </div>
        
        <div className="draft-preview-content">
          <p className="instruction-text">
            Here's a draft of your grant application based on your answers. You can edit, continue working on it, or export it.
            {selectedNofo && (
              <span className="selected-nofo">Selected NOFO: {selectedNofo}</span>
            )}
          </p>
          
          <div className="editor-controls">
            <button className="edit-button" onClick={handleEditProject}>
              Edit Project Basics
            </button>
            <button className="edit-button" onClick={handleEditQuestionnaire}>
              Edit Questionnaire
            </button>
            <button className="export-button" onClick={handleExportDocument}>
              Export Document
            </button>
          </div>
          
          <div className="draft-content">
            <pre>{draftContent}</pre>
          </div>
        </div>
        
        <div className="draft-actions">
          <p className="feedback-text">How can we improve this draft?</p>
          <div className="feedback-buttons">
            <button className="feedback-button">Improve Language</button>
            <button className="feedback-button">Add Details</button>
            <button className="feedback-button">Shorten Text</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DraftPreview; 
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/project-basics.css';

interface ProjectBasicsFormData {
  projectName: string;
  municipalityName: string;
  requestedAmount: string;
  projectDuration: string;
  contactName: string;
  contactEmail: string;
}

const ProjectBasics: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProjectBasicsFormData>({
    projectName: '',
    municipalityName: '',
    requestedAmount: '',
    projectDuration: '',
    contactName: '',
    contactEmail: '',
  });

  // Parse query parameters to get the selected NOFO
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const nofo = searchParams.get('nofo');
    if (nofo) {
      setSelectedNofo(decodeURIComponent(nofo));
    }
  }, [location]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const handleContinue = () => {
    // Save form data to localStorage or state management
    localStorage.setItem('projectBasics', JSON.stringify(formData));
    
    // Navigate to the questionnaire with the collected data
    const queryParams = selectedNofo ? `?nofo=${encodeURIComponent(selectedNofo)}` : '';
    navigate(`/document-editor/questionnaire${queryParams}`, { 
      state: { 
        projectBasics: formData,
        nofo: selectedNofo 
      } 
    });
  };

  return (
    <div className="project-basics-container">
      <div className="project-basics-card">
        <div className="project-basics-header">
          <h1>Project Basics</h1>
        </div>
        
        <div className="project-basics-content">
          <p className="instruction-text">
            Let's start with some basic information about your project.
            {selectedNofo && (
              <span className="selected-nofo">Selected NOFO: {selectedNofo}</span>
            )}
          </p>
          
          <div className="form-group">
            <label htmlFor="projectName">Project Name</label>
            <input
              type="text"
              id="projectName"
              name="projectName"
              value={formData.projectName}
              onChange={handleInputChange}
              placeholder="Downtown Revitalization Project"
              className="form-control"
            />
            <small className="form-text">Keep it clear and descriptive. 5-10 words recommended</small>
          </div>
          
          <div className="form-group">
            <label htmlFor="municipalityName">Municipality Name</label>
            <input
              type="text"
              id="municipalityName"
              name="municipalityName"
              value={formData.municipalityName}
              onChange={handleInputChange}
              placeholder="City of Oakridge"
              className="form-control"
            />
          </div>
          
          <div className="form-row">
            <div className="form-group half-width">
              <label htmlFor="requestedAmount">Requested Amount</label>
              <input
                type="text"
                id="requestedAmount"
                name="requestedAmount"
                value={formData.requestedAmount}
                onChange={handleInputChange}
                placeholder="$250,000"
                className="form-control"
              />
            </div>
            
            <div className="form-group half-width">
              <label htmlFor="projectDuration">Project Duration</label>
              <input
                type="text"
                id="projectDuration"
                name="projectDuration"
                value={formData.projectDuration}
                onChange={handleInputChange}
                placeholder="18 months"
                className="form-control"
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="contactName">Primary Contact Name</label>
            <input
              type="text"
              id="contactName"
              name="contactName"
              value={formData.contactName}
              onChange={handleInputChange}
              placeholder="Jane Smith"
              className="form-control"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="contactEmail">Contact Email</label>
            <input
              type="email"
              id="contactEmail"
              name="contactEmail"
              value={formData.contactEmail}
              onChange={handleInputChange}
              placeholder="jsmith@oakridge.gov"
              className="form-control"
            />
          </div>
        </div>
        
        <div className="form-actions">
          <button 
            className="continue-button"
            onClick={handleContinue}
          >
            Continue <span className="arrow-icon">→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectBasics; 
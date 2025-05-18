import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/quick-questionnaire.css';

interface QuestionnaireFormData {
  problemSolution: string;
  beneficiaries: string;
  activities: string;
  expectedResults: string;
  supportingData: string;
}

const QuickQuestionnaire: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  const [projectBasics, setProjectBasics] = useState<any>(null);
  const [formData, setFormData] = useState<QuestionnaireFormData>({
    problemSolution: '',
    beneficiaries: '',
    activities: '',
    expectedResults: '',
    supportingData: ''
  });

  // Load previous data and NOFO information
  useEffect(() => {
    // Get NOFO from query params
    const searchParams = new URLSearchParams(location.search);
    const nofo = searchParams.get('nofo');
    if (nofo) {
      setSelectedNofo(decodeURIComponent(nofo));
    }

    // Get project basics from location state or localStorage
    const basics = location.state?.projectBasics;
    if (basics) {
      setProjectBasics(basics);
    } else {
      const savedBasics = localStorage.getItem('projectBasics');
      if (savedBasics) {
        setProjectBasics(JSON.parse(savedBasics));
      }
    }

    // Load any previously saved questionnaire data
    const savedQuestionnaire = localStorage.getItem('quickQuestionnaire');
    if (savedQuestionnaire) {
      setFormData(JSON.parse(savedQuestionnaire));
    }
  }, [location]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const handleCreateDraft = () => {
    // Save questionnaire data to localStorage
    localStorage.setItem('quickQuestionnaire', JSON.stringify(formData));
    
    // Navigate to the success page with collected data
    const queryParams = selectedNofo ? `?nofo=${encodeURIComponent(selectedNofo)}` : '';
    navigate(`/document-editor/draft-created${queryParams}`, { 
      state: { 
        projectBasics,
        questionnaire: formData,
        nofo: selectedNofo 
      } 
    });
  };

  return (
    <div className="questionnaire-container">
      <div className="questionnaire-card">
        <div className="questionnaire-header">
          <h1>Quick Questionnaire</h1>
        </div>
        
        <div className="questionnaire-content">
          <p className="instruction-text">
            Answer these simple questions to help us create a draft of your application. Don't worry about perfect
            answers - you can edit everything later.
            {selectedNofo && (
              <span className="selected-nofo">Selected NOFO: {selectedNofo}</span>
            )}
          </p>
          
          <div className="form-group">
            <label htmlFor="problemSolution">1. What problem will your project solve?</label>
            <textarea
              id="problemSolution"
              name="problemSolution"
              value={formData.problemSolution}
              onChange={handleInputChange}
              placeholder="Example: Our downtown area has high vacancy rates and deteriorating infrastructure that makes it unsafe and unappealing."
              className="form-control"
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="beneficiaries">2. Who will benefit from this project?</label>
            <textarea
              id="beneficiaries"
              name="beneficiaries"
              value={formData.beneficiaries}
              onChange={handleInputChange}
              placeholder="Example: Local businesses, residents, visitors, and particularly seniors and people with disabilities who currently struggle with accessibility."
              className="form-control"
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="activities">3. What are the main activities you'll complete?</label>
            <textarea
              id="activities"
              name="activities"
              value={formData.activities}
              onChange={handleInputChange}
              placeholder="Example: Sidewalk repairs, street lighting installation, facade improvements, and creating a public gathering space."
              className="form-control"
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="expectedResults">4. What results do you expect to achieve?</label>
            <textarea
              id="expectedResults"
              name="expectedResults"
              value={formData.expectedResults}
              onChange={handleInputChange}
              placeholder="Example: Reduced vacancy rates, increased foot traffic, improved safety, and a 15% increase in business revenue."
              className="form-control"
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="supportingData">5. Do you have any specific data or statistics about the problem?</label>
            <textarea
              id="supportingData"
              name="supportingData"
              value={formData.supportingData}
              onChange={handleInputChange}
              placeholder="Example: 37% vacancy rate in storefronts, 68% of residents feel unsafe downtown after dark, 22% decline in business revenue since 2018."
              className="form-control"
              rows={4}
            />
          </div>
        </div>
        
        <div className="form-actions">
          <button 
            className="create-draft-button"
            onClick={handleCreateDraft}
          >
            Create Draft <span className="arrow-icon">→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickQuestionnaire; 
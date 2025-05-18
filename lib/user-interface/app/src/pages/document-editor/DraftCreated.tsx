import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/draft-created.css';

const DraftCreated: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  
  // Load NOFO information
  useEffect(() => {
    const locationState = location.state || {};
    
    // Get NOFO info from state or query params
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
  }, [location]);

  const handleStartEditing = () => {
    // Navigate to the first section editor with the selected NOFO
    const queryParams = selectedNofo ? `?nofo=${encodeURIComponent(selectedNofo)}` : '';
    navigate(`/document-editor/section/0${queryParams}`);
  };

  return (
    <div className="draft-created-container">
      <div className="draft-created-card">
        <div className="success-icon-container">
          <div className="success-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17L4 12"></path>
            </svg>
          </div>
        </div>
        
        <h1 className="draft-created-title">Draft Created!</h1>
        
        <p className="draft-created-message">
          We've created a starting draft of your grant application based 
          on your answers. Now you can review and improve each section.
        </p>
        
        <div className="next-steps-container">
          <h2 className="next-steps-title">What happens next:</h2>
          <ul className="next-steps-list">
            <li>
              <span className="step-icon">›</span>
              Go through each section one by one
            </li>
            <li>
              <span className="step-icon">›</span>
              Edit the pre-filled content or add your own
            </li>
            <li>
              <span className="step-icon">›</span>
              Use our AI assistant to improve any section
            </li>
            <li>
              <span className="step-icon">›</span>
              Review and export when you're done
            </li>
          </ul>
        </div>
        
        <button 
          className="start-editing-button"
          onClick={handleStartEditing}
        >
          Start Editing <span className="arrow-icon">→</span>
        </button>
      </div>
    </div>
  );
};

export default DraftCreated; 
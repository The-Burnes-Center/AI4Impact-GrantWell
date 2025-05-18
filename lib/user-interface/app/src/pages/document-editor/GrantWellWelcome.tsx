import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/welcome-styles.css';

const GrantWellWelcome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedNofo, setSelectedNofo] = useState<string | null>(null);
  
  // Check if there's a NOFO in the query parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const nofo = searchParams.get('nofo');
    if (nofo) {
      setSelectedNofo(decodeURIComponent(nofo));
    } else {
      // Check if there's a folder parameter (backwards compatibility)
      const folder = searchParams.get('folder');
      if (folder) {
        setSelectedNofo(decodeURIComponent(folder));
      }
    }
  }, [location]);

  const startNewApplication = () => {
    // Navigate to the project basics form with the selected NOFO
    const queryParams = selectedNofo ? `?nofo=${encodeURIComponent(selectedNofo)}` : '';
    navigate(`/document-editor/project-basics${queryParams}`);
  };

  const watchHowItWorks = () => {
    // Implement video playback or tutorial navigation logic
    window.open('https://www.youtube.com/watch?v=demo', '_blank');
  };

  const seeSampleApplications = () => {
    // Navigate to sample applications page
    navigate('/samples');
  };

  return (
    <div className="grantwell-welcome-container">
      <div className="grantwell-welcome-card">
        <h1 className="grantwell-title">GrantWell</h1>
        <h2 className="grantwell-subtitle">Grant Writing Made Simple</h2>
        
        <p className="grantwell-description">
          Welcome to GrantWell, your step-by-step assistant for creating successful grant 
          applications. We'll guide you through each part of the process with simple
          instructions and helpful examples.
          {selectedNofo && (
            <span className="grantwell-selected-nofo">Selected NOFO: {selectedNofo}</span>
          )}
        </p>
        
        <button 
          className="grantwell-primary-button"
          onClick={startNewApplication}
        >
          Start New Application <span className="arrow-icon">→</span>
        </button>
        
        <div className="grantwell-secondary-actions">
          <button 
            className="grantwell-video-button"
            onClick={watchHowItWorks}
          >
            <span className="play-icon">▶</span> Watch How It Works (2 min)
          </button>
          
          <button 
            className="grantwell-samples-button"
            onClick={seeSampleApplications}
          >
            <span className="document-icon">📄</span> See Sample Applications
          </button>
        </div>
        
        <div className="grantwell-footer">
          Need help? Contact <a href="mailto:support@grantwell.com">support@grantwell.com</a>
        </div>
      </div>
    </div>
  );
};

export default GrantWellWelcome; 
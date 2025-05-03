import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { SpaceBetween, Spinner, Badge, Cards, Button } from '@cloudscape-design/components';
import useGrantRecommendations from '../../hooks/useGrantRecommendations';
import { GrantRecommendation } from '../../hooks/useGrantRecommendations';
import { Auth } from 'aws-amplify';
import { LuPin } from "react-icons/lu";
import { LuPinOff } from "react-icons/lu";

// Define interface for pinned grants
interface PinnableGrant extends GrantRecommendation {
  isPinned: boolean;
}

interface IntegratedSearchBarProps {
  documents: { label: string; value: string }[];
  onSelectDocument: (document: { label: string; value: string }) => void;
  isLoading: boolean;
}

const IntegratedSearchBar: React.FC<IntegratedSearchBarProps> = ({ 
  documents, 
  onSelectDocument,
  isLoading 
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filteredDocuments, setFilteredDocuments] = useState(documents);
  const [pinnedGrants, setPinnedGrants] = useState<PinnableGrant[]>([]);
  const [filteredPinnedGrants, setFilteredPinnedGrants] = useState<PinnableGrant[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Simplified assistant states
  const [showAssistant, setShowAssistant] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [recommendedGrants, setRecommendedGrants] = useState<GrantRecommendation[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  
  // Use grant recommendations hook
  const { 
    loading: recommendationsLoading, 
    recommendations, 
    getRecommendationsUsingREST 
  } = useGrantRecommendations();
  
  // Check if user is admin
  const checkUserIsAdmin = async () => {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const userRole = user?.signInUserSession?.idToken?.payload["custom:role"];
      return userRole && userRole.includes("Admin");
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  };
  
  // Check admin permissions on component mount
  useEffect(() => {
    const checkAdmin = async () => {
      const adminStatus = await checkUserIsAdmin();
      setIsAdmin(adminStatus);
    };
    
    checkAdmin();
  }, []);

  // Load pinned grants from localStorage on component mount
  useEffect(() => {
    try {
      const savedPinnedGrants = localStorage.getItem('pinnedGrants');
      if (savedPinnedGrants) {
        setPinnedGrants(JSON.parse(savedPinnedGrants));
      }
    } catch (error) {
      console.error("Error loading pinned grants:", error);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter documents and get recommendations when search term changes
  useEffect(() => {
    // Filter existing documents
    const filtered = documents.filter(doc => 
      doc.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredDocuments(filtered);
    
    // Filter pinned grants
    const filteredPinned = pinnedGrants.filter(grant => 
      grant.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredPinnedGrants(filteredPinned);

    // Get recommendations if search term is long enough
    if (searchTerm.length >= 3) {
      getRecommendationsUsingREST(searchTerm);
    }
  }, [searchTerm, documents, pinnedGrants, getRecommendationsUsingREST]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Total items (pinned grants + filtered documents + recommendations)
    const totalItems = filteredPinnedGrants.length + filteredDocuments.length + (recommendations?.grants?.length || 0);
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        if (selectedIndex < filteredPinnedGrants.length) {
          // Select a pinned grant
          handlePinnedGrantSelect(filteredPinnedGrants[selectedIndex]);
        } else if (selectedIndex < filteredPinnedGrants.length + filteredDocuments.length) {
          // Select a document
          const docIndex = selectedIndex - filteredPinnedGrants.length;
          onSelectDocument(filteredDocuments[docIndex]);
        } else {
          // Select a recommendation
          const recIndex = selectedIndex - (filteredPinnedGrants.length + filteredDocuments.length);
          const recommendation = recommendations?.grants[recIndex];
          if (recommendation) {
            handleRecommendationSelect(recommendation);
          }
        }
        setShowResults(false);
      }
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  // Handle selecting a pinned grant
  const handlePinnedGrantSelect = (grant: PinnableGrant) => {
    // Set the search term
    setSearchTerm(grant.name);
    
    // Find the matching document if needed for further processing
    const matchedDoc = documents.find(doc => doc.label === grant.name);
    if (matchedDoc) {
      onSelectDocument(matchedDoc);
    }
    
    // Close the dropdown
    setShowResults(false);
  };

  // Handle selecting a recommendation
  const handleRecommendationSelect = (recommendation: GrantRecommendation) => {
    // Set the search term
    setSearchTerm(recommendation.name);
    
    // Find the matching document if needed for further processing
    const matchedDoc = documents.find(doc => doc.label === recommendation.name);
    if (matchedDoc) {
      onSelectDocument(matchedDoc);
    }
    
    // Close the dropdown
    setShowResults(false);
  };
  
  // Styles
  const searchContainerStyle: React.CSSProperties = {
    position: 'relative',
    maxWidth: '650px',
    width: '100%',
    margin: '0 auto',
    zIndex: 100
  };

  const inputContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
  };

  const searchIconStyle: React.CSSProperties = {
    position: 'absolute',
    left: '15px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#666',
    pointerEvents: 'none',
    zIndex: 1,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 20px 14px 45px',
    fontSize: '16px',
    borderRadius: '25px',
    border: '1px solid #e0e0e0',
    boxSizing: 'border-box',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'all 0.2s ease',
    backgroundColor: '#ffffff',
  };

  const resultsContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: '0 0 15px 15px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
    maxHeight: '400px',
    overflowY: 'auto',
    zIndex: 10,
    marginTop: '5px',
    border: '1px solid #e0e0e0',
  };

  const resultItemStyle: React.CSSProperties = {
    padding: '12px 15px',
    cursor: 'pointer',
    borderBottom: '1px solid #f0f0f0',
    transition: 'background-color 0.2s',
  };

  const selectedItemStyle: React.CSSProperties = {
    ...resultItemStyle,
    backgroundColor: '#f0f7ff',
    borderLeft: '3px solid #0073bb',
  };
  
  const pinnedItemStyle: React.CSSProperties = {
    ...resultItemStyle,
    borderLeft: '3px solid #00a1b2',
    backgroundColor: '#f0ffff',
  };
  
  const selectedPinnedItemStyle: React.CSSProperties = {
    ...pinnedItemStyle,
    backgroundColor: '#e0f7f7',
    borderLeft: '3px solid #0073bb',
  };
  
  const sectionHeaderStyle: React.CSSProperties = {
    padding: '10px 15px',
    backgroundColor: '#f9f9f9',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#666',
  };

  const recommendationItemStyle: React.CSSProperties = {
    padding: '12px 15px',
    cursor: 'pointer',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const recommendationDetailsStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#666',
    marginTop: '3px',
  };
  
  const emptyPromptStyle: React.CSSProperties = {
    padding: '20px',
    textAlign: 'center',
    color: '#555',
    fontSize: '14px',
  };

  const pinnedBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: '11px',
    backgroundColor: '#00a1b2',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '10px',
    marginLeft: '6px',
    verticalAlign: 'middle',
  };
  
  const recommendedBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: '11px',
    backgroundColor: '#0073bb',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '10px',
    marginLeft: '6px',
  };

  // Pin/unpin button styles
  const pinButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    marginLeft: '8px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
  };
  
  const unpinButtonStyle: React.CSSProperties = {
    ...pinButtonStyle,
    color: '#E74C3C', // Red color for unpinning
  };

  // Handle submitting the use case to get grant recommendations
  const handleAssistantSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!assistantInput.trim()) return;
    
    setIsAssistantLoading(true);
    
    // Simulate response (in a real implementation, this would call the API)
    setTimeout(() => {
      // For demo purposes, generate contextual responses based on keywords
      const keywords = assistantInput.toLowerCase();
      
      if (keywords.includes('infrastructure') || keywords.includes('transportation') || keywords.includes('road')) {
        setRecommendedGrants([
          {
            id: "RAISE-2025",
            name: "Rebuilding American Infrastructure with Sustainability and Equity (RAISE)",
            matchScore: 92,
            eligibilityMatch: true,
            fundingAmount: "$1-25 million",
            deadline: "April 30, 2025",
            keyRequirements: ["State/local government applicants", "Project readiness documentation", "Benefit-cost analysis"],
            summaryUrl: "RAISE/",
            matchReason: "Highly relevant for transportation infrastructure projects"
          },
          {
            id: "INFRA-2025",
            name: "Infrastructure for Rebuilding America (INFRA)",
            matchScore: 85,
            eligibilityMatch: true,
            fundingAmount: "$5-100 million",
            deadline: "May 15, 2025",
            keyRequirements: ["Minimum project size: $5 million", "Highway or freight projects", "Environmental approvals"],
            summaryUrl: "INFRA/",
            matchReason: "Targets large-scale infrastructure needs"
          },
          {
            id: "STBG-2024",
            name: "Surface Transportation Block Grant",
            matchScore: 80,
            eligibilityMatch: true,
            fundingAmount: "$2-15 million",
            deadline: "September 30, 2024",
            keyRequirements: ["State DOT or MPO sponsorship", "Road classification requirements", "Local match (20%)"],
            summaryUrl: "STBG-2024/",
            matchReason: "Flexible funding for various transportation projects"
          }
        ]);
      } else if (keywords.includes('renewable') || keywords.includes('energy') || keywords.includes('solar') || keywords.includes('climate')) {
        setRecommendedGrants([
          {
            id: "CERI-2025",
            name: "Clean Energy Research Initiative",
            matchScore: 94,
            eligibilityMatch: true,
            fundingAmount: "$500,000-2 million",
            deadline: "June 12, 2025",
            keyRequirements: ["Technology innovation component", "Emissions reduction metrics", "Community engagement plan"],
            summaryUrl: "CERI/",
            matchReason: "Perfect match for renewable energy innovation"
          },
          {
            id: "CCUS-2025",
            name: "Carbon Capture Utilization and Storage",
            matchScore: 76,
            eligibilityMatch: true,
            fundingAmount: "$2-15 million",
            deadline: "August 3, 2025",
            keyRequirements: ["Technical feasibility study", "Environmental impact assessment", "Public-private partnership"],
            summaryUrl: "CCUS/",
            matchReason: "Supports carbon reduction technologies"
          },
          {
            id: "REAP-2024",
            name: "Rural Energy for America Program",
            matchScore: 88,
            eligibilityMatch: true,
            fundingAmount: "$100,000-500,000",
            deadline: "October 31, 2024",
            keyRequirements: ["Rural location", "Agricultural producer or small business", "25% cost share"],
            summaryUrl: "REAP-2024/",
            matchReason: "Targeted support for rural energy projects"
          }
        ]);
      } else if (keywords.includes('rural') || keywords.includes('community') || keywords.includes('small town')) {
        setRecommendedGrants([
          {
            id: "RCDI-2025",
            name: "Rural Community Development Initiative",
            matchScore: 97,
            eligibilityMatch: true,
            fundingAmount: "$50,000-250,000",
            deadline: "May 22, 2025",
            keyRequirements: ["Population under 50,000", "Technical assistance component", "Community support documentation"],
            summaryUrl: "RCDI/",
            matchReason: "Specifically designed for rural community needs"
          },
          {
            id: "RDUL-2025",
            name: "Rural Development Utilities Loans",
            matchScore: 82,
            eligibilityMatch: true,
            fundingAmount: "$100,000-3 million",
            deadline: "Rolling applications",
            keyRequirements: ["Critical infrastructure focus", "Underserved community benefit", "Economic impact analysis"],
            summaryUrl: "RDUL/",
            matchReason: "Infrastructure financing for rural areas"
          },
          {
            id: "CDBG-2024",
            name: "Community Development Block Grant",
            matchScore: 85,
            eligibilityMatch: true,
            fundingAmount: "$500,000-2 million",
            deadline: "December 15, 2024",
            keyRequirements: ["Low-moderate income benefit", "Community participation process", "Detailed project plan"],
            summaryUrl: "CDBG-2024/",
            matchReason: "Flexible funding for various community needs"
          }
        ]);
      } else {
        // Default recommendations if no specific keywords match
        setRecommendedGrants([
          {
            id: "CDBG-2024",
            name: "Community Development Block Grant",
            matchScore: 75,
            eligibilityMatch: true,
            fundingAmount: "$500,000-2 million",
            deadline: "December 15, 2024",
            keyRequirements: ["Low-moderate income benefit", "Community participation process", "Detailed project plan"],
            summaryUrl: "CDBG-2024/",
            matchReason: "Widely applicable to many municipal needs"
          },
          {
            id: "BRIC-2024",
            name: "Building Resilient Infrastructure and Communities",
            matchScore: 70,
            eligibilityMatch: true,
            fundingAmount: "$1-50 million",
            deadline: "January 30, 2025",
            keyRequirements: ["Hazard mitigation focus", "Benefit-cost analysis", "Reduces risk to community"],
            summaryUrl: "BRIC-2024/",
            matchReason: "Supports many types of community infrastructure"
          },
          {
            id: "LWCF-2024",
            name: "Land and Water Conservation Fund",
            matchScore: 65,
            eligibilityMatch: true,
            fundingAmount: "$100,000-1 million",
            deadline: "March 1,, 2025",
            keyRequirements: ["Recreation focus", "Public access", "Permanent protection"],
            summaryUrl: "LWCF-2024/",
            matchReason: "Broadly applicable for public use projects"
          }
        ]);
      }
      
      setIsAssistantLoading(false);
    }, 1500);
  };
  
  // Handle navigation to grant
  const handleAssistantGrantClick = (summaryUrl: string) => {
    navigate(`/landing-page/basePage/checklists/${encodeURIComponent(summaryUrl)}`);
    setShowResults(false);
    setShowAssistant(false);
  };
  
  // Handle starting a chat with a grant
  const handleStartChatWithGrant = (summaryUrl: string) => {
    navigate(`/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(summaryUrl)}`);
    setShowResults(false);
    setShowAssistant(false);
  };

  // Handle opening the simplified recommendation assistant
  const openRecommendationAssistant = (query?: string) => {
    setShowAssistant(true);
    
    if (query) {
      setAssistantInput(query);
      // Small delay to ensure UI is visible before submitting
      setTimeout(() => {
        handleAssistantSubmit();
      }, 100);
    } else {
      // Clear previous results if no query
      setRecommendedGrants([]);
    }
  };

  // Close assistant and reset
  const closeAssistant = () => {
    setShowAssistant(false);
    setAssistantInput('');
    setRecommendedGrants([]);
  };

  const assistantContainerStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRadius: '0 0 15px 15px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
    padding: '16px',
    maxHeight: '600px',
    display: 'flex',
    flexDirection: 'column'
  };

  const assistantHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 0 16px 0',
    borderBottom: '1px solid #e0e0e0',
  };
  
  const assistantCloseButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#555',
    fontSize: '20px',
    padding: '4px 8px',
  };
  
  const assistantInputContainerStyle: React.CSSProperties = {
    display: 'flex',
    padding: '16px 0',
    borderBottom: '1px solid #e0e0e0',
  };
  
  const assistantInputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 16px',
    borderRadius: '20px',
    border: '1px solid #e0e0e0',
    fontSize: '14px',
  };
  
  const assistantSubmitButtonStyle: React.CSSProperties = {
    backgroundColor: '#0073BB',
    color: 'white',
    border: 'none',
    borderRadius: '20px',
    padding: '0 20px',
    marginLeft: '8px',
    cursor: 'pointer',
  };
  
  const grantsContainerStyle: React.CSSProperties = {
    padding: '16px 0',
    overflow: 'auto',
    maxHeight: '400px'
  };

  const assistantButtonStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '8px 15px',
    backgroundColor: '#0073BB',
    color: 'white',
    borderRadius: '20px',
    fontSize: '14px',
    marginTop: '10px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  };

  const grantCardStyle: React.CSSProperties = {
    padding: '16px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    marginBottom: '16px',
    border: '1px solid #e0e0e0',
  };

  const grantCardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  };

  const grantCardTitleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#006499',
  };

  const grantCardDetailStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#666',
    marginTop: '4px',
  };

  const grantCardRequirementsStyle: React.CSSProperties = {
    margin: '12px 0',
    paddingLeft: '20px',
    fontSize: '13px',
  };

  const grantCardActionsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '12px',
  };

  // Function to check if a specific NOFO is pinned
  const isNofoPinned = (nofoName: string): boolean => {
    // Normalize the name by trimming
    const normalizedName = nofoName?.trim() || '';
    
    // If name is empty, we can't identify this grant
    if (!normalizedName) return false;
    
    return pinnedGrants.some(pg => {
      // Normalize pinned grant name
      const pinnedName = pg.name?.trim() || '';
      
      // Match by name
      return normalizedName === pinnedName;
    });
  };

  // Handle pinning a grant (for admins only)
  const handlePinGrant = (grant: GrantRecommendation, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation(); // Prevent triggering the parent click handler
    }
    
    if (!isAdmin) return;
    
    // Normalize grant name
    const normalizedName = grant.name?.trim() || '';
    
    // Skip if we can't identify this grant
    if (!normalizedName) {
      console.warn('Cannot pin grant with no name');
      return;
    }
    
    // Check if grant is already pinned
    if (isNofoPinned(normalizedName)) {
      return; // Already pinned
    }
    
    const pinnableGrant: PinnableGrant = {
      ...grant,
      name: normalizedName,
      isPinned: true
    };
    
    // Create a completely new array for React state update
    const updatedPinnedGrants = [...pinnedGrants, pinnableGrant];
    setPinnedGrants(updatedPinnedGrants);
    
    // Save to localStorage
    localStorage.setItem('pinnedGrants', JSON.stringify(updatedPinnedGrants));
    
    console.log('Pinned grant:', normalizedName, 'Total pinned:', updatedPinnedGrants.length);
  };
  
  // Handle unpinning a grant (for admins only)
  const handleUnpinGrant = (grantName: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation(); // Prevent triggering the parent click handler
    }
    
    if (!isAdmin) return;
    
    // Normalize the name
    const normalizedName = grantName?.trim() || '';
    
    // Skip if we can't identify this grant
    if (!normalizedName) {
      console.warn('Cannot unpin grant with no name');
      return;
    }
    
    // Create a completely new array for React state update
    const updatedPinnedGrants = pinnedGrants.filter(grant => {
      const pinnedName = grant.name?.trim() || '';
      return pinnedName !== normalizedName;
    });
    
    setPinnedGrants(updatedPinnedGrants);
    
    // Save to localStorage
    localStorage.setItem('pinnedGrants', JSON.stringify(updatedPinnedGrants));
    
    console.log('Unpinned grant:', normalizedName, 'Remaining pinned:', updatedPinnedGrants.length);
  };

  return (
    <div style={searchContainerStyle} ref={searchRef}>
      <div style={inputContainerStyle}>
        <div style={searchIconStyle}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
              fill="#666666"
            />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search for grants or funding opportunities..."
          style={inputStyle}
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setShowResults(true);
            // Close assistant when typing in search
            if (showAssistant) {
              closeAssistant();
            }
          }}
          onFocus={() => {
            setShowResults(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {isLoading && (
          <div style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)' }}>
            <Spinner size="normal" />
          </div>
        )}
      </div>
      
      {showResults && !showAssistant && (
        <div style={resultsContainerStyle}>
          {/* Empty state prompt */}
          {searchTerm.length === 0 && (
            <div style={emptyPromptStyle}>
              <div style={{
                padding: '15px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" fill="#0073BB"/>
                </svg>
                <span style={{ 
                  fontSize: '16px', 
                  fontWeight: '500',
                  color: '#0073BB'
                }}>
                  Search by NOFO name or keywords to find grants
                </span>
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'center',
                margin: '0 0 15px 0'
              }}>
                <span style={{ 
                  fontSize: '14px', 
                  color: '#666',
                  fontStyle: 'italic',
                  textAlign: 'center'
                }}>
                  Try: "Transportation Infrastructure" or "EPA Clean Energy"
                </span>
              </div>
              <button 
                style={assistantButtonStyle}
                onClick={() => openRecommendationAssistant()}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#005A94';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#0073BB';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22Z" stroke="white" strokeWidth="2"/>
                  <path d="M8 12H8.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 12H12.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M16 12H16.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Get Personalized Grant Recommendations
              </button>
            </div>
          )}
          
          {/* Pinned grants section */}
          {filteredPinnedGrants.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Pinned Grants</div>
              {filteredPinnedGrants.map((grant, index) => (
                <div
                  key={`pinned-${index}`}
                  style={selectedIndex === index ? selectedPinnedItemStyle : pinnedItemStyle}
                  onClick={() => {
                    handlePinnedGrantSelect(grant);
                    // Do not close the dropdown
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div>
                    <div>
                      <span>{grant.name}</span>
                      <span style={pinnedBadgeStyle}>Pinned</span>
                    </div>
                  </div>
                  
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button 
                        onClick={(e) => handleUnpinGrant(grant.name, e)}
                        style={unpinButtonStyle}
                        title="Unpin grant"
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8e0e0';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <LuPinOff size={20} color="#E74C3C" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          
          {/* Regular NOFOs section */}
          {searchTerm.length > 0 && filteredDocuments.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Available Grants</div>
              {filteredDocuments.map((doc, index) => {
                const docName = doc.label || '';
                
                // Check if this specific document is pinned
                const isPinned = isNofoPinned(docName);
                
                return (
                  <div
                    key={`doc-${docName}-${index}`}
                    style={selectedIndex === index + filteredPinnedGrants.length ? selectedItemStyle : resultItemStyle}
                    onClick={() => {
                      setSearchTerm(docName); // Set the search term
                      onSelectDocument(doc); 
                      // Close the dropdown
                      setShowResults(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(index + filteredPinnedGrants.length)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div>{docName}</div>
                      
                      {isAdmin && (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {isPinned ? (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnpinGrant(docName, e);
                              }}
                              style={unpinButtonStyle}
                              title="Unpin grant"
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#f8e0e0';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <LuPinOff size={20} color="#E74C3C" />
                            </button>
                          ) : (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Create a grant object from the document
                                const grant: GrantRecommendation = {
                                  id: '', // ID not needed
                                  name: docName,
                                  matchScore: 80,
                                  eligibilityMatch: true,
                                  matchReason: "Admin selected",
                                  fundingAmount: "Varies",
                                  deadline: "See details",
                                  keyRequirements: [],
                                  summaryUrl: doc.value
                                };
                                handlePinGrant(grant, e);
                              }}
                              style={pinButtonStyle}
                              title="Pin grant to top of recommendations"
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#e0f0ff';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <LuPin size={20} color="#0073BB" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          
          {/* AI Recommendations section */}
          {recommendations && recommendations.grants && recommendations.grants.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>AI Recommended Grants</div>
              {recommendations.grants.map((grant, index) => {
                const grantName = grant.name || '';
                
                // Check if this grant is already pinned
                const isPinned = isNofoPinned(grantName);
                
                return (
                  <div
                    key={`rec-${grantName}-${index}`}
                    style={selectedIndex === filteredPinnedGrants.length + filteredDocuments.length + index ? selectedItemStyle : recommendationItemStyle}
                    onClick={() => {
                      handleRecommendationSelect(grant);
                      // Keep the dropdown open
                    }}
                    onMouseEnter={() => setSelectedIndex(filteredPinnedGrants.length + filteredDocuments.length + index)}
                  >
                    <div>
                      <div>
                        <span>{grantName}</span>
                        {grant.matchScore >= 80 && <span style={recommendedBadgeStyle}>Recommended</span>}
                      </div>
                      <div style={recommendationDetailsStyle}>
                        <SpaceBetween direction="horizontal" size="xs">
                          <span>Amount: {grant.fundingAmount}</span>
                          <span>Deadline: {grant.deadline}</span>
                        </SpaceBetween>
                      </div>
                    </div>
                    
                    {isAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {isPinned ? (
                          <button 
                            onClick={(e) => handleUnpinGrant(grantName, e)}
                            style={unpinButtonStyle}
                            title="Unpin grant"
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#f8e0e0';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <LuPinOff size={20} color="#E74C3C" />
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => handlePinGrant(grant, e)}
                            style={pinButtonStyle}
                            title="Pin grant to top of recommendations"
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#e0f0ff';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <LuPin size={20} color="#0073BB" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          
          {/* Loading state */}
          {searchTerm.length >= 3 && recommendationsLoading && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <Spinner size="normal" />
              <div style={{ marginTop: '10px', color: '#666' }}>
                Finding the best grant matches...
              </div>
            </div>
          )}
          
          {/* No results state with assistant button */}
          {searchTerm.length > 0 && !recommendationsLoading && filteredPinnedGrants.length === 0 && filteredDocuments.length === 0 && 
            (!recommendations || !recommendations.grants || recommendations.grants.length === 0) && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              <p>No matches found for "{searchTerm}".</p>
              <p style={{ marginTop: '10px' }}>
                Try different keywords or use our grant assistant for more help.
              </p>
              <button 
                style={assistantButtonStyle}
                onClick={() => openRecommendationAssistant(searchTerm)}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#005A94';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#0073BB';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22Z" stroke="white" strokeWidth="2"/>
                  <path d="M8 12H8.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 12H12.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M16 12H16.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Get Personalized Grant Recommendations
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Simplified Grant Assistant */}
      {showResults && showAssistant && (
        <div style={resultsContainerStyle}>
          <div style={assistantContainerStyle}>
            <div style={assistantHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0073BB' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22Z" stroke="#0073BB" strokeWidth="2"/>
                  <path d="M8 12H8.01" stroke="#0073BB" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 12H12.01" stroke="#0073BB" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M16 12H16.01" stroke="#0073BB" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Describe Your Grant Needs
              </h3>
              <button 
                style={assistantCloseButtonStyle}
                onClick={closeAssistant}
                aria-label="Close assistant"
              >
                ×
              </button>
            </div>
            
            {/* Simple input form */}
            <form onSubmit={handleAssistantSubmit} style={assistantInputContainerStyle}>
              <input
                type="text"
                placeholder="Describe your project or funding needs (e.g., rural infrastructure development)"
                value={assistantInput}
                onChange={e => setAssistantInput(e.target.value)}
                style={assistantInputStyle}
                autoFocus
              />
              <button 
                type="submit" 
                style={assistantSubmitButtonStyle}
                disabled={isAssistantLoading}
              >
                {isAssistantLoading ? 'Finding Grants...' : 'Find Grants'}
              </button>
            </form>
            
            {/* Grant recommendation results */}
            <div style={grantsContainerStyle}>
              {isAssistantLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Spinner size="normal" />
                  <div style={{ marginTop: '15px', color: '#666' }}>
                    Finding the best grant matches for your needs...
                  </div>
                </div>
              ) : recommendedGrants.length > 0 ? (
                <div>
                  <div style={{ fontSize: '14px', marginBottom: '16px', color: '#444' }}>
                    Here are the top grants that match your needs:
                  </div>
                  {recommendedGrants.map((grant, index) => {
                    const grantName = grant.name || '';
                    
                    // Check if this grant is already pinned
                    const isPinned = isNofoPinned(grantName);
                    
                    return (
                      <div key={`grant-${grantName}-${index}`} style={grantCardStyle}>
                        <div style={grantCardHeaderStyle}>
                          <div style={grantCardTitleStyle}>
                            {grantName}
                            {grant.matchScore >= 80 && <span style={recommendedBadgeStyle}>Recommended</span>}
                          </div>
                          
                          {isAdmin && (
                            <div>
                              {isPinned ? (
                                <button 
                                  onClick={(e) => handleUnpinGrant(grantName, e)}
                                  style={unpinButtonStyle}
                                  title="Unpin grant"
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f8e0e0';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <LuPinOff size={20} color="#E74C3C" />
                                </button>
                              ) : (
                                <button 
                                  onClick={(e) => handlePinGrant(grant, e)}
                                  style={pinButtonStyle}
                                  title="Pin grant to top of recommendations"
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e0f0ff';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <LuPin size={20} color="#0073BB" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div style={grantCardDetailStyle}>
                          <div>Funding: {grant.fundingAmount}</div>
                          <div>Deadline: {grant.deadline}</div>
                        </div>
                        
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
                          <span style={{ fontWeight: 'bold' }}>Why this matches:</span> {grant.matchReason}
                        </div>
                        
                        <ul style={grantCardRequirementsStyle}>
                          {grant.keyRequirements.map((req, i) => (
                            <li key={i}>{req}</li>
                          ))}
                        </ul>
                        
                        <div style={grantCardActionsStyle}>
                          <button 
                            onClick={() => handleAssistantGrantClick(grant.summaryUrl)}
                            style={{
                              backgroundColor: '#0073BB',
                              color: 'white',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            View Requirements
                          </button>
                          <button 
                            onClick={() => handleStartChatWithGrant(grant.summaryUrl)}
                            style={{
                              backgroundColor: '#f0f0f0',
                              color: '#333',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            Start Narrative Draft
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : assistantInput && !isAssistantLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#666' }}>
                  No matching grants found. Try describing your needs in more detail or with different keywords.
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#666' }}>
                  Describe your specific grant needs above to find the best matching opportunities.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegratedSearchBar; 
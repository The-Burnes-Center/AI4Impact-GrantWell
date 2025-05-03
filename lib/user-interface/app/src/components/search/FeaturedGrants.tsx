import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SpaceBetween } from '@cloudscape-design/components';

// Use the same grant data as admin-pinned grants for consistency
// In a real implementation, these would come from an API call
const FEATURED_GRANTS = [
  {
    id: 'DOT-Infrastructure-2023',
    name: 'Transportation Infrastructure Grant Program',
    matchScore: 95, // This is still used internally for sorting, but not displayed
    fundingAmount: '$5M-$25M',
    deadline: 'June 30, 2023',
    description: 'Funding for state and local transportation infrastructure projects.',
    category: 'Infrastructure',
    summaryUrl: 'DOT-Infrastructure-2023/',
    isPinned: true
  },
  {
    id: 'EPA-CleanEnergy-2023',
    name: 'Clean Energy Communities Initiative',
    matchScore: 92,
    fundingAmount: '$1M-$10M',
    deadline: 'August 15, 2023',
    description: 'Supporting local clean energy projects and renewable infrastructure development.',
    category: 'Renewable Energy',
    summaryUrl: 'EPA-CleanEnergy-2023/',
    isPinned: true
  },
  {
    id: 'HUD-Housing-2023',
    name: 'Affordable Housing Development Fund',
    matchScore: 88,
    fundingAmount: '$2M-$15M',
    deadline: 'July 22, 2023',
    description: 'Grants for developing affordable housing in urban and rural communities.',
    category: 'Housing',
    summaryUrl: 'HUD-Housing-2023/',
    isPinned: true
  }
];

interface FeaturedGrantsProps {
  onSelectGrant: (grant: any) => void;
}

const FeaturedGrants: React.FC<FeaturedGrantsProps> = ({ onSelectGrant }) => {
  const navigate = useNavigate();

  // Handle clicking on a grant card
  const handleGrantClick = (grant: any) => {
    onSelectGrant({
      label: grant.name,
      value: grant.summaryUrl
    });
  };

  const recommendedBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: '12px',
    backgroundColor: '#0073bb',
    color: 'white',
    padding: '3px 8px',
    borderRadius: '12px',
    position: 'absolute',
    top: '12px',
    right: '12px',
  };

  return (
    <div style={{ 
      maxWidth: '950px', 
      margin: '20px auto 40px auto',
      padding: '0'
    }}>
      <h2 style={{ 
        fontSize: '24px',
        color: '#006499',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        Trending Grant Opportunities
      </h2>
      
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '20px',
        width: '100%'
      }}>
        {FEATURED_GRANTS.map((grant, index) => (
          <div 
            key={index}
            style={{
              border: '1px solid #e1e4e8',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              backgroundColor: '#ffffff',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
            onClick={() => handleGrantClick(grant)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
            }}
          >
            {grant.matchScore >= 90 && (
              <div style={recommendedBadgeStyle}>Recommended</div>
            )}
            
            <h3 style={{ 
              fontSize: '18px', 
              margin: '0 0 10px 0',
              color: '#006499',
              paddingRight: '90px' // Make room for the badge
            }}>
              {grant.name}
            </h3>
            
            <p style={{ 
              margin: '0 0 15px 0',
              fontSize: '14px',
              color: '#555',
              flexGrow: 1
            }}>
              {grant.description}
            </p>
            
            <div style={{
              borderTop: '1px solid #f0f0f0',
              paddingTop: '15px',
              marginTop: 'auto'
            }}>
              <SpaceBetween direction="vertical" size="xs">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>Category:</span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{grant.category}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>Funding:</span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{grant.fundingAmount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>Deadline:</span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{grant.deadline}</span>
                </div>
              </SpaceBetween>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeaturedGrants; 
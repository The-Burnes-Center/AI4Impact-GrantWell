import React from 'react';

interface SearchSuggestionsProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({ 
  suggestions, 
  onSuggestionClick 
}) => {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      maxWidth: '650px',
      margin: '10px auto 20px auto',
      justifyContent: 'center'
    }}>
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSuggestionClick(suggestion)}
          style={{
            backgroundColor: '#f1f6f9',
            border: '1px solid #e0e0e0',
            borderRadius: '20px',
            padding: '6px 12px',
            fontSize: '14px',
            color: '#006499',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e7f1f8';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f1f6f9';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
};

export default SearchSuggestions; 
import React, { useState, useRef, useCallback } from "react";

import { IntegratedSearchBarProps } from "./types";

// AI Search functionality commented out - using simple table search instead
// import { useAISearch } from "./hooks/useAISearch";
// import { usePinnedGrants } from "./hooks/usePinnedGrants";
// import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";

import { SearchInput } from "./components/SearchInput";

import { searchContainerStyle } from "./styles/searchStyles";

const IntegratedSearchBar: React.FC<IntegratedSearchBarProps> = ({
  onSelectDocument,
  isLoading,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = onSearchTermChange || setInternalSearchTerm;

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // AI Search functionality commented out - using simple table search instead
  // const { pinnedGrants, isAdmin, grantTypeMap } = usePinnedGrants();
  // const hasExactMatches = false;
  // const aiSearch = useAISearch({ searchTerm, showResults, hasExactMatches });
  // const handleSelectPinnedGrant = useCallback(...)
  // const handleSelectAIGrant = useCallback(...)
  // const handleSelectDocument = useCallback(...)

  // Handle clear
  const handleClear = useCallback(() => {
    setSearchTerm("");
    onSelectDocument(null);
    inputRef.current?.focus();
  }, [onSelectDocument, setSearchTerm]);

  // Handle input change - simply updates the search term which filters the table
  const handleInputChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
    },
    [setSearchTerm]
  );

  return (
    <div style={searchContainerStyle} ref={searchRef}>
      <SearchInput
        ref={inputRef}
        searchTerm={searchTerm}
        isLoading={isLoading}
        isAISearching={false}
        aiError={null}
        showResults={false}
        selectedIndex={-1}
        disabled={isLoading}
        onChange={handleInputChange}
        onFocus={() => {}}
        onKeyDown={() => {}}
        onClear={handleClear}
      />

      {/* AI Search Results Dropdown - Commented out, using table search instead */}
      {/* 
      <SearchResultsStatus ... />
      {showResults && (
        <div style={resultsContainerStyle} ...>
          <EmptyState ... />
          <PinnedGrantsSection ... />
          <AISuggestionsSection ... />
        </div>
      )}
      <ViewAllGrantsModal ... />
      */}
    </div>
  );
};

export default IntegratedSearchBar;

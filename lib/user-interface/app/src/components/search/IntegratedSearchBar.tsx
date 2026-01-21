import React, { useState, useRef, useEffect, useCallback } from "react";

import { IntegratedSearchBarProps, SearchDocument, PinnableGrant } from "./types";

import { useAISearch } from "./hooks/useAISearch";
import { usePinnedGrants } from "./hooks/usePinnedGrants";
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";

import {
  SearchInput,
  PinnedGrantsSection,
  AISuggestionsSection,
  ViewAllGrantsModal,
  SearchResultsStatus,
  EmptyState,
} from "./components";

import { searchContainerStyle, resultsContainerStyle } from "./styles/searchStyles";

const IntegratedSearchBar: React.FC<IntegratedSearchBarProps> = ({
  documents,
  onSelectDocument,
  isLoading,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = onSearchTermChange || setInternalSearchTerm;
  const [showResults, setShowResults] = useState(false);
  const [showViewAllModal, setShowViewAllModal] = useState(false);
  const [expandedGrants, setExpandedGrants] = useState<Record<string, boolean>>({});

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Custom hooks
  const {
    pinnedGrants,
    isAdmin,
    grantTypeMap,
    isNofoPinned,
    handlePinGrant,
    handleUnpinGrant,
  } = usePinnedGrants();

  // Only semantic search functionality - no exact name matching
  const hasExactMatches = false;

  const aiSearch = useAISearch({
    searchTerm,
    showResults,
    hasExactMatches,
  });

  // Handlers
  const handleSelectPinnedGrant = useCallback(
    (grant: PinnableGrant) => {
      setSearchTerm(grant.name);
      const matchedDoc = documents.find((doc) => doc.label === grant.name);
      if (matchedDoc) {
        onSelectDocument(matchedDoc);
      }
      setShowResults(false);
    },
    [documents, onSelectDocument]
  );

  const handleSelectAIGrant = useCallback(
    (summaryUrl: string, grantName: string) => {
      setSearchTerm(grantName);
      const matchedDoc = documents.find((doc) => doc.value === summaryUrl);
      if (matchedDoc) {
        onSelectDocument(matchedDoc);
      }
      setShowResults(false);
    },
    [documents, onSelectDocument]
  );

  const handleSelectDocument = useCallback(
    (doc: SearchDocument) => {
      // Prevent selection of archived/expired grants
      if (doc.status === "archived") {
        return;
      }
      setSearchTerm(doc.label);
      onSelectDocument(doc);
      setShowResults(false);
    },
    [onSelectDocument]
  );

  const handleClose = useCallback(() => {
    setShowResults(false);
  }, []);

  // Only show pinned grants when search is empty (no filtering)
  const displayedPinnedGrants = searchTerm.length === 0 ? pinnedGrants : [];

  const {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    resetSelection,
  } = useKeyboardNavigation({
    filteredPinnedGrants: displayedPinnedGrants,
    aiResults: aiSearch.results,
    filteredDocuments: [],
    searchTerm,
    onSelectPinnedGrant: handleSelectPinnedGrant,
    onSelectAIGrant: handleSelectAIGrant,
    onSelectDocument: handleSelectDocument,
    onTriggerAISearch: aiSearch.triggerSearch,
    onClose: handleClose,
  });

  // Reset selection when results change
  useEffect(() => {
    resetSelection();
  }, [searchTerm, documents, pinnedGrants, resetSelection]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle clear
  const handleClear = useCallback(() => {
    setSearchTerm("");
    setShowResults(false);
    resetSelection();
    aiSearch.resetSearch();
    setExpandedGrants({});
    onSelectDocument(null);
    inputRef.current?.focus();
  }, [resetSelection, aiSearch, onSelectDocument]);

  // Handle input change
  const handleInputChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      
      // If cleared by backspacing, reset the popup
      if (value.length === 0) {
        resetSelection();
        aiSearch.resetSearch();
        setExpandedGrants({});
        setShowResults(true); // Still show results to display empty state with pinned grants
      } else {
        setShowResults(true);
      }
    },
    [resetSelection, aiSearch]
  );

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    if (!isLoading) {
      setShowResults(true);
    }
  }, [isLoading]);

  // Toggle grant expanded
  const toggleGrantExpanded = useCallback(
    (grantKey: string, event?: React.MouseEvent) => {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }

      setExpandedGrants((prev) => ({
        ...prev,
        [grantKey]: !prev[grantKey],
      }));
    },
    []
  );

  // Compute values
  const isDocumentSelected = false; // No exact matching, so never consider document selected
  const showDivider =
    displayedPinnedGrants.length > 0 ||
    (searchTerm.length > 0 &&
      (aiSearch.isSearching || aiSearch.results.length > 0 || aiSearch.triggered));

  return (
    <div style={searchContainerStyle} ref={searchRef}>
      <SearchInput
        ref={inputRef}
        searchTerm={searchTerm}
        isLoading={isLoading}
        isAISearching={aiSearch.isSearching}
        aiError={aiSearch.error}
        showResults={showResults}
        selectedIndex={selectedIndex}
        disabled={isLoading || isDocumentSelected}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        onClear={handleClear}
      />

      <SearchResultsStatus
        searchTerm={searchTerm}
        showResults={showResults}
        filteredPinnedGrants={displayedPinnedGrants}
        recommendedGrants={aiSearch.results}
        filteredDocuments={[]}
        isAISearching={aiSearch.isSearching}
        aiError={aiSearch.error}
        loadingMessage={aiSearch.loadingMessages[aiSearch.loadingMessageIndex]}
      />

      {/* Search Results Dropdown */}
      {showResults && (
        <div
          style={resultsContainerStyle}
          role="region"
          aria-label="Search results"
          aria-busy={aiSearch.isSearching}
          aria-live="polite"
        >
          {/* Empty State */}
          {searchTerm.length === 0 && (
            <EmptyState onViewAll={() => setShowViewAllModal(true)} />
          )}

          {/* Results Listbox */}
          <div
            id="search-results-listbox"
            role="listbox"
            style={{ marginTop: searchTerm.length === 0 ? "10px" : "0" }}
          >
            {/* Pinned Grants - only shown when search is empty */}
            <PinnedGrantsSection
              grants={displayedPinnedGrants}
              selectedIndex={selectedIndex}
              isAdmin={isAdmin}
              onSelect={handleSelectPinnedGrant}
              onUnpin={handleUnpinGrant}
              onMouseEnter={setSelectedIndex}
            />

            {/* Relevant Grants */}
            <AISuggestionsSection
              searchTerm={searchTerm}
              isSearching={aiSearch.isSearching}
              triggered={aiSearch.triggered}
              error={aiSearch.error}
              results={aiSearch.results}
              loadingMessage={aiSearch.loadingMessages[aiSearch.loadingMessageIndex]}
              grantTypeMap={grantTypeMap}
              expandedGrants={expandedGrants}
              hasPinnedGrants={displayedPinnedGrants.length > 0}
              onSelectGrant={handleSelectAIGrant}
              onToggleExpanded={toggleGrantExpanded}
              onTriggerSearch={() => aiSearch.triggerSearch(searchTerm)}
              onBrowseAll={() => setShowViewAllModal(true)}
            />
          </div>
        </div>
      )}

      {/* View All Grants Modal */}
      <ViewAllGrantsModal
        isOpen={showViewAllModal}
        documents={documents}
        pinnedGrants={pinnedGrants}
        isLoading={isLoading}
        grantTypeMap={grantTypeMap}
        onClose={() => setShowViewAllModal(false)}
        onSelectGrant={handleSelectDocument}
        onSelectPinnedGrant={handleSelectPinnedGrant}
      />
    </div>
  );
};

export default IntegratedSearchBar;

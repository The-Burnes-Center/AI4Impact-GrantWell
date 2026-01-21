import React, { useState, useRef, useEffect, useCallback } from "react";

import { IntegratedSearchBarProps, SearchDocument, PinnableGrant } from "./types";

import { useAISearch } from "./hooks/useAISearch";
import { usePinnedGrants } from "./hooks/usePinnedGrants";
import { useGrantFiltering } from "./hooks/useGrantFiltering";
import { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";

import {
  SearchInput,
  PinnedGrantsSection,
  AISuggestionsSection,
  AvailableGrantsSection,
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

  const { filteredDocuments, filteredPinnedGrants } = useGrantFiltering({
    documents,
    pinnedGrants,
    searchTerm,
  });

  const hasExactMatches = filteredDocuments.length > 0 || filteredPinnedGrants.length > 0;

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

  const {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    resetSelection,
  } = useKeyboardNavigation({
    filteredPinnedGrants,
    aiResults: aiSearch.results,
    filteredDocuments,
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
      if (!documents.some((doc) => doc.label === searchTerm)) {
        setSearchTerm(value);
        setShowResults(true);
      }
    },
    [documents, searchTerm]
  );

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    if (!isLoading && !documents.some((doc) => doc.label === searchTerm)) {
      setShowResults(true);
    }
  }, [isLoading, documents, searchTerm]);

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
  const isDocumentSelected = documents.some((doc) => doc.label === searchTerm);
  const baseIndexForAvailable = filteredPinnedGrants.length + aiSearch.results.length;
  const showDivider =
    filteredPinnedGrants.length > 0 ||
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
        filteredPinnedGrants={filteredPinnedGrants}
        recommendedGrants={aiSearch.results}
        filteredDocuments={filteredDocuments}
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
            {/* Pinned Grants */}
            <PinnedGrantsSection
              grants={searchTerm.length === 0 ? pinnedGrants : filteredPinnedGrants}
              selectedIndex={selectedIndex}
              isAdmin={isAdmin}
              onSelect={handleSelectPinnedGrant}
              onUnpin={handleUnpinGrant}
              onMouseEnter={setSelectedIndex}
            />

            {/* AI Suggestions */}
            <AISuggestionsSection
              searchTerm={searchTerm}
              isSearching={aiSearch.isSearching}
              triggered={aiSearch.triggered}
              error={aiSearch.error}
              results={aiSearch.results}
              loadingMessage={aiSearch.loadingMessages[aiSearch.loadingMessageIndex]}
              grantTypeMap={grantTypeMap}
              expandedGrants={expandedGrants}
              hasPinnedGrants={filteredPinnedGrants.length > 0}
              onSelectGrant={handleSelectAIGrant}
              onToggleExpanded={toggleGrantExpanded}
              onTriggerSearch={() => aiSearch.triggerSearch(searchTerm)}
              onBrowseAll={() => setShowViewAllModal(true)}
            />

            {/* Available Grants */}
            {searchTerm.length > 0 && (
              <AvailableGrantsSection
                documents={filteredDocuments}
                selectedIndex={selectedIndex}
                baseIndex={baseIndexForAvailable}
                isAdmin={isAdmin}
                grantTypeMap={grantTypeMap}
                showDivider={showDivider}
                isNofoPinned={isNofoPinned}
                onSelect={handleSelectDocument}
                onPin={handlePinGrant}
                onUnpin={handleUnpinGrant}
                onMouseEnter={setSelectedIndex}
              />
            )}
          </div>

          {/* No Results Message */}
          {searchTerm.length > 0 &&
            filteredPinnedGrants.length === 0 &&
            filteredDocuments.length === 0 &&
            !aiSearch.isSearching &&
            !aiSearch.triggered &&
            aiSearch.results.length === 0 && (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "#666",
                  fontSize: "14px",
                }}
              >
                <p>No matches found. Try different keywords or use AI suggestions above.</p>
              </div>
            )}
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

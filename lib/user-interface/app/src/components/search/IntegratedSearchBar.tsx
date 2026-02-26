import React, { useState, useRef, useCallback } from "react";

import { IntegratedSearchBarProps } from "./types";
import { SearchInput } from "./components/SearchInput";
import { searchContainerStyle } from "./styles/searchStyles";

const IntegratedSearchBar: React.FC<IntegratedSearchBarProps> = ({
  onSelectDocument,
  isLoading,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
  onAISearch,
  isAISearching = false,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = onSearchTermChange || setInternalSearchTerm;

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    setSearchTerm("");
    onSelectDocument(null);
    inputRef.current?.focus();
  }, [onSelectDocument, setSearchTerm]);

  const handleInputChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
    },
    [setSearchTerm]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && onAISearch && searchTerm.trim().length >= 3 && !isAISearching) {
        e.preventDefault();
        onAISearch(searchTerm.trim());
      }
    },
    [onAISearch, searchTerm, isAISearching]
  );

  return (
    <div style={searchContainerStyle} ref={searchRef}>
      <SearchInput
        ref={inputRef}
        searchTerm={searchTerm}
        isLoading={isLoading}
        isAISearching={isAISearching}
        aiError={null}
        showResults={false}
        selectedIndex={-1}
        disabled={isLoading}
        onChange={handleInputChange}
        onFocus={() => {}}
        onKeyDown={handleKeyDown}
        onClear={handleClear}
      />
    </div>
  );
};

export default IntegratedSearchBar;

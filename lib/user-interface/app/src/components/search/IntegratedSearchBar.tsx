import React, { useState, useRef, useCallback, useEffect } from "react";

import { IntegratedSearchBarProps } from "./types";
import { SearchInput } from "./components/SearchInput";
import { searchContainerStyle } from "./styles/searchStyles";

const SEARCH_DEBOUNCE_MS = 600;
const MIN_QUERY_LENGTH = 3;

const IntegratedSearchBar: React.FC<IntegratedSearchBarProps> = ({
  onSelectDocument,
  isLoading,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
  onSearch,
  isSearching = false,
  onClearSearch,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = onSearchTermChange || setInternalSearchTerm;

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSearchingRef = useRef(isSearching);
  const lastSubmittedQuery = useRef("");

  isSearchingRef.current = isSearching;

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      lastSubmittedQuery.current = "";
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (onSearch && !isSearchingRef.current && trimmed !== lastSubmittedQuery.current) {
        lastSubmittedQuery.current = trimmed;
        onSearch(trimmed);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, onSearch]);

  const handleClear = useCallback(() => {
    setSearchTerm("");
    lastSubmittedQuery.current = "";
    onSelectDocument(null);
    onClearSearch?.();
    inputRef.current?.focus();
  }, [onSelectDocument, setSearchTerm, onClearSearch]);

  const handleInputChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
    },
    [setSearchTerm]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && onSearch && searchTerm.trim().length >= MIN_QUERY_LENGTH && !isSearching) {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        lastSubmittedQuery.current = searchTerm.trim();
        onSearch(searchTerm.trim());
      }
    },
    [onSearch, searchTerm, isSearching]
  );

  return (
    <div style={searchContainerStyle} ref={searchRef}>
      <SearchInput
        ref={inputRef}
        searchTerm={searchTerm}
        isLoading={isLoading}
        isSearching={isSearching}
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

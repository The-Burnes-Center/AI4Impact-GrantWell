import React, { useState, useRef, useCallback, useEffect } from "react";

import { IntegratedSearchBarProps } from "./types";
import { SearchInput } from "./components/SearchInput";
import { searchContainerStyle } from "./styles/searchStyles";

const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;
const TIP_ROTATE_MS = 5000;

const SEARCH_TIPS = [
  "grants for youth mental health services",
  "funding for affordable housing in rural communities",
  "grants to support STEM education for underserved students",
  "funding for community health worker training programs",
  "grants for small business disaster recovery assistance",
  "funding for clean energy projects in low-income areas",
  "grants for workforce development and job training",
  "funding for food security and nutrition programs",
];

const IntegratedSearchBar: React.FC<IntegratedSearchBarProps> = ({
  onSelectDocument,
  isLoading,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
  onSearch,
  isSearching = false,
  onClearSearch,
  onSearchPendingChange,
  searchPlaceholder,
  searchAriaLabel,
  suppressSearchRef,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [tipIndex, setTipIndex] = useState(0);
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = onSearchTermChange || setInternalSearchTerm;

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSearchingRef = useRef(isSearching);
  const lastSubmittedQuery = useRef("");
  const queuedQueryRef = useRef<string | null>(null);

  isSearchingRef.current = isSearching;

  useEffect(() => {
    if (!isSearching && queuedQueryRef.current !== null) {
      const queued = queuedQueryRef.current;
      queuedQueryRef.current = null;
      // Don't fire queued search if the search term was cleared (e.g. NOFO selected)
      if (searchTerm.trim().length < MIN_QUERY_LENGTH) {
        onSearchPendingChange?.(false);
        return;
      }
      if (onSearch && queued !== lastSubmittedQuery.current) {
        lastSubmittedQuery.current = queued;
        onSearch(queued);
      }
      onSearchPendingChange?.(false);
    }
  }, [isSearching, onSearch, searchTerm, onSearchPendingChange]);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      lastSubmittedQuery.current = "";
      queuedQueryRef.current = null;
      onSearchPendingChange?.(false);
      return;
    }
    // Suppress: term was set programmatically (e.g. row click) — show it but don't search
    if (suppressSearchRef?.current) {
      suppressSearchRef.current = false;
      lastSubmittedQuery.current = trimmed;
      queuedQueryRef.current = null;
      onSearchPendingChange?.(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    if (trimmed === lastSubmittedQuery.current) {
      onSearchPendingChange?.(false);
      return;
    }
    onSearchPendingChange?.(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (onSearch && trimmed !== lastSubmittedQuery.current) {
        if (isSearchingRef.current) {
          queuedQueryRef.current = trimmed;
          onSearchPendingChange?.(false);
        } else {
          lastSubmittedQuery.current = trimmed;
          onSearch(trimmed);
          onSearchPendingChange?.(false);
        }
      } else {
        onSearchPendingChange?.(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, onSearch, onSearchPendingChange, suppressSearchRef]);

  const handleClear = useCallback(() => {
    setSearchTerm("");
    lastSubmittedQuery.current = "";
    onSearchPendingChange?.(false);
    onSelectDocument(null);
    onClearSearch?.();
    inputRef.current?.focus();
  }, [onSelectDocument, setSearchTerm, onClearSearch, onSearchPendingChange]);

  const handleInputChange = useCallback(
    (value: string) => {
      if (value === "") {
        handleClear();
        return;
      }
      setSearchTerm(value);
    },
    [setSearchTerm, handleClear]
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

  const trimmedTerm = searchTerm.trim();
  const queryWordCount = trimmedTerm.split(/\s+/).filter(Boolean).length;
  const showSuggestion = onSearch && trimmedTerm.length > 0 && queryWordCount <= 3;

  useEffect(() => {
    if (!showSuggestion) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % SEARCH_TIPS.length);
    }, TIP_ROTATE_MS);
    return () => clearInterval(interval);
  }, [showSuggestion]);

  return (
    <div style={searchContainerStyle} ref={searchRef}>
      <SearchInput
        ref={inputRef}
        searchTerm={searchTerm}
        isLoading={isLoading}
        isSearching={isSearching}
        placeholder={searchPlaceholder}
        ariaLabel={searchAriaLabel}
        showResults={false}
        selectedIndex={-1}
        disabled={isLoading}
        onChange={handleInputChange}
        onFocus={() => {}}
        onKeyDown={handleKeyDown}
        onClear={handleClear}
      />
      {showSuggestion && (
        <p className="search-tip" role="status">
          Tip: Try a full sentence for more precise results, e.g.,{" "}
          <em key={tipIndex}>&ldquo;{SEARCH_TIPS[tipIndex]}&rdquo;</em>
        </p>
      )}
    </div>
  );
};

export default IntegratedSearchBar;

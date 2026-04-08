import React from "react";

export interface SearchDocument {
  label: string;
  value: string;
  status?: "active" | "archived";
}

export interface IntegratedSearchBarProps {
  documents: SearchDocument[];
  onSelectDocument: (document: SearchDocument | null) => void;
  isLoading: boolean;
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
  onClearSearch?: () => void;
  onSearchPendingChange?: (isPending: boolean) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  /** When true on next search-term change, update the bar text without firing a search. Resets itself. */
  suppressSearchRef?: React.MutableRefObject<boolean>;
}

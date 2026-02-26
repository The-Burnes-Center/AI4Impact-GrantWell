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
}

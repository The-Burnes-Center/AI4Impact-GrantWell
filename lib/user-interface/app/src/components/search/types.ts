import { GrantRecommendation } from "../../hooks/use-grant-recommendations";
import type { GrantTypeId } from "../../common/grant-types";

// Grant type definitions for display
export const GRANT_TYPES: Record<GrantTypeId, { label: string; color: string }> = {
  federal: { label: "Federal", color: "#1a4480" },
  state: { label: "State", color: "#2e8540" },
  quasi: { label: "Quasi", color: "#8168b3" },
  philanthropic: { label: "Philanthropic", color: "#e66f0e" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

// Extended grant type with pinned status
export interface PinnableGrant extends GrantRecommendation {
  isPinned: boolean;
  grantType?: GrantTypeId | null;
}

// Document type for search
export interface SearchDocument {
  label: string;
  value: string;
  status?: "active" | "archived";
}

// Props for the main IntegratedSearchBar component
export interface IntegratedSearchBarProps {
  documents: SearchDocument[];
  onSelectDocument: (document: SearchDocument | null) => void;
  isLoading: boolean;
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  onAISearch?: (query: string) => void;
  isAISearching?: boolean;
}

// AI search state
export interface AISearchState {
  isSearching: boolean;
  triggered: boolean;
  lastQuery: string;
  error: string | null;
  results: GrantRecommendation[];
}

// Pinned grants state
export interface PinnedGrantsState {
  grants: PinnableGrant[];
  isAdmin: boolean;
  grantTypeMap: Record<string, GrantTypeId | null>;
}

// Loading messages for AI search
export const LOADING_MESSAGES = [
  "Searching through grant database...",
  "Analyzing your requirements...",
  "Matching grants to your needs...",
  "Reviewing eligibility criteria...",
  "Finding the best matches...",
  "Processing grant information...",
  "Comparing funding opportunities...",
  "Evaluating grant parameters...",
];

// Helper function to normalize grant name
export const normalizeGrantName = (name: string): string => {
  return name?.trim() || "";
};

export { GrantTypeId };
export type { GrantRecommendation };

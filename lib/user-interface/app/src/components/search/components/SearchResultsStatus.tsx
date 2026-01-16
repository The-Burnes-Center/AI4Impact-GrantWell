import React from "react";
import { PinnableGrant, GrantRecommendation, SearchDocument } from "../types";

interface SearchResultsStatusProps {
  searchTerm: string;
  showResults: boolean;
  filteredPinnedGrants: PinnableGrant[];
  recommendedGrants: GrantRecommendation[];
  filteredDocuments: SearchDocument[];
  isAISearching: boolean;
  aiError: string | null;
  loadingMessage: string;
}

export const SearchResultsStatus: React.FC<SearchResultsStatusProps> = ({
  searchTerm,
  showResults,
  filteredPinnedGrants,
  recommendedGrants,
  filteredDocuments,
  isAISearching,
  aiError,
  loadingMessage,
}) => {
  if (!showResults || searchTerm.length === 0) return null;

  const pinnedCount = filteredPinnedGrants.length;
  const aiCount = recommendedGrants.length;
  const availableCount = filteredDocuments.length;
  const totalResults = pinnedCount + aiCount + availableCount;

  const getResultsAnnouncement = () => {
    if (totalResults === 0) {
      return `No results found for "${searchTerm}"`;
    }

    const parts: string[] = [];
    if (pinnedCount > 0) {
      parts.push(`${pinnedCount} pinned grant${pinnedCount === 1 ? "" : "s"}`);
    }
    if (aiCount > 0) {
      parts.push(`${aiCount} AI suggestion${aiCount === 1 ? "" : "s"}`);
    }
    if (availableCount > 0) {
      parts.push(
        `${availableCount} available grant${availableCount === 1 ? "" : "s"}`
      );
    }

    return `${totalResults} result${
      totalResults === 1 ? "" : "s"
    } found: ${parts.join(", ")}`;
  };

  return (
    <>
      {/* Search Results Count Announcement */}
      <div
        id="search-results-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {getResultsAnnouncement()}
      </div>

      {/* AI Search Status Announcement */}
      {isAISearching && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          aria-busy="true"
        >
          {loadingMessage}
        </div>
      )}

      {/* AI Error Announcement */}
      {aiError && (
        <div
          id="ai-error-message"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
        >
          {aiError}
        </div>
      )}
    </>
  );
};

export default SearchResultsStatus;

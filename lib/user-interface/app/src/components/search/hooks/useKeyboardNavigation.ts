import { useState, useCallback } from "react";
import { SearchDocument, PinnableGrant, GrantRecommendation } from "../types";

interface UseKeyboardNavigationProps {
  filteredPinnedGrants: PinnableGrant[];
  aiResults: GrantRecommendation[];
  filteredDocuments: SearchDocument[];
  searchTerm: string;
  onSelectPinnedGrant: (grant: PinnableGrant) => void;
  onSelectAIGrant: (summaryUrl: string, grantName: string) => void;
  onSelectDocument: (doc: SearchDocument) => void;
  onTriggerAISearch: (query: string) => void;
  onClose: () => void;
}

interface UseKeyboardNavigationReturn {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  resetSelection: () => void;
}

export function useKeyboardNavigation({
  filteredPinnedGrants,
  aiResults,
  filteredDocuments,
  searchTerm,
  onSelectPinnedGrant,
  onSelectAIGrant,
  onSelectDocument,
  onTriggerAISearch,
  onClose,
}: UseKeyboardNavigationProps): UseKeyboardNavigationReturn {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const pinnedCount = filteredPinnedGrants.length;
      const aiCount = aiResults.length;
      const availableCount = filteredDocuments.length;
      const totalItems = pinnedCount + aiCount + availableCount;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0) {
          if (selectedIndex < pinnedCount) {
            // Pinned grant
            onSelectPinnedGrant(filteredPinnedGrants[selectedIndex]);
          } else if (selectedIndex < pinnedCount + aiCount) {
            // AI suggestion
            const aiIndex = selectedIndex - pinnedCount;
            const grant = aiResults[aiIndex];
            onSelectAIGrant(grant.summaryUrl, grant.name || "");
          } else {
            // Available grant
            const docIndex = selectedIndex - pinnedCount - aiCount;
            onSelectDocument(filteredDocuments[docIndex]);
          }
          onClose();
        } else if (searchTerm.trim().length >= 3) {
          // No item selected - trigger AI search
          onTriggerAISearch(searchTerm);
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [
      filteredPinnedGrants,
      aiResults,
      filteredDocuments,
      selectedIndex,
      searchTerm,
      onSelectPinnedGrant,
      onSelectAIGrant,
      onSelectDocument,
      onTriggerAISearch,
      onClose,
    ]
  );

  const resetSelection = useCallback(() => {
    setSelectedIndex(-1);
  }, []);

  return {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    resetSelection,
  };
}

export default useKeyboardNavigation;

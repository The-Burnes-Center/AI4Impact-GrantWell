import { useState, useEffect, useRef, useCallback } from "react";
import useGrantRecommendations from "../../../hooks/useGrantRecommendations";
import { GrantRecommendation, LOADING_MESSAGES } from "../types";

interface UseAISearchProps {
  searchTerm: string;
  showResults: boolean;
  hasExactMatches: boolean;
}

interface UseAISearchReturn {
  isSearching: boolean;
  triggered: boolean;
  error: string | null;
  results: GrantRecommendation[];
  loadingMessageIndex: number;
  loadingMessages: string[];
  triggerSearch: (query: string) => Promise<void>;
  resetSearch: () => void;
}

export function useAISearch({
  searchTerm,
  showResults,
  hasExactMatches,
}: UseAISearchProps): UseAISearchReturn {
  const [isSearching, setIsSearching] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GrantRecommendation[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { getRecommendationsUsingREST } = useGrantRecommendations();

  // Rotate loading messages
  useEffect(() => {
    if (!isSearching) {
      setLoadingMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [isSearching]);

  // Reset AI search when search term changes (backspace handling)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Only reset if user is backspacing and search term is shorter than last query
    if (lastQuery && searchTerm !== lastQuery && searchTerm.length < lastQuery.length) {
      if (results.length > 0 || triggered || isSearching) {
        setIsSearching(false);
        resetSearch();
      }
    }
  }, [searchTerm, lastQuery, results.length, triggered, isSearching]);

  // Debounced AI search trigger
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const looksLikeQuery = searchTerm.includes(" ") && searchTerm.length > 10;
    const shouldTriggerAI =
      searchTerm.length >= 3 &&
      (!hasExactMatches || looksLikeQuery) &&
      !isSearching &&
      searchTerm !== lastQuery;

    if (shouldTriggerAI && showResults) {
      debounceTimerRef.current = setTimeout(() => {
        triggerSearch(searchTerm);
      }, 1200);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm, hasExactMatches, showResults, isSearching, lastQuery]);

  const triggerSearch = useCallback(
    async (query: string) => {
      if (!query.trim() || isSearching) return;

      setIsSearching(true);
      setTriggered(true);
      setLastQuery(query);
      setError(null);

      try {
        const response = await getRecommendationsUsingREST(query);
        if (response && response.grants) {
          setResults(response.grants);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error("Error getting AI recommendations:", err);
        setResults([]);
        setError("Unable to get AI suggestions. Please try again.");
      } finally {
        setIsSearching(false);
      }
    },
    [isSearching, getRecommendationsUsingREST]
  );

  const resetSearch = useCallback(() => {
    setResults([]);
    setTriggered(false);
    setLastQuery("");
    setError(null);
  }, []);

  return {
    isSearching,
    triggered,
    error,
    results,
    loadingMessageIndex,
    loadingMessages: LOADING_MESSAGES,
    triggerSearch,
    resetSearch,
  };
}

export default useAISearch;

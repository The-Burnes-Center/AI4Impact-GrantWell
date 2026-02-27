import { useCallback, useState, useContext, useRef } from "react";
import { Auth } from "aws-amplify";
import { AppContext } from "../common/app-context";

export interface AISearchResult {
  name: string;
  score: number;
  source: "hybrid" | "category" | "agency";
  reason: string;
}

interface AISearchResponse {
  results: AISearchResult[];
  query: string;
  searchTimeMs: number;
}

const CACHE_MAX_SIZE = 5;

interface CacheEntry {
  results: AISearchResult[];
  searchTimeMs: number;
  timestamp: number;
}

export interface UseAIGrantSearchReturn {
  isSearching: boolean;
  error: string | null;
  results: AISearchResult[] | null;
  searchQuery: string | null;
  searchTimeMs: number | null;
  search: (query: string) => Promise<void>;
  clearResults: () => void;
}

export function useAIGrantSearch(): UseAIGrantSearchReturn {
  const appContext = useContext(AppContext);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AISearchResult[] | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchTimeMs, setSearchTimeMs] = useState<number | null>(null);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const search = useCallback(
    async (query: string) => {
      if (!appContext) {
        setError("Application context not available");
        return;
      }

      if (!query || query.trim().length < 3) {
        return;
      }

      const trimmed = query.trim().toLowerCase();

      const cached = cacheRef.current.get(trimmed);
      if (cached) {
        setResults(cached.results);
        setSearchTimeMs(cached.searchTimeMs);
        setSearchQuery(query.trim());
        setError(null);
        return;
      }

      setIsSearching(true);
      setError(null);
      setSearchQuery(query.trim());

      try {
        const session = await Auth.currentSession();
        const idToken = session.getIdToken().getJwtToken();
        const restEndpoint = appContext.httpEndpoint;
        const endpoint = restEndpoint.endsWith("/")
          ? restEndpoint
          : `${restEndpoint}/`;

        const response = await fetch(`${endpoint}ai-grant-search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ query: query.trim() }),
        });

        if (!response.ok) {
          throw new Error(`Search failed (${response.status})`);
        }

        const data: AISearchResponse = await response.json();
        const newResults = data.results || [];
        setResults(newResults);
        setSearchTimeMs(data.searchTimeMs);

        if (cacheRef.current.size >= CACHE_MAX_SIZE) {
          const oldestKey = cacheRef.current.keys().next().value;
          if (oldestKey !== undefined) {
            cacheRef.current.delete(oldestKey);
          }
        }
        cacheRef.current.set(trimmed, {
          results: newResults,
          searchTimeMs: data.searchTimeMs,
          timestamp: Date.now(),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Search failed";
        setError(message);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [appContext]
  );

  const clearResults = useCallback(() => {
    setResults(null);
    setSearchQuery(null);
    setSearchTimeMs(null);
    setError(null);
  }, []);

  return {
    isSearching,
    error,
    results,
    searchQuery,
    searchTimeMs,
    search,
    clearResults,
  };
}

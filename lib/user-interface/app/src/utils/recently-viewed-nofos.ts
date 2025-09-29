/**
 * Utility functions for managing recently viewed NOFOs
 */

export interface RecentlyViewedNOFO {
  label: string;
  value: string;
  lastViewed: string;
}

// Configuration - maximum number of recently viewed NOFOs to store
const MAX_RECENTLY_VIEWED = 5;

/**
 * Add a NOFO to the recently viewed list
 */
export const addToRecentlyViewed = (nofo: { label: string; value: string }): RecentlyViewedNOFO[] => {
  const nofoWithTimestamp: RecentlyViewedNOFO = {
    ...nofo,
    lastViewed: new Date().toLocaleString()
  };
  
  // Get current history from localStorage
  const currentHistory: RecentlyViewedNOFO[] = JSON.parse(
    localStorage.getItem("recentlyViewedNOFOs") || "[]"
  );
  
  // Update history - remove existing entry if present, add new one at the beginning
  const updatedHistory = [
    nofoWithTimestamp,
    ...currentHistory.filter((item) => item.value !== nofo.value),
  ].slice(0, MAX_RECENTLY_VIEWED); // Keep only the most recent items
  
  // Save to localStorage
  localStorage.setItem("recentlyViewedNOFOs", JSON.stringify(updatedHistory));
  
  return updatedHistory;
};

/**
 * Get recently viewed NOFOs from localStorage
 */
export const getRecentlyViewed = (): RecentlyViewedNOFO[] => {
  return JSON.parse(localStorage.getItem("recentlyViewedNOFOs") || "[]");
};

/**
 * Clear all recently viewed NOFOs
 */
export const clearRecentlyViewed = (): void => {
  localStorage.removeItem("recentlyViewedNOFOs");
};

/**
 * Remove NOFOs that no longer exist from the recently viewed list
 */
export const cleanupRecentlyViewed = (activeNofoNames: string[]): RecentlyViewedNOFO[] => {
  const currentHistory = getRecentlyViewed();
  
  // Filter out any NOFOs that no longer exist
  const filteredHistory = currentHistory.filter(historyItem => 
    activeNofoNames.includes(historyItem.label)
  );
  
  // Only update if something changed
  if (JSON.stringify(filteredHistory) !== JSON.stringify(currentHistory)) {
    localStorage.setItem("recentlyViewedNOFOs", JSON.stringify(filteredHistory));
  }
  
  return filteredHistory;
};

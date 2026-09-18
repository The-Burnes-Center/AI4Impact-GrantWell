/**
 * Utility functions for managing recently viewed NOFOs
 */

import { UserProfileClient } from "../api-client/user-profile-client";
import type { AppConfig } from "../types/app";

export interface RecentlyViewedNOFO {
  label: string;
  value: string;
  /** ISO-8601, except pre-sync rows which hold an already-formatted localized string. */
  lastViewed: string;
}

// Must match MAX_RECENTLY_VIEWED in the user-profile Lambda.
export const MAX_RECENTLY_VIEWED = 6;
const STORAGE_KEY = "recentlyViewedNOFOs";

function readLocal(): RecentlyViewedNOFO[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(items: RecentlyViewedNOFO[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable */
  }
}

let clientPromise: Promise<UserProfileClient | null> | null = null;

function profileClient(): Promise<UserProfileClient | null> {
  if (!clientPromise) {
    clientPromise = fetch("/aws-exports.json")
      .then((r) => (r.ok ? (r.json() as Promise<AppConfig>) : null))
      .then((config) =>
        config?.httpEndpoint ? new UserProfileClient(config) : null
      )
      .catch((): UserProfileClient | null => null);
  }
  return clientPromise;
}

function timestamp(): string {
  return new Date().toISOString();
}

function sortKey(item: RecentlyViewedNOFO): number {
  const parsed = Date.parse(item.lastViewed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeLists(...lists: RecentlyViewedNOFO[][]): RecentlyViewedNOFO[] {
  const byValue = new Map<string, RecentlyViewedNOFO>();
  for (const item of lists.flat()) {
    if (!item?.label || !item?.value) continue;
    const existing = byValue.get(item.value);
    if (!existing || sortKey(item) > sortKey(existing)) {
      byValue.set(item.value, item);
    }
  }
  return [...byValue.values()]
    .sort((a, b) => sortKey(b) - sortKey(a))
    .slice(0, MAX_RECENTLY_VIEWED);
}

async function sync(
  items: RecentlyViewedNOFO[],
  mode: "merge" | "replace"
): Promise<RecentlyViewedNOFO[] | null> {
  try {
    const client = await profileClient();
    if (!client) return null;
    return await client.putRecentlyViewed(items, mode);
  } catch {
    return null;
  }
}

/**
 * Add a NOFO to the recently viewed list
 */
export const addToRecentlyViewed = (nofo: {
  label: string;
  value: string;
}): RecentlyViewedNOFO[] => {
  const entry: RecentlyViewedNOFO = { ...nofo, lastViewed: timestamp() };
  const updated = mergeLists([entry], readLocal());
  writeLocal(updated);
  void sync([entry], "merge").then((serverItems) => {
    if (serverItems) writeLocal(serverItems);
  });
  return updated;
};

/**
 * Get recently viewed NOFOs from localStorage
 */
export const getRecentlyViewed = (): RecentlyViewedNOFO[] => readLocal();

export const fetchRecentlyViewed = async (): Promise<RecentlyViewedNOFO[]> => {
  const local = readLocal();
  try {
    const client = await profileClient();
    if (!client) return local;
    const remote = await client.getRecentlyViewed();
    const merged = mergeLists(local, remote);
    writeLocal(merged);
    if (local.length > 0 && merged.some((item) => !remote.some((r) => r.value === item.value))) {
      void sync(merged, "merge");
    }
    return merged;
  } catch {
    return local;
  }
};

/**
 * Clear all recently viewed NOFOs
 */
export const clearRecentlyViewed = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  void sync([], "replace");
};

/**
 * Remove NOFOs that no longer exist from the recently viewed list
 */
export const cleanupRecentlyViewed = (
  activeNofoNames: string[]
): RecentlyViewedNOFO[] => {
  const currentHistory = readLocal();

  // Filter out any NOFOs that no longer exist
  const filteredHistory = currentHistory.filter((historyItem) =>
    activeNofoNames.includes(historyItem.label)
  );

  // Only update if something changed
  if (JSON.stringify(filteredHistory) !== JSON.stringify(currentHistory)) {
    writeLocal(filteredHistory);
    void sync(filteredHistory, "replace");
  }

  return filteredHistory;
};

export const formatLastViewed = (lastViewed: string): string => {
  const parsed = Date.parse(lastViewed);
  if (Number.isNaN(parsed) || !/^\d{4}-\d{2}-\d{2}T/.test(lastViewed)) {
    return lastViewed;
  }
  return new Date(parsed).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

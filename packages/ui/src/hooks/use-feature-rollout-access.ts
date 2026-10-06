import { useEffect, useState } from "react";
import { useApiClient } from "./use-api-client";
import type { CurrentFeatureRolloutAccess } from "../common/types/feature-rollout";

const CACHE_KEY = "featureRolloutAccess";

function readCache(): CurrentFeatureRolloutAccess | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CurrentFeatureRolloutAccess;
  } catch {
    return null;
  }
}

function writeCache(access: CurrentFeatureRolloutAccess | null): void {
  try {
    if (access) {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(access));
    } else {
      sessionStorage.removeItem(CACHE_KEY);
    }
  } catch {
  }
}

export function useFeatureRolloutAccess(): {
  access: CurrentFeatureRolloutAccess | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const apiClient = useApiClient();
  const [access, setAccess] = useState<CurrentFeatureRolloutAccess | null>(readCache);
  const [loading, setLoading] = useState(() => readCache() === null);

  const refresh = async () => {
    try {
      const nextAccess = await apiClient.userManagement.getCurrentFeatureAccess();
      const cached = readCache();
      if (cached && cached.email !== nextAccess.email) {
        writeCache(null);
      }
      setAccess(nextAccess);
      writeCache(nextAccess);
    } catch (error) {
      console.error("Error loading feature rollout access:", error);
      setAccess(null);
      writeCache(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [apiClient]);

  return { access, loading, refresh };
}

export default useFeatureRolloutAccess;

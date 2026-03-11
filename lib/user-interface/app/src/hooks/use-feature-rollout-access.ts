import { useEffect, useState } from "react";
import { useApiClient } from "./use-api-client";
import type { CurrentFeatureRolloutAccess } from "../common/types/feature-rollout";

export function useFeatureRolloutAccess(): {
  access: CurrentFeatureRolloutAccess | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const apiClient = useApiClient();
  const [access, setAccess] = useState<CurrentFeatureRolloutAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const nextAccess = await apiClient.userManagement.getCurrentFeatureAccess();
      setAccess(nextAccess);
    } catch (error) {
      console.error("Error loading feature rollout access:", error);
      setAccess(null);
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

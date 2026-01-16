import { useState, useEffect, useCallback, useContext } from "react";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../../common/api-client/api-client";
import { AppContext } from "../../../common/app-context";
import {
  PinnableGrant,
  GrantRecommendation,
  GrantTypeId,
  normalizeGrantName,
} from "../types";

interface UsePinnedGrantsReturn {
  pinnedGrants: PinnableGrant[];
  isAdmin: boolean;
  grantTypeMap: Record<string, GrantTypeId | null>;
  isNofoPinned: (nofoName: string) => boolean;
  handlePinGrant: (
    grant: GrantRecommendation,
    event?: React.MouseEvent
  ) => Promise<void>;
  handleUnpinGrant: (
    grantName: string,
    event?: React.MouseEvent
  ) => Promise<void>;
}

export function usePinnedGrants(): UsePinnedGrantsReturn {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);

  const [pinnedGrants, setPinnedGrants] = useState<PinnableGrant[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [grantTypeMap, setGrantTypeMap] = useState<
    Record<string, GrantTypeId | null>
  >({});

  // Check if user is admin
  const checkUserIsAdmin = useCallback(async () => {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const userRole = user?.signInUserSession?.idToken?.payload["custom:role"];
      return userRole && userRole.includes("Admin");
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  }, []);

  // Check admin permissions on mount
  useEffect(() => {
    const checkAdmin = async () => {
      const adminStatus = await checkUserIsAdmin();
      setIsAdmin(adminStatus);
    };
    checkAdmin();
  }, [checkUserIsAdmin]);

  // Load pinned grants from API
  useEffect(() => {
    const loadPinnedGrants = async () => {
      try {
        const result = await apiClient.landingPage.getNOFOs();
        if (result.nofoData) {
          // Create grant type mapping
          const typeMap: Record<string, GrantTypeId | null> = {};
          result.nofoData.forEach((nofo) => {
            typeMap[nofo.name] = nofo.grant_type || null;
          });
          setGrantTypeMap(typeMap);

          // Load pinned grants
          const pinned = result.nofoData
            .filter((nofo) => nofo.isPinned)
            .map((nofo) => ({
              id: nofo.name,
              name: nofo.name,
              isPinned: true,
              grantType: nofo.grant_type || null,
              matchScore: 80,
              eligibilityMatch: true,
              matchReason: "Admin selected",
              fundingAmount: "Varies",
              deadline: "See details",
              keyRequirements: [],
              summaryUrl: `${nofo.name}/`,
            }))
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            );
          setPinnedGrants(pinned);
        }
      } catch (error) {
        console.error("Error loading pinned grants:", error);
      }
    };

    loadPinnedGrants();
  }, []);

  const isNofoPinned = useCallback(
    (nofoName: string): boolean => {
      const normalizedName = normalizeGrantName(nofoName);
      if (!normalizedName) return false;

      return pinnedGrants.some((pg) => {
        const pinnedName = normalizeGrantName(pg.name);
        return normalizedName === pinnedName;
      });
    },
    [pinnedGrants]
  );

  const handlePinGrant = useCallback(
    async (grant: GrantRecommendation, event?: React.MouseEvent) => {
      if (event) {
        event.stopPropagation();
      }

      if (!isAdmin) return;

      const normalizedName = normalizeGrantName(grant.name);
      if (!normalizedName) {
        console.warn("Cannot pin grant with no name");
        return;
      }

      try {
        await apiClient.landingPage.updateNOFOStatus(
          normalizedName,
          undefined,
          true
        );

        const pinnableGrant: PinnableGrant = {
          ...grant,
          name: normalizedName,
          isPinned: true,
        };

        setPinnedGrants((prev) => [...prev, pinnableGrant]);
      } catch (error) {
        console.error("Failed to pin grant:", error);
      }
    },
    [isAdmin, apiClient]
  );

  const handleUnpinGrant = useCallback(
    async (grantName: string, event?: React.MouseEvent) => {
      if (event) {
        event.stopPropagation();
      }

      if (!isAdmin) return;

      const normalizedName = normalizeGrantName(grantName);
      if (!normalizedName) {
        console.warn("Cannot unpin grant with no name");
        return;
      }

      try {
        await apiClient.landingPage.updateNOFOStatus(
          normalizedName,
          undefined,
          false
        );

        setPinnedGrants((prev) =>
          prev.filter((grant) => {
            const pinnedName = normalizeGrantName(grant.name);
            return pinnedName !== normalizedName;
          })
        );
      } catch (error) {
        console.error("Failed to unpin grant:", error);
      }
    },
    [isAdmin, apiClient]
  );

  return {
    pinnedGrants,
    isAdmin,
    grantTypeMap,
    isNofoPinned,
    handlePinGrant,
    handleUnpinGrant,
  };
}

export default usePinnedGrants;

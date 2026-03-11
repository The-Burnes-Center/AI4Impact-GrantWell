import React, { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { FeatureRolloutConfig, FeatureRolloutMode, FeatureRolloutSearchUser } from "../../../common/types/feature-rollout";
import { Utils } from "../../../common/utils";
import FeatureRolloutAllowlistManager from "./FeatureRolloutAllowlistManager";
import FeatureRolloutModeSelector from "./FeatureRolloutModeSelector";
import FeatureRolloutOverview from "./FeatureRolloutOverview";
import FeatureRolloutPanel from "./FeatureRolloutPanel";

const FEATURE_KEY = "ai-grant-search";

interface FeatureRolloutsTabProps {
  apiClient: ApiClient;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

const emptyConfig: FeatureRolloutConfig = {
  featureKey: FEATURE_KEY,
  mode: "disabled",
  updatedAt: null,
  updatedBy: null,
  users: [],
};

const FeatureRolloutsTab: React.FC<FeatureRolloutsTabProps> = ({
  apiClient,
  addNotification,
}) => {
  const [config, setConfig] = useState<FeatureRolloutConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [draftMode, setDraftMode] = useState<FeatureRolloutMode>(emptyConfig.mode);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchResults, setSearchResults] = useState<FeatureRolloutSearchUser[]>([]);
  const [hasSearchedUsers, setHasSearchedUsers] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const nextConfig = await apiClient.userManagement.getFeatureRollout(FEATURE_KEY);
      setConfig(nextConfig);
    } catch (error) {
      console.error("Error loading feature rollout config:", error);
      addNotification("error", "Failed to load AI search rollout settings");
    } finally {
      setLoading(false);
    }
  }, [apiClient, addNotification]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setDraftMode(config.mode);
  }, [config.mode]);

  const handleModeChange = useCallback(async (mode: FeatureRolloutMode) => {
    try {
      setSavingToggle(true);
      await apiClient.userManagement.updateFeatureRollout(FEATURE_KEY, mode);
      await loadConfig();
      addNotification(
        "success",
        mode === "all"
          ? "AI search beta enabled for all users"
          : mode === "allowlisted"
            ? "AI search beta limited to allowlisted users"
            : "AI search beta disabled for all users"
      );
    } catch (error) {
      console.error("Error updating feature rollout:", error);
      addNotification("error", "Failed to update AI search beta mode");
    } finally {
      setSavingToggle(false);
    }
  }, [apiClient, addNotification, loadConfig]);

  const handleSearchUsers = useCallback(async () => {
    try {
      setSearchingUsers(true);
      const response = await apiClient.userManagement.searchFeatureRolloutUsers(
        FEATURE_KEY,
        searchQuery
      );
      setSearchResults(response.users);
      setHasSearchedUsers(true);
    } catch (error) {
      console.error("Error searching users:", error);
      addNotification("error", "Failed to search users");
    } finally {
      setSearchingUsers(false);
    }
  }, [apiClient, addNotification, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearchedUsers(false);
  }, []);

  const syncSearchResult = useCallback((email: string, hasAccess: boolean) => {
    setSearchResults((current) =>
      current.map((user) =>
        user.email === email
          ? {
              ...user,
              hasAccess,
            }
          : user
      )
    );
  }, []);

  const handleGrantAccess = useCallback(
    async (email: string) => {
      try {
        setPendingEmail(email);
        await apiClient.userManagement.grantFeatureRolloutUser(FEATURE_KEY, email);
        syncSearchResult(email, true);
        await loadConfig();
        addNotification("success", `Granted AI search beta access to ${email}`);
      } catch (error) {
        console.error("Error granting feature access:", error);
        addNotification("error", `Failed to grant access to ${email}`);
      } finally {
        setPendingEmail(null);
      }
    },
    [apiClient, addNotification, loadConfig, syncSearchResult]
  );

  const handleRevokeAccess = useCallback(
    async (email: string) => {
      try {
        setPendingEmail(email);
        await apiClient.userManagement.revokeFeatureRolloutUser(FEATURE_KEY, email);
        syncSearchResult(email, false);
        await loadConfig();
        addNotification("success", `Removed AI search beta access for ${email}`);
      } catch (error) {
        console.error("Error revoking feature access:", error);
        addNotification("error", `Failed to remove access for ${email}`);
      } finally {
        setPendingEmail(null);
      }
    },
    [apiClient, addNotification, loadConfig, syncSearchResult]
  );

  const allowlistedCount = config.users.length;
  const updatedAtLabel = config.updatedAt ? Utils.formatTimestamp(config.updatedAt) : "never";
  const hasPendingModeChange = draftMode !== config.mode;

  if (loading) {
    return (
      <div className="feature-rollouts-panel" role="status" aria-busy="true">
        Loading feature rollouts...
      </div>
    );
  }

  return (
    <div className="feature-rollouts-panel">
      <FeatureRolloutPanel
        eyebrow="Developer Controls"
        title="AI Search Beta"
        description="Control who sees the AI-powered grant search."
        overview={
          <FeatureRolloutOverview
            mode={config.mode}
            allowlistedCount={allowlistedCount}
            updatedAtLabel={updatedAtLabel}
            updatedByLabel={config.updatedBy}
          />
        }
        controls={
          <div className="feature-rollouts-controls">
            <FeatureRolloutModeSelector
              mode={draftMode}
              saving={savingToggle}
              onChange={setDraftMode}
              renderOptionContent={(mode) =>
                mode === "allowlisted" ? (
                  <FeatureRolloutAllowlistManager
                    users={config.users}
                    searchQuery={searchQuery}
                    searchingUsers={searchingUsers}
                    searchResults={searchResults}
                    hasSearchedUsers={hasSearchedUsers}
                    pendingEmail={pendingEmail}
                    onSearchQueryChange={setSearchQuery}
                    onSearchUsers={() => void handleSearchUsers()}
                    onClearSearch={handleClearSearch}
                    onGrantAccess={(email) => void handleGrantAccess(email)}
                    onRevokeAccess={(email) => void handleRevokeAccess(email)}
                  />
                ) : null
              }
            />
            <div className="feature-rollouts-actions">
              <button
                className="feature-rollouts-primary-button"
                onClick={() => void handleModeChange(draftMode)}
                disabled={!hasPendingModeChange || savingToggle}
                type="button"
              >
                {savingToggle ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        }
      />
    </div>
  );
};

export default FeatureRolloutsTab;

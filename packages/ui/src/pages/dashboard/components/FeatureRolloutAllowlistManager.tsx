import React from "react";
import type { FeatureRolloutSearchUser, FeatureRolloutUser } from "../../../common/types/feature-rollout";
import { Utils } from "../../../common/utils";

interface FeatureRolloutAllowlistManagerProps {
  users: FeatureRolloutUser[];
  searchQuery: string;
  searchingUsers: boolean;
  searchResults: FeatureRolloutSearchUser[];
  hasSearchedUsers: boolean;
  pendingEmail: string | null;
  onSearchQueryChange: (value: string) => void;
  onSearchUsers: () => void;
  onClearSearch: () => void;
  onGrantAccess: (email: string) => void;
  onRevokeAccess: (email: string) => void;
}

const FeatureRolloutAllowlistManager: React.FC<FeatureRolloutAllowlistManagerProps> = ({
  users,
  searchQuery,
  searchingUsers,
  searchResults,
  hasSearchedUsers,
  pendingEmail,
  onSearchQueryChange,
  onSearchUsers,
  onClearSearch,
  onGrantAccess,
  onRevokeAccess,
}) => {
  const hasActiveSearchState =
    searchQuery.length > 0 || hasSearchedUsers || searchResults.length > 0;
  const statusMessage = searchingUsers
    ? "Searching users..."
    : hasSearchedUsers
      ? searchResults.length === 0
        ? "No users found."
        : `${searchResults.length} user${searchResults.length === 1 ? "" : "s"} found.`
      : "";

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSearchUsers();
    }
  };

  return (
    <div className="feature-rollouts-mode-content">
      <section className="feature-rollouts-section">
        <div className="feature-rollouts-section-header">
          <h3>Allowlisted Users</h3>
          <p>Manage the users who should see AI search in allowlisted mode.</p>
        </div>
        {users.length === 0 ? (
          <p className="feature-rollouts-empty">No users have AI search beta access yet.</p>
        ) : (
          <div className="feature-rollouts-list">
            {users.map((user) => (
              <div key={user.email} className="feature-rollouts-list-item">
                <div>
                  <div className="feature-rollouts-email">{user.email}</div>
                  <div className="feature-rollouts-detail">
                    Added {user.grantedAt ? Utils.formatTimestamp(user.grantedAt) : "recently"}
                    {user.grantedBy ? ` by ${user.grantedBy}` : ""}
                  </div>
                </div>
                <button
                  className="feature-rollouts-secondary-button"
                  onClick={() => onRevokeAccess(user.email)}
                  disabled={pendingEmail === user.email}
                  type="button"
                >
                  {pendingEmail === user.email ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="feature-rollouts-section">
        <div className="feature-rollouts-section-header">
          <h3>Search Users</h3>
          <p>Search Cognito users by email before allowlisting them.</p>
        </div>

        <div className="feature-rollouts-search">
          <div className="feature-rollouts-search-field">
            <label htmlFor="feature-rollouts-user-search" className="feature-rollouts-search-label">
              User email search
            </label>
            <input
              id="feature-rollouts-user-search"
              type="text"
              className="feature-rollouts-search-input"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by email"
            />
          </div>
          <div className="feature-rollouts-search-actions">
            <button
              className="feature-rollouts-primary-button"
              onClick={onSearchUsers}
              disabled={searchingUsers}
              type="button"
            >
              {searchingUsers ? "Searching..." : "Search"}
            </button>
            <button
              className="feature-rollouts-secondary-button"
              onClick={onClearSearch}
              disabled={!hasActiveSearchState}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>

        {statusMessage ? (
          <div className="feature-rollouts-results-toolbar">
            <p className="feature-rollouts-results-status" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </div>
        ) : null}

        {searchResults.length === 0 ? null : (
          <div className="feature-rollouts-list">
            {searchResults.map((user) => (
              <div key={user.email} className="feature-rollouts-list-item">
                <div>
                  <div className="feature-rollouts-email">{user.email}</div>
                  <div className="feature-rollouts-detail">
                    {user.status}
                    {user.roles.length > 0 ? ` • Roles: ${user.roles.join(", ")}` : " • Role: User"}
                  </div>
                </div>
                {user.hasAccess ? (
                  <button
                    className="feature-rollouts-secondary-button"
                    onClick={() => onRevokeAccess(user.email)}
                    disabled={pendingEmail === user.email}
                    type="button"
                  >
                    {pendingEmail === user.email ? "Removing..." : "Remove"}
                  </button>
                ) : (
                  <button
                    className="feature-rollouts-primary-button"
                    onClick={() => onGrantAccess(user.email)}
                    disabled={pendingEmail === user.email}
                    type="button"
                  >
                    {pendingEmail === user.email ? "Granting..." : "Grant Access"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default FeatureRolloutAllowlistManager;

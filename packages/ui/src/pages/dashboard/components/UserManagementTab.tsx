import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuKeyRound, LuTrash, LuUserPlus } from "react-icons/lu";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { ManagedUser, UserRolePreset } from "../../../common/types/user-management";
import { SUPPORTED_STATES } from "../../../common/types/user-management";
import { MFA_ENABLED, REGIONS, SINGLE_STATE } from "../../../common/instance";
import { LiveStatus } from "../../../components/common/LiveStatus";
import { Modal } from "../../../components/common/Modal";
import PaginationControls from "../../../components/common/PaginationControls";
import TableScrollRegion from "../../../components/ui/TableScrollRegion";
import RowActionsMenu, { type RowAction } from "./RowActionsMenu";
import SkeletonRows from "../../../components/ui/SkeletonRows";

interface UserManagementTabProps {
  apiClient: ApiClient;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
  canAssignDeveloper: boolean;
  isStateAdmin: boolean;
  userState: string;
  currentUsername: string;
}

const EMAIL_PATTERN = /\S+@\S+\.\S+/;

type RoleOption = { value: UserRolePreset; label: string; requiresDeveloper?: boolean };

// Platform admin spans states, so a single-state deployment has none.
const allRoleOptions: RoleOption[] = ([
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "platformadmin", label: "Platform admin", requiresDeveloper: true },
  { value: "developer", label: "Developer", requiresDeveloper: true },
] as RoleOption[]).filter((option) => !(SINGLE_STATE && option.value === "platformadmin"));

const ROLE_DEFINITIONS: Record<UserRolePreset, string> = {
  user: "Browse grants, view requirements, and draft applications. No admin access.",
  admin: "Everything a user can do, plus the Admin dashboard: manage grants, review processing, and manage user roles (User or Admin only). Scoped to their assigned state.",
  platformadmin: "An admin with no state restriction: manages grants and users across every state. Cannot be scoped to a state.",
  developer: "Everything a platform admin can do, plus manage feature rollouts and assign any role, including Developer.",
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Active",
  FORCE_CHANGE_PASSWORD: "Invited",
  RESET_REQUIRED: "Password reset required",
  UNCONFIRMED: "Email not confirmed",
  EXTERNAL_PROVIDER: "Single sign-on",
  COMPROMISED: "Compromised",
};

function statusTag(user: ManagedUser): { label: string; tone: "success" | "info" | "warning" | "neutral" } {
  if (!user.enabled) return { label: "Disabled", tone: "neutral" };
  const label = STATUS_LABELS[user.status] ?? "Unknown";
  if (user.status === "CONFIRMED") return { label, tone: "success" };
  if (user.status === "FORCE_CHANGE_PASSWORD") return { label, tone: "info" };
  return { label, tone: "warning" };
}

const nameOf = (user: ManagedUser) => user.email || user.username;

// An admin with no state has platform access, so only a developer may make, change or remove one.
// A single-state deployment implies the state.
const isStatelessAdmin = (role: UserRolePreset, state: string) => !SINGLE_STATE && role === "admin" && !state;

const STATELESS_ADMIN_ERROR =
  "Choose a state for an admin. An admin with no state has platform access, which only a developer can grant.";

function compareUsers(a: ManagedUser, b: ManagedUser) {
  if (Boolean(a.email) !== Boolean(b.email)) return a.email ? -1 : 1;
  return a.email.localeCompare(b.email) || a.username.localeCompare(b.username);
}

function getRolePreset(roles: string[]): UserRolePreset {
  const normalizedRoles = roles.map((role) => role.toLowerCase());
  const isAdmin = normalizedRoles.includes("admin");
  const isPlatformAdmin = normalizedRoles.includes("platformadmin");
  const isDeveloper = normalizedRoles.includes("developer");

  if (isDeveloper) {
    return "developer";
  }
  if (isPlatformAdmin) {
    return "platformadmin";
  }
  if (isAdmin) {
    return "admin";
  }
  return "user";
}

const UserManagementTab: React.FC<UserManagementTabProps> = ({
  apiClient,
  addNotification,
  canAssignDeveloper,
  isStateAdmin,
  userState,
  currentUsername,
}) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRolePreset>>({});
  const [draftStates, setDraftStates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [savingUsername, setSavingUsername] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");

  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addEmailAttempted, setAddEmailAttempted] = useState(false);
  const [addState, setAddState] = useState("");
  const [addRole, setAddRole] = useState<UserRolePreset>("user");
  const [isCreating, setIsCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mfaResetTarget, setMfaResetTarget] = useState<ManagedUser | null>(null);
  const [isResettingMfa, setIsResettingMfa] = useState(false);

  const tableRef = useRef<HTMLTableElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addEmailRef = useRef<HTMLInputElement>(null);
  const addStateRef = useRef<HTMLSelectElement>(null);
  // Set when a change may remove the row that has focus; checked once the new rows render.
  const refocusAfterReload = useRef(false);
  const savedUsername = useRef<string | null>(null);
  const usersRef = useRef(users);
  usersRef.current = users;

  const loadUsers = useCallback(async (): Promise<ManagedUser[] | null> => {
    try {
      setLoading(true);
      const response = await apiClient.userManagement.listUsers();
      const sorted = [...response.users].sort(compareUsers);
      // A reload keeps any row's unsaved choice; untouched rows take the server's values.
      const before = new Map(usersRef.current.map((user) => [user.username, user]));
      setDraftRoles((drafts) =>
        Object.fromEntries(
          sorted.map((user) => {
            const old = before.get(user.username);
            const edited = old && drafts[user.username] && drafts[user.username] !== getRolePreset(old.roles);
            return [user.username, edited ? drafts[user.username] : getRolePreset(user.roles)];
          })
        )
      );
      setDraftStates((drafts) =>
        Object.fromEntries(
          sorted.map((user) => {
            const old = before.get(user.username);
            const edited = old && user.username in drafts && drafts[user.username] !== (old.state || "");
            return [user.username, edited ? drafts[user.username] : user.state || ""];
          })
        )
      );
      setUsers(sorted);
      setTruncated(Boolean(response.truncated));
      return sorted;
    } catch (error) {
      console.error("Error loading users:", error);
      addNotification(
        "error",
        error instanceof Error && error.message
          ? `Failed to load users: ${error.message}`
          : "Failed to load users"
      );
      return null;
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [apiClient, addNotification]);

  const filteredUsers = useMemo(() => {
    const query = activeSearchQuery.toLowerCase();
    if (!query) return users;
    return users.filter(
      (user) => user.email.toLowerCase().includes(query) || user.username.toLowerCase().includes(query)
    );
  }, [users, activeSearchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const pageUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!refocusAfterReload.current || loading) return;
    refocusAfterReload.current = false;
    if (!document.activeElement || document.activeElement === document.body) tableRef.current?.focus();
  }, [users, loading]);

  useEffect(() => {
    const username = savedUsername.current;
    if (!username || savingUsername) return;
    savedUsername.current = null;
    if (!document.activeElement || document.activeElement === document.body) {
      document.getElementById(`role-select-${username}`)?.focus();
    }
  }, [savingUsername]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const startSearch = useCallback((query: string) => {
    setCurrentPage(1);
    setActiveSearchQuery(query);
  }, []);

  const handleSearchSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startSearch(searchQuery.trim());
  }, [searchQuery, startSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    startSearch("");
    searchInputRef.current?.focus();
  }, [startSearch]);

  const hasActiveSearch = activeSearchQuery.length > 0;

  const handlePageChange = useCallback((nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setCurrentPage(nextPage);
  }, [totalPages]);

  const handlePageSizeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentPage(1);
    setPageSize(Number.parseInt(event.target.value, 10));
  }, []);

  const handleSave = useCallback(
    async (user: ManagedUser) => {
      const nextRole = draftRoles[user.username];
      const nextState = draftStates[user.username] ?? "";
      const currentRole = getRolePreset(user.roles);
      const currentState = user.state || "";
      const roleChanged = Boolean(nextRole) && nextRole !== currentRole;
      const stateChanged = nextState !== currentState;

      if (!roleChanged && !stateChanged) {
        return;
      }
      if (!canAssignDeveloper && isStatelessAdmin(nextRole ?? currentRole, nextState)) {
        setRowErrors((current) => ({ ...current, [user.username]: STATELESS_ADMIN_ERROR }));
        return;
      }

      try {
        setSavingUsername(user.username);
        setRowErrors((current) => {
          if (!(user.username in current)) return current;
          const rest = { ...current };
          delete rest[user.username];
          return rest;
        });
        const updated = await apiClient.userManagement.updateUser(user.username, {
          ...(roleChanged ? { rolePreset: nextRole } : {}),
          ...(stateChanged ? { state: nextState } : {}),
        });
        const updatedRoles = updated.roles ?? user.roles;
        const updatedState = typeof updated.state === "string" ? updated.state : currentState;

        setDraftRoles((current) => ({ ...current, [user.username]: getRolePreset(updatedRoles) }));
        setDraftStates((current) => ({ ...current, [user.username]: updatedState }));
        setUsers((current) =>
          current.map((item) =>
            item.username === user.username
              ? { ...item, roles: updatedRoles, state: updatedState }
              : item
          )
        );
        savedUsername.current = user.username;
        addNotification("success", `Updated ${nameOf(user)}`);
      } catch (error) {
        console.error("Error updating user:", error);
        const message = error instanceof Error ? error.message : `Failed to update ${nameOf(user)}`;
        setRowErrors((current) => ({ ...current, [user.username]: message }));
        addNotification("error", message);
      } finally {
        setSavingUsername(null);
      }
    },
    [apiClient, addNotification, canAssignDeveloper, draftRoles, draftStates]
  );

  const handleCreateUser = useCallback(async () => {
    const email = addEmail.trim();
    if (!email || !EMAIL_PATTERN.test(email)) {
      addNotification("error", "Please enter a valid email address");
      return;
    }

    try {
      setIsCreating(true);
      await apiClient.userManagement.createUser({
        email,
        state: isStateAdmin || addRole === "platformadmin" ? undefined : addState || undefined,
        rolePreset: addRole,
      });
      addNotification("success", `Invitation sent to ${email}.`);
      setAddUserModalOpen(false);
      setAddEmail("");
      setAddState("");
      setAddRole("user");
      const list = await loadUsers();
      const index = list?.findIndex((user) => user.email === email.toLowerCase()) ?? -1;
      if (index >= 0) {
        setSearchQuery("");
        setActiveSearchQuery("");
        setCurrentPage(Math.floor(index / pageSize) + 1);
      }
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Failed to invite user");
    } finally {
      setIsCreating(false);
    }
  }, [addEmail, addState, addRole, isStateAdmin, apiClient, addNotification, loadUsers, pageSize]);

  const handleDeleteUser = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiClient.userManagement.deleteUser(deleteTarget.username);
      addNotification("success", `Deleted ${nameOf(deleteTarget)}`);
      setDeleteTarget(null);
      refocusAfterReload.current = true;
      setUsers((current) => current.filter((user) => user.username !== deleteTarget.username));
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, apiClient, addNotification]);

  const handleMfaReset = useCallback(async () => {
    if (!mfaResetTarget) {
      return;
    }

    try {
      setIsResettingMfa(true);
      await apiClient.userManagement.resetUserMfa(mfaResetTarget.username);
      addNotification("success", `Two-step verification reset for ${nameOf(mfaResetTarget)}.`);
      setMfaResetTarget(null);
    } catch (error) {
      addNotification(
        "error",
        error instanceof Error ? error.message : "Failed to reset two-step verification"
      );
    } finally {
      setIsResettingMfa(false);
    }
  }, [mfaResetTarget, apiClient, addNotification]);

  if (!loaded) {
    return (
      <>
        <div className="feature-rollouts-panel">
          <SkeletonRows label="Loading users" />
        </div>
        <LiveStatus className="visually-hidden">Loading users...</LiveStatus>
      </>
    );
  }

  const addEmailValid = addEmail.trim().length > 0 && EMAIL_PATTERN.test(addEmail);
  const addEmailInvalid = (addEmailAttempted || addEmail.length > 0) && !addEmailValid;
  const inviteRoleOptions = allRoleOptions.filter((option) => !option.requiresDeveloper || canAssignDeveloper);
  const addStateFixed = isStateAdmin || addRole === "platformadmin";
  const addStateRequired = !SINGLE_STATE && !isStateAdmin && !canAssignDeveloper && addRole === "admin";
  const addStateMissing = addStateRequired && !addState;
  const addStateInvalid = addEmailAttempted && addStateMissing;
  const addStateHint = isStateAdmin
    ? `New users are added to your state (${userState}) and cannot be changed.`
    : addRole === "platformadmin"
      ? "Platform admins aren't tied to a state."
      : isStatelessAdmin(addRole, addState)
        ? "With no state, this admin has platform admin access."
        : "";
  const savingUser = savingUsername ? users.find((user) => user.username === savingUsername) : undefined;
  const savingEmail = savingUser ? nameOf(savingUser) : undefined;

  return (
    <div className="user-management-panel">
      <div className="feature-rollouts-card">
        <div className="feature-rollouts-card__header">
          <div>
            <p>
              {isStateAdmin
                ? `You can invite users in ${userState}, switch them between User and Admin, and remove them.`
                : `Change roles in the table below. ${
                    canAssignDeveloper ? "You can assign any role." : "You can assign the User and Admin roles."
                  }`}
            </p>
            <dl className="user-management-role-legend" aria-label="Role definitions">
              {(Object.keys(ROLE_DEFINITIONS) as UserRolePreset[]).filter((role) => allRoleOptions.some((opt) => opt.value === role)).map((role) => (
                <div key={role} className="user-management-role-legend__item">
                  <dt>{allRoleOptions.find((opt) => opt.value === role)?.label ?? role}</dt>
                  <dd>{ROLE_DEFINITIONS[role]}</dd>
                </div>
              ))}
            </dl>
          </div>
          <button
            type="button"
            className="gw-btn gw-btn--primary feature-rollouts-primary-button"
            onClick={() => {
              setAddEmailAttempted(false);
              setAddRole("user");
              setAddUserModalOpen(true);
            }}
          >
            <LuUserPlus size={16} aria-hidden="true" /> Invite user
          </button>
        </div>

        <form className="feature-rollouts-search user-management-search" role="search" onSubmit={handleSearchSubmit}>
          <div className="feature-rollouts-search-field">
            <label htmlFor="user-management-search" className="feature-rollouts-search-label">
              Search users
            </label>
            <input
              ref={searchInputRef}
              id="user-management-search"
              type="search"
              className="gw-input feature-rollouts-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by email or username"
            />
          </div>
          <div className="feature-rollouts-search-actions">
            <button type="submit" className="gw-btn gw-btn--primary feature-rollouts-primary-button">
              Search
            </button>
            <button
              type="button"
              className="gw-btn gw-btn--secondary feature-rollouts-secondary-button"
              onClick={handleClearSearch}
              disabled={!hasActiveSearch && !searchQuery.trim()}
            >
              Clear
            </button>
          </div>
        </form>

        <LiveStatus className="visually-hidden">
          {savingEmail ? `Saving changes for ${savingEmail}` : loading ? "Updating the user list..." : null}
        </LiveStatus>
        <p className="feature-rollouts-results-status" role="status" aria-live="polite">
          {hasActiveSearch && !loading
            ? `${filteredUsers.length === 0 ? "No" : filteredUsers.length} user${filteredUsers.length === 1 ? "" : "s"} found for "${activeSearchQuery}".`
            : ""}
        </p>
        {truncated && (
          <p className="gw-alert gw-alert--warning user-management-truncated">
            This list stops at the first {users.length.toLocaleString()} accounts, so some users are missing from it
            and from search.
          </p>
        )}

        <TableScrollRegion label="Users table" className="user-management-table-wrapper">
          <table className="user-management-table" ref={tableRef} tabIndex={-1} aria-label="Users" aria-busy={loading}>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Status</th>
                <th scope="col">Role</th>
                {!SINGLE_STATE && <th scope="col">State</th>}
                {REGIONS.length > 0 && <th scope="col">Region</th>}
                <th scope="col" className="user-management-table__actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && pageUsers.length === 0 ? (
                <tr>
                  <td colSpan={(SINGLE_STATE ? 4 : 5) + (REGIONS.length > 0 ? 1 : 0)} className="user-management-table__empty">
                    {hasActiveSearch ? "No matching users found." : "No users yet."}
                  </td>
                </tr>
              ) : null}
              {pageUsers.map((user) => {
                const name = nameOf(user);
                const status = statusTag(user);
                const currentRole = getRolePreset(user.roles);
                const draftRole = draftRoles[user.username] || currentRole;
                const currentState = user.state || "";
                const draftState = draftStates[user.username] ?? currentState;
                const isSaving = savingUsername === user.username;
                const hasChanges = draftRole !== currentRole || draftState !== currentState;
                const isSelf = user.username === currentUsername;
                const statelessAdmin = isStatelessAdmin(currentRole, currentState);
                const developerOnly =
                  !canAssignDeveloper && (currentRole === "developer" || currentRole === "platformadmin" || statelessAdmin);
                const roleNoteId = `role-note-${user.username}`;

                return (
                  <tr key={user.username}>
                    <th scope="row">
                      <div className="user-management-user-cell">
                        <span className="user-management-user-email">{user.email || "No email address"}</span>
                        <span className="user-management-user-username">{user.username}</span>
                      </div>
                    </th>
                    <td>
                      <span className={`gw-tag gw-tag--${status.tone}`}>{status.label}</span>
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`role-select-${user.username}`}>
                        Role for {name}
                      </label>
                      <select
                        id={`role-select-${user.username}`}
                        className="gw-input user-management-role-select"
                        aria-describedby={developerOnly || statelessAdmin ? roleNoteId : undefined}
                        value={draftRole}
                        onChange={(event) =>
                          setDraftRoles((current) => ({
                            ...current,
                            [user.username]: event.target.value as UserRolePreset,
                          }))
                        }
                        disabled={isSaving || developerOnly}
                      >
                        {allRoleOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            disabled={Boolean(option.requiresDeveloper && !canAssignDeveloper)}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {developerOnly || statelessAdmin ? (
                        <p id={roleNoteId} className="user-management-row-note">
                          {statelessAdmin && "No state, so this admin has platform admin access. "}
                          {developerOnly && (statelessAdmin ? "Only a developer can change it." : "Only a developer can change this account.")}
                        </p>
                      ) : null}
                    </td>
                    {!SINGLE_STATE && (
                    <td>
                      <label className="visually-hidden" htmlFor={`state-select-${user.username}`}>
                        State for {name}
                      </label>
                      <select
                        id={`state-select-${user.username}`}
                        className="gw-input user-management-role-select"
                        value={draftState}
                        onChange={(event) =>
                          setDraftStates((current) => ({
                            ...current,
                            [user.username]: event.target.value,
                          }))
                        }
                        disabled={isSaving || isStateAdmin || developerOnly}
                      >
                        <option value="" disabled={!canAssignDeveloper && draftRole === "admin"}>Not assigned</option>
                        {SUPPORTED_STATES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    )}
                    {REGIONS.length > 0 && <td>{user.region || "Not set"}</td>}
                    <td className="user-management-table__actions">
                      <div className="user-management-actions-cell">
                        {(hasChanges || isSaving) && (
                          <button
                            type="button"
                            className="gw-btn gw-btn--primary feature-rollouts-primary-button"
                            onClick={() => !isSaving && void handleSave(user)}
                            aria-disabled={isSaving}
                          >
                            {isSaving ? "Saving..." : "Save"}
                            <span className="visually-hidden"> changes for {name}</span>
                          </button>
                        )}
                        {!isSelf && !developerOnly && (
                          <RowActionsMenu
                            label={`More actions for ${name}`}
                            disabled={isSaving}
                            actions={[
                              ...(MFA_ENABLED
                                ? [{
                                    label: "Reset two-step verification",
                                    icon: <LuKeyRound size={16} aria-hidden="true" />,
                                    onSelect: () => setMfaResetTarget(user),
                                  } satisfies RowAction]
                                : []),
                              {
                                label: "Delete",
                                icon: <LuTrash size={16} aria-hidden="true" />,
                                onSelect: () => setDeleteTarget(user),
                                danger: true,
                              },
                            ]}
                          />
                        )}
                      </div>
                      {rowErrors[user.username] && (
                        <p className="user-management-row-error" role="alert">
                          {rowErrors[user.username]}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScrollRegion>
        <PaginationControls
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredUsers.length}
          itemsPerPage={pageSize}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handlePageSizeChange}
          itemsPerPageOptions={PAGE_SIZE_OPTIONS}
          itemLabel="users"
          selectId="user-management-page-size"
          live
        />
      </div>

      <Modal isOpen={addUserModalOpen} onClose={() => setAddUserModalOpen(false)} title="Invite a user">
        <div className="modal-form">
          <p className="modal-description">
            Enter the email address of the person to invite and choose their role. They will receive an email with a temporary password to sign in.
          </p>
          <div className="form-group">
            <label htmlFor="add-user-email">Email address</label>
            <input
              ref={addEmailRef}
              type="email"
              id="add-user-email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="gw-input form-input"
              placeholder="user@example.com"
              autoComplete="email"
              aria-invalid={addEmailInvalid}
              aria-describedby={addEmailInvalid ? "add-user-email-error" : undefined}
            />
            {addEmailInvalid && (
              <p id="add-user-email-error" className="gw-field__message user-management-field-error">
                Enter an email address in the format user@example.com.
              </p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="add-user-role">Role</label>
            <select
              id="add-user-role"
              className="gw-input form-input"
              value={addRole}
              onChange={(e) => {
                const role = e.target.value as UserRolePreset;
                setAddRole(role);
                if (role === "platformadmin") setAddState("");
              }}
            >
              {inviteRoleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {!SINGLE_STATE && (
          <div className="form-group">
            <label htmlFor="add-user-state">{addStateRequired || isStateAdmin ? "State" : "State (optional)"}</label>
            <select
              ref={addStateRef}
              id="add-user-state"
              className="gw-input form-input"
              value={isStateAdmin ? userState : addState}
              onChange={(e) => setAddState(e.target.value)}
              disabled={addStateFixed}
              aria-required={addStateRequired || undefined}
              aria-invalid={addStateInvalid || undefined}
              aria-describedby={addStateInvalid ? "add-user-state-error" : addStateHint ? "add-user-state-hint" : undefined}
            >
              {!isStateAdmin && <option value="">Not assigned</option>}
              {SUPPORTED_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            {addStateInvalid ? (
              <p id="add-user-state-error" className="gw-field__message user-management-field-error">
                {STATELESS_ADMIN_ERROR}
              </p>
            ) : addStateHint ? (
              <p id="add-user-state-hint" className="modal-description">{addStateHint}</p>
            ) : null}
          </div>
          )}
          <div className="modal-actions">
            <button
              className="gw-btn gw-btn--secondary modal-button secondary"
              onClick={() => {
                if (!isCreating) setAddUserModalOpen(false);
              }}
              aria-disabled={isCreating || undefined}
            >
              Cancel
            </button>
            <button
              className="gw-btn gw-btn--primary modal-button primary"
              onClick={() => {
                if (isCreating) return;
                if (!addEmailValid || addStateMissing) {
                  setAddEmailAttempted(true);
                  (addEmailValid ? addStateRef : addEmailRef).current?.focus();
                  return;
                }
                void handleCreateUser();
              }}
              aria-disabled={isCreating || undefined}
            >
              {isCreating ? "Inviting..." : "Invite user"}
            </button>
          </div>
          <LiveStatus className="visually-hidden">{isCreating ? "Inviting user" : null}</LiveStatus>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
          }
        }}
        title="Delete user"
      >
        <div className="modal-form">
          <p className="modal-description">
            Permanently delete <strong>{deleteTarget && nameOf(deleteTarget)}</strong>? This deletes their account and their chats, applications and supporting documents. It cannot be undone.
          </p>
          <div className="modal-actions">
            <button
              className="gw-btn gw-btn--secondary modal-button secondary"
              onClick={() => {
                if (!isDeleting) setDeleteTarget(null);
              }}
              aria-disabled={isDeleting || undefined}
            >
              Cancel
            </button>
            <button
              className="gw-btn gw-btn--danger modal-button danger"
              onClick={() => {
                if (!isDeleting) void handleDeleteUser();
              }}
              aria-disabled={isDeleting || undefined}
            >
              {isDeleting ? "Deleting..." : "Delete user"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(mfaResetTarget)}
        onClose={() => {
          if (!isResettingMfa) {
            setMfaResetTarget(null);
          }
        }}
        title="Reset two-step verification"
      >
        <div className="modal-form">
          <p className="modal-description">
            <strong>{mfaResetTarget && nameOf(mfaResetTarget)}</strong> can set up a new authenticator app the next
            time they sign in.
          </p>
          <div className="modal-actions">
            <button
              className="gw-btn gw-btn--secondary modal-button secondary"
              onClick={() => {
                if (!isResettingMfa) setMfaResetTarget(null);
              }}
              aria-disabled={isResettingMfa || undefined}
            >
              Cancel
            </button>
            <button
              className="gw-btn gw-btn--danger modal-button danger"
              onClick={() => {
                if (!isResettingMfa) void handleMfaReset();
              }}
              aria-disabled={isResettingMfa || undefined}
            >
              {isResettingMfa ? "Resetting..." : "Reset"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserManagementTab;

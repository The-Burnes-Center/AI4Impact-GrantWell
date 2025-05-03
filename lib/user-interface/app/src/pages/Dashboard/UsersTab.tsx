import React, { useState } from "react";
import { ApiClient } from "../../common/api-client/api-client";
import { RowActions } from "./index";
import { Modal } from "./NOFOsTab";

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  lastActive: string;
}

interface UsersTabProps {
  users: User[];
  searchQuery: string;
  apiClient: ApiClient;
  setUsers?: React.Dispatch<React.SetStateAction<User[]>>;
  onUserInvited?: (email: string) => void;
  inviteUserModalOpen?: boolean;
  setInviteUserModalOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  isLoading?: boolean;
  usersLoading?: boolean;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  searchQuery,
  apiClient,
  setUsers,
  onUserInvited,
  inviteUserModalOpen: externalInviteModalOpen,
  setInviteUserModalOpen: externalSetInviteModalOpen,
  isLoading = false,
  usersLoading = false,
}) => {
  // Use internal state if external state is not provided
  const [internalInviteUserModalOpen, setInternalInviteUserModalOpen] =
    useState(false);

  // Use either external or internal state
  const inviteUserModalOpen =
    externalInviteModalOpen !== undefined
      ? externalInviteModalOpen
      : internalInviteUserModalOpen;
  const setInviteUserModalOpen =
    externalSetInviteModalOpen || setInternalInviteUserModalOpen;

  const [newUserEmail, setNewUserEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");

  // Filter data based on search query
  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Invite user implementation
  const inviteNewUser = async () => {
    if (!newUserEmail || !newUserEmail.includes("@")) {
      setStatusMessage("Please enter a valid email address");
      setInviteStatus("error");
      return;
    }

    setInviteStatus("loading");
    setStatusMessage("");

    try {
      // Call the API to create a new user
      const result = await apiClient.landingPage.inviteUser(newUserEmail);

      if (result.success) {
        setInviteStatus("success");
        setStatusMessage("User invitation sent successfully!");

        // Notify parent component if callback exists
        if (onUserInvited) {
          onUserInvited(newUserEmail);
        }

        // Reset form after short delay
        setTimeout(() => {
          setNewUserEmail("");
          setInviteStatus("idle");
          setInviteUserModalOpen(false);
        }, 2000);
      } else {
        throw new Error(result.message || "Failed to invite user");
      }
    } catch (error) {
      console.error("Error inviting user:", error);
      setInviteStatus("error");
      setStatusMessage(
        error.message || "Failed to invite user. Please try again."
      );
    }
  };

  return (
    <>
      {usersLoading ? (
        <div className="loading-users">Loading users...</div>
      ) : (
        <div className="data-table">
          <div className="table-header">
            <div className="header-cell">Name</div>
            <div className="header-cell">Email</div>
            <div className="header-cell">Role</div>
            <div className="header-cell">Last Active</div>
            <div className="header-cell actions-cell"></div>
          </div>
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <div className="table-row" key={user.id}>
                <div className="row-cell">{user.name}</div>
                <div className="row-cell">{user.email}</div>
                <div className="row-cell">{user.role}</div>
                <div className="row-cell">{user.lastActive}</div>
                <div className="row-cell actions-cell">
                  <RowActions
                    onEdit={() => alert(`Edit ${user.name}`)}
                    onDelete={() => alert(`Delete ${user.name}`)}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="no-data">No users found</div>
          )}
        </div>
      )}

      {/* Invite User Modal - Styled like the Base Page version */}
      {inviteUserModalOpen && (
        <div className="invite-user-modal-overlay">
          <div className="invite-user-modal">
            <h2>Invite New User</h2>
            <p>
              Enter the email address of the user you want to invite. They will
              receive an email with instructions to set up their account.
            </p>

            <div className="invite-form-group">
              <label htmlFor="email-input">Email Address:</label>
              <input
                id="email-input"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="invite-form-input"
                placeholder="user@example.com"
                disabled={inviteStatus === "loading"}
              />
            </div>

            {statusMessage && (
              <div
                className={`invite-status-message ${
                  inviteStatus === "error"
                    ? "error"
                    : inviteStatus === "success"
                    ? "success"
                    : "loading"
                }`}
              >
                {statusMessage}
              </div>
            )}

            <div className="invite-modal-actions">
              <button
                onClick={() => {
                  setInviteUserModalOpen(false);
                  setNewUserEmail("");
                  setInviteStatus("idle");
                  setStatusMessage("");
                }}
                className="invite-cancel-button"
                disabled={inviteStatus === "loading"}
              >
                Cancel
              </button>
              <button
                onClick={inviteNewUser}
                className={`invite-submit-button ${
                  inviteStatus === "loading" ? "loading" : ""
                }`}
                disabled={!newUserEmail || inviteStatus === "loading"}
              >
                {inviteStatus === "loading" ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

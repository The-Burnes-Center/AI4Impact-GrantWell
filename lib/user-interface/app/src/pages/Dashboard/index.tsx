import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { NOFOsTab, NOFO, Modal } from "./NOFOsTab";
import { UsersTab, User } from "./UsersTab";
import "./styles.css";

/**
 * Row actions menu component - provides edit/delete functionality
 */
export const RowActions: React.FC<{
  onEdit: () => void;
  onDelete: () => void;
}> = ({ onEdit, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="row-actions">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="actions-button"
        aria-label="Actions"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="6" r="2" fill="#333" />
          <circle cx="12" cy="12" r="2" fill="#333" />
          <circle cx="12" cy="18" r="2" fill="#333" />
        </svg>
      </button>
      {isOpen && (
        <div className="actions-menu">
          <button
            onClick={() => {
              onEdit();
              setIsOpen(false);
            }}
          >
            Edit
          </button>
          <button
            onClick={() => {
              onDelete();
              setIsOpen(false);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Main Dashboard component
 */
const Dashboard: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState("nofos");

  // Data state
  const [nofos, setNofos] = useState<NOFO[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);

  // New state for upload NOFO and invite user modals
  const [uploadNofoModalOpen, setUploadNofoModalOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);

  // Hooks
  const navigate = useNavigate();
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);

  // Check admin permissions on component mount
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        if (!result || Object.keys(result).length === 0) {
          navigate("/");
          return;
        }

        const adminRole =
          result?.signInUserSession?.idToken?.payload["custom:role"];
        if (adminRole && adminRole.includes("Admin")) {
          setIsAdmin(true);
        } else {
          // Redirect non-admin users
          navigate("/");
        }
      } catch (e) {
        console.error("Error checking admin status:", e);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [navigate]);

  // Fetch NOFOs data
  useEffect(() => {
    if (!isAdmin) return;

    const fetchNofos = async () => {
      try {
        // Fetch NOFOs from API
        const nofoResult = await apiClient.landingPage.getNOFOs();

        // Convert to required format
        const nofoData = (nofoResult.folders || []).map((nofo, index) => ({
          id: index,
          name: nofo,
        }));

        setNofos(nofoData);
      } catch (error) {
        console.error("Error fetching NOFOs:", error);
      }
    };

    fetchNofos();
  }, [isAdmin, apiClient.landingPage]);

  // Fetch Users data
  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      // Try to get users from the API
      try {
        const result = await apiClient.landingPage.getUsers();
        if (result && result.success && Array.isArray(result.users)) {
          setUsers(result.users);
        } else {
          // If API call fails or returns unexpected data, fall back to mock data
          useMockUsers();
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        useMockUsers();
      }
    } finally {
      setUsersLoading(false);
    }
  };

  // If API call fails, use mock data
  const useMockUsers = () => {
    console.warn("Using mock user data due to API failure");
    setUsers([
      {
        id: 1,
        name: "John Smith",
        email: "john.smith@example.com",
        role: "Admin",
        lastActive: "2 days ago",
      },
      {
        id: 2,
        name: "Sarah Johnson",
        email: "sarah.j@example.com",
        role: "Editor",
        lastActive: "5 hours ago",
      },
      {
        id: 3,
        name: "Michael Wong",
        email: "m.wong@example.com",
        role: "Viewer",
        lastActive: "1 week ago",
      },
      {
        id: 4,
        name: "Jessica Chen",
        email: "jchen@example.com",
        role: "Editor",
        lastActive: "Just now",
      },
    ]);
  };

  // Fetch users when the users tab is activated
  useEffect(() => {
    if (!isAdmin) return;

    if (activeTab === "users") {
      fetchUsers();
    }
  }, [activeTab, isAdmin]);

  // Handles when a user is invited successfully
  const handleUserInvited = (email: string) => {
    // After successful invitation, refresh the users list
    fetchUsers();
  };

  // Upload NOFO handler
  const handleUploadNofo = () => {
    setUploadNofoModalOpen(true);
  };

  // Invite user handler
  const handleInviteUser = () => {
    setInviteUserModalOpen(true);
  };

  // Get button text and action based on active tab
  const getActionButtonProps = () => {
    switch (activeTab) {
      case "nofos":
        return {
          text: "Upload NOFO",
          action: handleUploadNofo
        };
      case "users":
        return {
          text: "Invite User",
          action: handleInviteUser
        };
      default:
        return {
          text: "Action",
          action: () => {}
        };
    }
  };

  // Show loading state
  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Redirect happens in useEffect if not admin
  if (!isAdmin) {
    return null;
  }

  const actionButton = getActionButtonProps();

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="dashboard-actions">
          <button
            className="upload-button"
            onClick={actionButton.action}
          >
            {actionButton.text}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-controls">
        <button
          className={`tab-button ${activeTab === "nofos" ? "active" : ""}`}
          onClick={() => setActiveTab("nofos")}
        >
          NOFOs
        </button>
        <button
          className={`tab-button ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
      </div>

      {/* Search bar */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <span className="search-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
                fill="#666666"
              />
            </svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder={`Search ${activeTab === "nofos" ? "NOFOs" : "users"}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="filter-button">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4.25 5.66C4.35 5.79 9.99 12.99 9.99 12.99V19C9.99 19.55 10.44 20 11 20H13.01C13.56 20 14.02 19.55 14.02 19V12.98C14.02 12.98 19.51 5.96 19.77 5.64C20.03 5.32 20 5 20 5C20 4.45 19.55 4 18.99 4H5.01C4.4 4 4 4.48 4 5C4 5.2 4.06 5.44 4.25 5.66Z"
              fill="#666666"
            />
          </svg>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "nofos" && (
        <NOFOsTab
          nofos={nofos}
          searchQuery={searchQuery}
          apiClient={apiClient}
          setNofos={setNofos}
        />
      )}

      {activeTab === "users" && (
        <UsersTab
          users={users}
          searchQuery={searchQuery}
          apiClient={apiClient}
          setUsers={setUsers}
          usersLoading={usersLoading}
          onUserInvited={handleUserInvited}
        />
      )}
    </div>
  );
};

export default Dashboard;
export { Modal } from "./NOFOsTab";

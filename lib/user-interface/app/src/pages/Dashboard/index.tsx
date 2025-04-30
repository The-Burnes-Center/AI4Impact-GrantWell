import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import "./styles.css";

// Types
interface NOFO {
  id: number;
  name: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  lastActive: string;
}

// Status badge component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getStatusColor = () => {
    switch (status.toLowerCase()) {
      case "released":
        return "#9FD6A3"; // Light green
      case "expired":
        return "#E98989"; // Light red
      case "archived":
        return "#D9D9D9"; // Light gray
      case "pending":
        return "#E5D77C"; // Light yellow
      default:
        return "#D9D9D9"; // Default gray
    }
  };

  return (
    <div
      style={{
        backgroundColor: getStatusColor(),
        padding: "6px 12px",
        borderRadius: "20px",
        display: "inline-block",
        textAlign: "center",
        minWidth: "100px",
        fontWeight: "500",
      }}
    >
      {status}
    </div>
  );
};

// Row actions menu
const RowActions: React.FC<{
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

// Modal component
const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState("nofos");
  const [nofos, setNofos] = useState<NOFO[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Edit NOFO state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedNofo, setSelectedNofo] = useState<NOFO | null>(null);
  const [editedNofoName, setEditedNofoName] = useState("");

  // Hooks
  const navigate = useNavigate();
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);

  // Check if user is admin
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

  // Fetch data
  useEffect(() => {
    if (!isAdmin) return;

    const fetchData = async () => {
      try {
        // Fetch NOFOs
        const nofoResult = await apiClient.landingPage.getNOFOs();

        // Convert to simple format
        const nofoData = (nofoResult.folders || []).map((nofo, index) => ({
          id: index,
          name: nofo,
        }));

        setNofos(nofoData);

        // Mock users for now
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
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, [isAdmin, apiClient.landingPage]);

  // Filter data based on search query
  const filteredNofos = nofos.filter((nofo) =>
    nofo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // NOFO Handlers
  const handleEditNofo = (nofo: NOFO) => {
    setSelectedNofo(nofo);
    setEditedNofoName(nofo.name);
    setEditModalOpen(true);
  };

  const handleDeleteNofo = (nofo: NOFO) => {
    setSelectedNofo(nofo);
    setDeleteModalOpen(true);
  };

  const confirmEditNofo = async () => {
    if (!selectedNofo || !editedNofoName.trim()) return;

    try {
      // Call the API to update the NOFO name
      await apiClient.landingPage.renameNOFO(
        selectedNofo.name,
        editedNofoName.trim()
      );

      // Update local state after successful API call
      setNofos(
        nofos.map((nofo) =>
          nofo.id === selectedNofo.id
            ? { ...nofo, name: editedNofoName.trim() }
            : nofo
        )
      );

      // Show success notification
      alert(
        `NOFO renamed successfully from "${selectedNofo.name}" to "${editedNofoName}"`
      );

      // Close the modal
      setEditModalOpen(false);
      setSelectedNofo(null);
      setEditedNofoName("");
    } catch (error) {
      console.error("Error updating NOFO:", error);
      alert("Failed to rename NOFO. Please try again.");
    }
  };

  const confirmDeleteNofo = async () => {
    if (!selectedNofo) return;

    try {
      // Call the API to delete the NOFO
      await apiClient.landingPage.deleteNOFO(selectedNofo.name);

      // Update local state after successful API call
      setNofos(nofos.filter((nofo) => nofo.id !== selectedNofo.id));

      // Show success notification
      alert(`NOFO "${selectedNofo.name}" deleted successfully`);

      // Close the modal
      setDeleteModalOpen(false);
      setSelectedNofo(null);
    } catch (error) {
      console.error("Error deleting NOFO:", error);
      alert("Failed to delete NOFO. Please try again.");
    }
  };

  // Other Handlers
  const handleUploadNofo = () => {
    alert("Upload NOFO functionality would open here");
  };

  const handleInviteUser = () => {
    alert("Invite user functionality would open here");
  };

  // Loading state
  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Access control
  if (!isAdmin) {
    return null; // Will redirect in useEffect
  }

  // Render
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="dashboard-actions">
          <button
            className="upload-button"
            onClick={
              activeTab === "nofos" ? handleUploadNofo : handleInviteUser
            }
          >
            {activeTab === "nofos" ? "Upload NOFO" : "Invite User"}
          </button>
        </div>
      </div>

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

      <div className="search-container">
        <div className="search-input-wrapper">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <svg
            className="search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
              fill="#666"
            />
          </svg>
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
              fill="#333"
            />
          </svg>
        </button>
      </div>

      {activeTab === "nofos" ? (
        <div className="data-table">
          <div className="table-header">
            <div className="header-cell nofo-name">NOFO Name</div>
            <div className="header-cell">Agency</div>
            <div className="header-cell">Created</div>
            <div className="header-cell">Current Status</div>
            <div className="header-cell">Deadline</div>
            <div className="header-cell actions-cell"></div>
          </div>
          {filteredNofos.length > 0 ? (
            filteredNofos.map((nofo) => (
              <div className="table-row" key={nofo.id}>
                <div className="row-cell nofo-name">{nofo.name}</div>
                <div className="row-cell"></div>
                <div className="row-cell"></div>
                <div className="row-cell"></div>
                <div className="row-cell"></div>
                <div className="row-cell actions-cell">
                  <RowActions
                    onEdit={() => handleEditNofo(nofo)}
                    onDelete={() => handleDeleteNofo(nofo)}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="no-data">No NOFOs found</div>
          )}
        </div>
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

      {/* Edit NOFO Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit NOFO"
      >
        <div className="modal-form">
          <div className="form-group">
            <label htmlFor="nofo-name">NOFO Name</label>
            <input
              type="text"
              id="nofo-name"
              value={editedNofoName}
              onChange={(e) => setEditedNofoName(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="modal-actions">
            <button
              className="modal-button secondary"
              onClick={() => setEditModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="modal-button primary"
              onClick={confirmEditNofo}
              disabled={
                !editedNofoName.trim() || editedNofoName === selectedNofo?.name
              }
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete NOFO Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete NOFO"
      >
        <div className="modal-form">
          <p>
            Are you sure you want to delete{" "}
            <strong>{selectedNofo?.name}</strong>?
          </p>
          <p className="warning-text">This action cannot be undone.</p>
          <div className="modal-actions">
            <button
              className="modal-button secondary"
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancel
            </button>
            <button className="modal-button danger" onClick={confirmDeleteNofo}>
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;

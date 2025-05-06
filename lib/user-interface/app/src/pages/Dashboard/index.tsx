import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { NOFOsTab, NOFO, Modal } from "./NOFOsTab";
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
  // Tab state - Only grants tab now
  const [activeTab] = useState("grants");

  // Data state
  const [nofos, setNofos] = useState<NOFO[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Modal states
  const [uploadNofoModalOpen, setUploadNofoModalOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

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
        console.error("Error fetching grants:", error);
      }
    };

    fetchNofos();
  }, [isAdmin, apiClient.landingPage]);

  // Upload NOFO handler
  const handleUploadNofo = () => {
    setUploadNofoModalOpen(true);
  };

  // Invite user handler
  const handleInviteUser = () => {
    setInviteUserModalOpen(true);
  };

  // Send invite email
  const sendInvite = async () => {
    if (!inviteEmail.trim() || !/\S+@\S+\.\S+/.test(inviteEmail)) {
      alert("Please enter a valid email address");
      return;
    }

    try {
      await apiClient.userManagement.inviteUser(inviteEmail);
      
      alert(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteUserModalOpen(false);
    } catch (error) {
      console.error("Error sending invitation:", error);
      alert("Failed to send invitation. Please try again.");
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

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Admin Dashboard</h1>
      </div>

      {/* Only one tab now, but keeping the styling consistent */}
      <div className="tab-controls">
        <button className="tab-button active">
          Grants
        </button>
      </div>

      {/* Action buttons now inside the tab content area */}
      <div className="grants-actions" style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          marginBottom: '15px', 
          gap: '10px' 
        }}>
        <button
          className="action-button"
          onClick={handleInviteUser}
          style={{ 
            backgroundColor: '#4a90e2', 
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer' 
          }}
        >
          Invite User
        </button>
        <button
          className="action-button"
          onClick={handleUploadNofo}
          style={{ 
            backgroundColor: '#0073BB',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer' 
          }}
        >
          Add Grant
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
            placeholder="Search grants..."
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
      <NOFOsTab
        nofos={nofos}
        searchQuery={searchQuery}
        apiClient={apiClient}
        setNofos={setNofos}
        uploadNofoModalOpen={uploadNofoModalOpen}
        setUploadNofoModalOpen={setUploadNofoModalOpen}
      />

      {/* Invite User Modal */}
      <Modal
        isOpen={inviteUserModalOpen}
        onClose={() => setInviteUserModalOpen(false)}
        title="Invite New User"
      >
        <div className="modal-form">
          <p style={{ marginBottom: '20px', color: '#555' }}>
            Enter the email address of the user you want to invite. They will receive an email
            with instructions to set up their account.
          </p>
          <div className="form-group">
            <label htmlFor="invite-email" style={{ fontWeight: '600', color: '#0073BB', marginBottom: '8px', display: 'block' }}>Email Address:</label>
            <input
              type="email"
              id="invite-email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="form-input"
              placeholder="user@example.com"
              style={{ 
                width: '100%', 
                padding: '10px', 
                border: '1px solid #ccc', 
                borderRadius: '4px',
                fontSize: '16px'
              }}
            />
          </div>
          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
            <button
              className="modal-button secondary"
              onClick={() => setInviteUserModalOpen(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                color: '#444',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              className="modal-button primary"
              onClick={sendInvite}
              disabled={!inviteEmail.trim() || !/\S+@\S+\.\S+/.test(inviteEmail)}
              style={{
                padding: '8px 20px',
                backgroundColor: '#0275d8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              Send Invitation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
export { Modal } from "./NOFOsTab";

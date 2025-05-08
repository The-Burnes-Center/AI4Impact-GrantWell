import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { NOFOsTab, NOFO, Modal } from "./NOFOsTab";
import { useNotifications } from "../../components/notif-manager";
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
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // UI state
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState("");
  const [showGrantBanner, setShowGrantBanner] = useState(false);
  const [addedGrantName, setAddedGrantName] = useState("");

  // Modal states
  const [uploadNofoModalOpen, setUploadNofoModalOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  // Refs for click outside detection
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  // Hooks
  const navigate = useNavigate();
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const { addNotification } = useNotifications();

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
      addNotification("error", "Please enter a valid email address");
      return;
    }

    try {
      await apiClient.userManagement.inviteUser(inviteEmail);
      
      // Show success notification instead of alert
      addNotification("success", `Invitation sent successfully to ${inviteEmail}`);
      
      // Set state for success banner
      setInvitedEmail(inviteEmail);
      setShowSuccessBanner(true);
      
      // Hide the success banner after 5 seconds
      setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000);
      
      setInviteEmail("");
      setInviteUserModalOpen(false);
    } catch (error) {
      console.error("Error sending invitation:", error);
      addNotification("error", "Failed to send invitation. Please try again.");
    }
  };

  // Handler for showing grant success banner
  const showGrantSuccessBanner = (grantName: string) => {
    setAddedGrantName(grantName);
    setShowGrantBanner(true);
    addNotification("success", `Grant "${grantName}" added successfully!`);
    
    // Hide the success banner after 5 seconds
    setTimeout(() => {
      setShowGrantBanner(false);
    }, 5000);
  };

  // Filter handler
  const toggleFilterMenu = () => {
    setFilterMenuOpen(!filterMenuOpen);
  };

  // Apply filter handler
  const applyFilter = (status: "all" | "active" | "archived") => {
    setStatusFilter(status);
    setFilterMenuOpen(false);
    
    // Show notification about filter applied
    addNotification("info", `Filtered to show ${status === "all" ? "all grants" : `${status} grants only`}`);
  };

  // Get filtered data based on search query and status filter
  const getFilteredNofos = () => {
    // First filter by search query
    let filtered = nofos.filter((nofo) =>
      nofo.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // Then filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((nofo) => 
        (nofo.status || "active") === statusFilter
      );
    }
    
    return filtered;
  };

  // Get paginated data
  const getPaginatedData = () => {
    const filteredData = getFilteredNofos();
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    
    // Adjust current page if it exceeds total pages
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredData.slice(startIndex, startIndex + itemsPerPage);
    
    return {
      items: paginatedItems,
      totalItems: filteredData.length,
      totalPages: totalPages
    };
  };

  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Handle items per page change
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newItemsPerPage = parseInt(e.target.value);
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Pagination controls component
  const PaginationControls = () => {
    const { totalItems, totalPages } = getPaginatedData();
    
    if (totalItems === 0) return null;
    
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    
    // Generate page buttons
    const pageButtons = [];
    
    // Previous button
    pageButtons.push(
      <button 
        key="prev" 
        className="pagination-button"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        &lsaquo;
      </button>
    );
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(currentPage - Math.floor(maxVisiblePages / 2), 1);
    let endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(endPage - maxVisiblePages + 1, 1);
    }
    
    // First page button if not visible
    if (startPage > 1) {
      pageButtons.push(
        <button 
          key="1" 
          className={`pagination-button ${currentPage === 1 ? "active" : ""}`}
          onClick={() => handlePageChange(1)}
        >
          1
        </button>
      );
      
      // Ellipsis if there's a gap
      if (startPage > 2) {
        pageButtons.push(
          <span key="ellipsis1" style={{ margin: '0 5px' }}>...</span>
        );
      }
    }
    
    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      pageButtons.push(
        <button 
          key={i} 
          className={`pagination-button ${currentPage === i ? "active" : ""}`}
          onClick={() => handlePageChange(i)}
        >
          {i}
        </button>
      );
    }
    
    // Last page button if not visible
    if (endPage < totalPages) {
      // Ellipsis if there's a gap
      if (endPage < totalPages - 1) {
        pageButtons.push(
          <span key="ellipsis2" style={{ margin: '0 5px' }}>...</span>
        );
      }
      
      pageButtons.push(
        <button 
          key={totalPages} 
          className={`pagination-button ${currentPage === totalPages ? "active" : ""}`}
          onClick={() => handlePageChange(totalPages)}
        >
          {totalPages}
        </button>
      );
    }
    
    // Next button
    pageButtons.push(
      <button 
        key="next" 
        className="pagination-button"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        &rsaquo;
      </button>
    );
    
    return (
      <div className="pagination-container">
        <div className="pagination-info">
          Showing {startItem} to {endItem} of {totalItems} grants
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="pagination-controls">
            {pageButtons}
          </div>
          <div className="items-per-page">
            <span>Show:</span>
            <select 
              value={itemsPerPage} 
              onChange={handleItemsPerPageChange}
              aria-label="Items per page"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>
      </div>
    );
  };

  // Click outside handler for filter menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterMenuOpen &&
        filterMenuRef.current && 
        filterButtonRef.current &&
        !filterMenuRef.current.contains(event.target as Node) &&
        !filterButtonRef.current.contains(event.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [filterMenuOpen]);

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
      {/* Breadcrumb Navigation */}
      <div className="breadcrumb">
        <div className="breadcrumb-item">
          <span 
            className="breadcrumb-link" 
            onClick={() => navigate("/")}
            style={{ cursor: 'pointer' }}
          >
            Home
          </span>
        </div>
        <div className="breadcrumb-item">
          Dashboard
        </div>
      </div>

      {/* Header */}
      <div className="dashboard-header">
        <h1>Admin Dashboard</h1>
      </div>

      {/* Invitation Success Banner */}
      {showSuccessBanner && (
        <div 
          style={{
            backgroundColor: "#e6f7ed",
            color: "#0a6634",
            padding: "12px 24px",
            borderRadius: "4px",
            margin: "0 24px 16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ marginRight: "12px" }}
            >
              <path 
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" 
                fill="#0a6634"
              />
            </svg>
            <span style={{ fontWeight: "500" }}>
              Success! An invitation has been sent to {invitedEmail}
            </span>
          </div>
          <button 
            onClick={() => setShowSuccessBanner(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#0a6634",
              fontWeight: "bold"
            }}
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grant Added Success Banner */}
      {showGrantBanner && (
        <div 
          style={{
            backgroundColor: "#e6f7ed",
            color: "#0a6634",
            padding: "12px 24px",
            borderRadius: "4px",
            margin: "0 24px 16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ marginRight: "12px" }}
            >
              <path 
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" 
                fill="#0a6634"
              />
            </svg>
            <span style={{ fontWeight: "500" }}>
              Success! Grant "{addedGrantName}" has been added
            </span>
          </div>
          <button 
            onClick={() => setShowGrantBanner(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#0a6634",
              fontWeight: "bold"
            }}
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Only one tab now, but keeping the styling consistent */}
      <div className="tab-controls">
        <button className="tab-button active">
          Grants
        </button>
      </div>

      {/* Combined search and actions bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '25px',
        gap: '15px'
      }}>
        {/* Search bar - now with max-width */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          maxWidth: '60%',
          flex: '1'
        }}>
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
          <div style={{ position: 'relative' }}>
            <button 
              ref={filterButtonRef}
              className={`filter-button ${statusFilter !== "all" ? "active" : ""}`}
              onClick={toggleFilterMenu}
              aria-label="Filter options"
            >
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
              {statusFilter !== "all" && (
                <span className="filter-badge">1</span>
              )}
            </button>

            {filterMenuOpen && (
              <div ref={filterMenuRef} className="filter-menu">
                <div className="filter-menu-header">
                  Filter by Status
                </div>
                <div>
                  <button
                    onClick={() => applyFilter("all")}
                    className={`filter-option ${statusFilter === "all" ? "selected" : ""}`}
                  >
                    <div className="filter-option-content">
                      <span className="filter-option-check">
                        {statusFilter === "all" ? "✓" : ""}
                      </span>
                      All Grants
                    </div>
                  </button>

                  <button
                    onClick={() => applyFilter("active")}
                    className={`filter-option ${statusFilter === "active" ? "selected" : ""}`}
                  >
                    <div className="filter-option-content">
                      <span className="filter-option-check">
                        {statusFilter === "active" ? "✓" : ""}
                      </span>
                      Active Grants
                    </div>
                  </button>

                  <button
                    onClick={() => applyFilter("archived")}
                    className={`filter-option ${statusFilter === "archived" ? "selected" : ""}`}
                  >
                    <div className="filter-option-content">
                      <span className="filter-option-check">
                        {statusFilter === "archived" ? "✓" : ""}
                      </span>
                      Archived Grants
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons now side by side with search */}
        <div style={{ 
          display: 'flex', 
          gap: '15px'
        }}>
          <button
            className="action-button"
            onClick={handleInviteUser}
            style={{ 
              backgroundColor: '#4a90e2', 
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3a80d2';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#4a90e2';
              e.currentTarget.style.transform = 'translateY(0)';
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
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#005d94';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0073BB';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Add Grant
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <NOFOsTab
        nofos={getPaginatedData().items}
        searchQuery={searchQuery}
        apiClient={apiClient}
        setNofos={setNofos}
        uploadNofoModalOpen={uploadNofoModalOpen}
        setUploadNofoModalOpen={setUploadNofoModalOpen}
        showGrantSuccessBanner={showGrantSuccessBanner}
        useNotifications={{ addNotification }}
      />

      {/* Pagination Controls */}
      <PaginationControls />

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

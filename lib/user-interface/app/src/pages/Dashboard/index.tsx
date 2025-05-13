import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { useNotifications } from "../../components/notif-manager";
import "./styles.css";

export interface NOFO {
  id: number;
  name: string;
  status: "active" | "archived";
}

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
 * Modal component for confirmations and forms
 */
export const Modal: React.FC<{
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

interface NOFOsTabProps {
  nofos: NOFO[];
  searchQuery: string;
  apiClient: ApiClient;
  setNofos: React.Dispatch<React.SetStateAction<NOFO[]>>;
  uploadNofoModalOpen: boolean;
  setUploadNofoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showGrantSuccessBanner?: (grantName: string) => void;
  useNotifications?: any;
}

export const NOFOsTab: React.FC<NOFOsTabProps> = ({
  nofos,
  searchQuery,
  apiClient,
  setNofos,
  uploadNofoModalOpen,
  setUploadNofoModalOpen,
  showGrantSuccessBanner,
  useNotifications
}) => {
  // NOFO editing state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedNofo, setSelectedNofo] = useState<NOFO | null>(null);
  const [editedNofoName, setEditedNofoName] = useState("");
  const [editedNofoStatus, setEditedNofoStatus] = useState<"active" | "archived">("active");
  
  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customGrantName, setCustomGrantName] = useState("");

  // Access notifications if available
  const addNotification = useNotifications?.addNotification;

  // Filter data based on search query
  const filteredNofos = nofos.filter((nofo) =>
    nofo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // NOFO Handlers
  const handleEditNofo = (nofo: NOFO) => {
    setSelectedNofo(nofo);
    setEditedNofoName(nofo.name);
    setEditedNofoStatus(nofo.status || "active");
    setEditModalOpen(true);
  };

  const handleDeleteNofo = (nofo: NOFO) => {
    setSelectedNofo(nofo);
    setDeleteModalOpen(true);
  };

  // Save edited NOFO
  const confirmEditNofo = async () => {
    if (!selectedNofo || !editedNofoName.trim()) return;

    try {
      console.log(`Editing NOFO: ${selectedNofo.name} -> ${editedNofoName.trim()}, status: ${editedNofoStatus}`);
      
      // Call API to update NOFO name if it changed
      if (selectedNofo.name !== editedNofoName.trim()) {
        console.log(`Renaming NOFO from ${selectedNofo.name} to ${editedNofoName.trim()}`);
        await apiClient.landingPage.renameNOFO(
          selectedNofo.name,
          editedNofoName.trim()
        );
      }
      
      // Update NOFO status if it changed
      if (selectedNofo.status !== editedNofoStatus) {
        console.log(`Updating status from ${selectedNofo.status} to ${editedNofoStatus}`);
        await apiClient.landingPage.updateNOFOStatus(editedNofoName.trim(), editedNofoStatus);
      } else {
        console.log(`Status unchanged: ${editedNofoStatus}`);
      }

      // Update local state after successful API call
      setNofos(
        nofos.map((nofo) =>
          nofo.id === selectedNofo.id
            ? { ...nofo, name: editedNofoName.trim(), status: editedNofoStatus }
            : nofo
        )
      );

      // Show success notification
      if (addNotification) {
        addNotification("success", "Grant updated successfully");
      } else {
        alert("Grant updated successfully");
      }

      // Reset state
      setEditModalOpen(false);
      setSelectedNofo(null);
      setEditedNofoName("");
    } catch (error) {
      console.error("Error updating grant:", error);
      if (addNotification) {
        addNotification("error", "Failed to update grant. Please try again.");
      } else {
        alert("Failed to update grant. Please try again.");
      }
    }
  };

  // Toggle NOFO status
  const toggleNofoStatus = async (nofo: NOFO) => {
    const newStatus = nofo.status === "active" ? "archived" : "active";
    
    console.log(`Toggling NOFO ${nofo.name} status from ${nofo.status} to ${newStatus}`);
    
    try {
      // Call API to update NOFO status
      console.log(`Sending API request to update status for ${nofo.name} to ${newStatus}`);
      const result = await apiClient.landingPage.updateNOFOStatus(nofo.name, newStatus);
      console.log("API response:", result);
      
      // Update local state after successful API call
      setNofos(
        nofos.map((item) =>
          item.id === nofo.id
            ? { ...item, status: newStatus }
            : item
        )
      );

      // Show success notification
      if (addNotification) {
        addNotification("success", `Grant status changed to ${newStatus}`);
      } else {
        alert(`Grant status changed to ${newStatus}`);
      }
    } catch (error) {
      console.error("Error updating grant status:", error);
      if (addNotification) {
        addNotification("error", "Failed to update grant status. Please try again.");
      } else {
        alert("Failed to update grant status. Please try again.");
      }
    }
  };

  // Delete NOFO
  const confirmDeleteNofo = async () => {
    if (!selectedNofo) return;

    try {
      // Call API to delete NOFO
      await apiClient.landingPage.deleteNOFO(selectedNofo.name);

      // Update local state after successful API call
      setNofos(nofos.filter((nofo) => nofo.id !== selectedNofo.id));

      // Show success notification
      alert(`Grant "${selectedNofo.name}" deleted successfully`);

      // Reset state
      setDeleteModalOpen(false);
      setSelectedNofo(null);
    } catch (error) {
      console.error("Error deleting grant:", error);
      alert("Failed to delete grant. Please try again.");
    }
  };

  // File selection handler
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setSelectedFile(file);
      // Set default custom name from file name without extension
      const defaultName = file.name.split(".").slice(0, -1).join("");
      setCustomGrantName(defaultName);
    }
  };

  // Upload NOFO implementation
  const uploadNOFO = async () => {
    if (!selectedFile) {
      if (addNotification) {
        addNotification("error", "Please select a file first");
      } else {
        alert("Please select a file first");
      }
      return;
    }

    if (!customGrantName.trim()) {
      if (addNotification) {
        addNotification("error", "Grant name cannot be empty");
      } else {
        alert("Grant name cannot be empty");
      }
      return;
    }

    try {
      const folderName = customGrantName.trim();
      console.log(`Uploading new NOFO: ${folderName}`);
      
      let newFilePath;
      if (selectedFile.type === "text/plain") {
        newFilePath = `${folderName}/NOFO-File-TXT`;
      } else if (selectedFile.type === "application/pdf") {
        newFilePath = `${folderName}/NOFO-File-PDF`;
      } else {
        newFilePath = `${folderName}/NOFO-File`;
      }

      const signedUrl = await apiClient.landingPage.getUploadURL(
        newFilePath,
        selectedFile.type
      );
      await apiClient.landingPage.uploadFileToS3(signedUrl, selectedFile);
      
      // Set initial status to active for the new NOFO
      console.log(`Setting initial status for ${folderName} to 'active'`);
      await apiClient.landingPage.updateNOFOStatus(folderName, "active");

      // Use the banner if available, otherwise fall back to alert
      if (showGrantSuccessBanner) {
        showGrantSuccessBanner(folderName);
      } else if (addNotification) {
        addNotification("success", `Grant "${folderName}" added successfully!`);
      } else {
        alert("Grant file uploaded successfully!");
      }

      // Refresh NOFO list after successful upload
      const nofoResult = await apiClient.landingPage.getNOFOs();
      if (nofoResult.nofoData) {
        // Use the new nofoData that includes status information
        const nofoData = nofoResult.nofoData.map((nofo, index) => ({
          id: index,
          name: nofo.name,
          status: nofo.status || 'active'
        }));
        setNofos(nofoData);
      } else {
        // Fallback for backward compatibility
        const nofoData = (nofoResult.folders || []).map((nofo, index) => ({
          id: index,
          name: nofo,
          status: "active" // Default new grants to active
        }));
        setNofos(nofoData);
      }
      
      // Reset state
      setSelectedFile(null);
      setCustomGrantName("");
      setUploadNofoModalOpen(false);
    } catch (error) {
      console.error("Upload failed:", error);
      if (addNotification) {
        addNotification("error", "Failed to upload the grant file.");
      } else {
        alert("Failed to upload the grant file.");
      }
    }
  };

  return (
    <>
      <div className="data-table">
        <div className="table-header">
          <div className="header-cell nofo-name">Grant Name</div>
          <div className="header-cell">Status</div>
          <div className="header-cell actions-cell">Actions</div>
        </div>
        {filteredNofos.length > 0 ? (
          filteredNofos.map((nofo) => (
            <div className="table-row" key={nofo.id}>
              <div className="row-cell nofo-name">{nofo.name}</div>
              <div className="row-cell">
                <div 
                  className={`status-badge ${nofo.status || 'active'}`} 
                  onClick={() => {
                    console.log(`Clicked on status badge for ${nofo.name}, current status: ${nofo.status}`);
                    toggleNofoStatus(nofo);
                  }}
                  title="Click to toggle between active and archived"
                  style={{ 
                    cursor: 'pointer',
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    textTransform: 'capitalize',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    backgroundColor: nofo.status === 'archived' ? '#f7e6e6' : '#e6f7e6',
                    color: nofo.status === 'archived' ? '#c62828' : '#2e7d32',
                    border: `1px solid ${nofo.status === 'archived' ? '#ffcdd2' : '#c8e6c9'}`
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                  }}
                >
                  {nofo.status || "active"}
                </div>
              </div>
              <div className="row-cell actions-cell">
                <RowActions
                  onEdit={() => handleEditNofo(nofo)}
                  onDelete={() => handleDeleteNofo(nofo)}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="no-data">No grants found</div>
        )}
      </div>

      {/* Edit NOFO Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Grant"
      >
        <div className="modal-form">
          <div className="form-group">
            <label htmlFor="nofo-name">Grant Name</label>
            <input
              type="text"
              id="nofo-name"
              value={editedNofoName}
              onChange={(e) => setEditedNofoName(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="nofo-status">Status</label>
            <select
              id="nofo-status"
              value={editedNofoStatus}
              onChange={(e) => setEditedNofoStatus(e.target.value as "active" | "archived")}
              className="form-input"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
              Active grants are visible to users. Archived grants are hidden.
            </div>
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
                !editedNofoName.trim() || 
                (editedNofoName === selectedNofo?.name && editedNofoStatus === selectedNofo?.status)
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
        title="Delete Grant"
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

      {/* Upload NOFO Modal */}
      <Modal
        isOpen={uploadNofoModalOpen}
        onClose={() => {
          setUploadNofoModalOpen(false);
          setSelectedFile(null);
          setCustomGrantName("");
        }}
        title="Upload Grant"
      >
        <div className="modal-form">
          <p>
            Upload a new grant file in PDF or TXT format.
          </p>
          
          <div className="note-box" style={{ 
            backgroundColor: '#f8f9fa', 
            border: '1px solid #e9ecef', 
            borderRadius: '4px', 
            padding: '12px 15px', 
            fontSize: '14px', 
            color: '#495057',
            marginBottom: '20px'
          }}>
            <strong>Note:</strong> Upload a new NOFO to the NOFO dropdown above. It will take 5-7 minutes for the document to process and appear in the dropdown. Grab a coffee, and it'll be ready for your review!
          </div>
          
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label htmlFor="file-upload" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Select File:
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileSelect}
              style={{ display: 'block', marginBottom: '15px' }}
            />
            {selectedFile && (
              <div style={{ fontSize: '14px', color: '#555', marginTop: '5px' }}>
                Selected: {selectedFile.name}
              </div>
            )}
          </div>
          
          {selectedFile && (
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label htmlFor="custom-grant-name" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Grant Name:
              </label>
              <input
                type="text"
                id="custom-grant-name"
                value={customGrantName}
                onChange={(e) => setCustomGrantName(e.target.value)}
                placeholder="Enter grant name"
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              />
              <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
                This name will be used to identify the grant in the system.
              </div>
            </div>
          )}
          
          <div className="modal-actions">
            <button
              className="modal-button secondary"
              onClick={() => {
                setUploadNofoModalOpen(false);
                setSelectedFile(null);
                setCustomGrantName("");
              }}
            >
              Cancel
            </button>
            <button 
              className="modal-button primary" 
              onClick={uploadNOFO}
              disabled={!selectedFile || !customGrantName.trim()}
            >
              Upload Grant
            </button>
          </div>
        </div>
      </Modal>
    </>
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
        console.log("Fetching NOFOs data from API...");
        const nofoResult = await apiClient.landingPage.getNOFOs();
        console.log("API response:", nofoResult);

        // Convert to required format
        if (nofoResult.nofoData) {
          // Use the new nofoData that includes status information
          console.log("Using nofoData with status information:", nofoResult.nofoData);
          const nofoData = nofoResult.nofoData.map((nofo, index) => ({
            id: index,
            name: nofo.name,
            status: nofo.status || 'active'
          }));
          console.log("Mapped NOFO data with status:", nofoData);
          setNofos(nofoData);
        } else {
          // Fallback for backward compatibility
          console.log("No nofoData found, using fallback with folders:", nofoResult.folders);
          const nofoData = (nofoResult.folders || []).map((nofo, index) => ({
            id: index,
            name: nofo,
            status: 'active' // Default status
          }));
          setNofos(nofoData);
        }
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

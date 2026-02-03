import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { useNotifications } from "../../components/notif-manager";
import { Utils } from "../../common/utils";
import UnifiedNavigation from "../../components/unified-navigation";
import {
  LuPin,
  LuPinOff,
  LuSearch,
  LuFilter,
  LuMail,
  LuUpload,
  LuCheck,
  LuX,
  LuMenu,
  LuPencil,
  LuTrash,
  LuArchive,
  LuFileX,
  LuTriangle,
  LuInfo,
  LuFile,
  LuRefreshCw,
  LuDownload,
} from "react-icons/lu";
import { Modal } from "../../components/common/Modal";
import { DeleteConfirmationModal } from "../../components/common/DeleteConfirmationModal";
import "./styles.css";

// Define interface for pinned grants
interface PinnableGrant {
  id: string;
  name: string;
  isPinned: boolean;
}

export type GrantTypeId = "federal" | "state" | "quasi" | "philanthropic" | "unknown";

export interface NOFO {
  id: number;
  name: string;
  status: "active" | "archived";
  isPinned?: boolean;
  expirationDate?: string | null;
  grantType?: GrantTypeId | null;
  agency?: string | null;
  category?: string | null;
}

// Grant type definitions for display
export const GRANT_TYPES: Record<GrantTypeId, { label: string; color: string }> = {
  federal: { label: "Federal", color: "#1a4480" },
  state: { label: "State", color: "#2e8540" },
  quasi: { label: "Quasi", color: "#8168b3" },
  philanthropic: { label: "Philanthropic", color: "#e66f0e" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

// Grant category options (must match FUNDING_CATEGORY_MAP from automated-nofo-scraper)
export const GRANT_CATEGORIES = [
  "Recovery Act",
  "Agriculture",
  "Arts",
  "Business and Commerce",
  "Community Development",
  "Consumer Protection",
  "Disaster Prevention and Relief",
  "Education",
  "Employment, Labor, and Training",
  "Energy",
  "Energy Infrastructure and Critical Mineral and Materials (EICMM)",
  "Environment",
  "Food and Nutrition",
  "Health",
  "Housing",
  "Humanities",
  "Information and Statistics",
  "Infrastructure Investment and Jobs Act",
  "Income Security and Social Services",
  "Law, Justice, and Legal Services",
  "Natural Resources",
  "Opportunity Zone Benefits",
  "Regional Development",
  "Science, Technology, and Other Research and Development",
  "Transportation",
  "Affordable Care Act",
] as const;

/**
 * Row actions menu component - provides edit/delete functionality
 */
export const RowActions: React.FC<{
  onEdit: () => void;
  onDelete: () => void;
}> = ({ onEdit, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="row-actions" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="actions-button"
        aria-label="Row actions menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <LuMenu size={20} />
      </button>
      {isOpen && (
        <div className="actions-menu" role="menu">
          <button
            onClick={() => {
              onEdit();
              setIsOpen(false);
            }}
            className="menu-item"
            role="menuitem"
          >
            <LuPencil size={16} className="menu-icon" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => {
              onDelete();
              setIsOpen(false);
            }}
            className="menu-item"
            role="menuitem"
          >
            <LuTrash size={16} className="menu-icon" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Grant Actions Dropdown - provides status toggle, edit, and delete functionality
 */
const GrantActionsDropdown: React.FC<{
  nofo: NOFO;
  onToggleStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ nofo, onToggleStatus, onEdit, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Check if dropdown should open upward
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      const dropdownHeight = 150; // Approximate height of dropdown with 3 items

      // If not enough space below, open upward
      setDropUp(spaceBelow < dropdownHeight);
    }
  }, [isOpen]);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`grant-actions-dropdown ${isOpen ? "dropdown-open" : ""}`} ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="actions-dropdown-button"
        aria-label={`More actions for ${nofo.name}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <LuMenu size={18} />
      </button>
      {isOpen && (
        <div
          className={`actions-dropdown-menu ${dropUp ? "drop-up" : ""}`}
          role="menu"
        >
          {/* Toggle Status */}
          <button
            onClick={() => {
              onToggleStatus();
              setIsOpen(false);
            }}
            className="dropdown-menu-item"
            role="menuitem"
          >
            {nofo.status === "active" ? (
              <>
                <LuArchive size={16} className="menu-icon" />
                <span>Archive</span>
              </>
            ) : (
              <>
                <LuCheck size={16} className="menu-icon" />
                <span>Mark Active</span>
              </>
            )}
          </button>

          {/* Edit */}
          <button
            onClick={() => {
              onEdit();
              setIsOpen(false);
            }}
            className="dropdown-menu-item"
            role="menuitem"
          >
            <LuPencil size={16} className="menu-icon" />
            <span>Edit</span>
          </button>

          {/* Delete */}
          <button
            onClick={() => {
              onDelete();
              setIsOpen(false);
            }}
            className="dropdown-menu-item delete-item"
            role="menuitem"
          >
            <LuTrash size={16} className="menu-icon" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};


interface NOFOsTabProps {
  nofos: NOFO[];
  searchQuery: string;
  apiClient: ApiClient;
  updateNofos: (updater: (nofos: NOFO[]) => NOFO[]) => void;
  uploadNofoModalOpen: boolean;
  setUploadNofoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showGrantSuccessBanner?: (grantName: string) => void;
  useNotifications?: any;
}

export const NOFOsTab: React.FC<NOFOsTabProps> = ({
  nofos,
  searchQuery,
  apiClient,
  updateNofos,
  uploadNofoModalOpen,
  setUploadNofoModalOpen,
  showGrantSuccessBanner,
  useNotifications,
}) => {
  // NOFO editing state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedNofo, setSelectedNofo] = useState<NOFO | null>(null);
  const [editedNofoName, setEditedNofoName] = useState("");
  const [editedNofoStatus, setEditedNofoStatus] = useState<
    "active" | "archived"
  >("active");
  const [editedNofoExpirationDate, setEditedNofoExpirationDate] =
    useState<string>("");
  const [editedNofoGrantType, setEditedNofoGrantType] = useState<GrantTypeId | "">("");

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customGrantName, setCustomGrantName] = useState("");
  const [uploadGrantType, setUploadGrantType] = useState<GrantTypeId | "">("");
  const [uploadCategory, setUploadCategory] = useState<string>("");

  // Access notifications if available
  const addNotification = useNotifications?.addNotification;

  const filteredNofos = nofos;

  // Helper function to normalize grant name
  const normalizeGrantName = (name: string): string => {
    return name?.trim() || "";
  };

  // Function to check if a specific NOFO is pinned
  const isNofoPinned = (nofo: NOFO): boolean => {
    return !!nofo.isPinned;
  };

  // Handle pinning a grant
  const handlePinGrant = async (nofo: NOFO, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation(); // Prevent triggering the parent click handler
    }

    try {
      // Call API to update NOFO pinned status
      await apiClient.landingPage.updateNOFOStatus(nofo.name, undefined, true);

      // Update local state after successful API call
      updateNofos((allNofos) =>
        allNofos.map((item) =>
          item.id === nofo.id ? { ...item, isPinned: true } : item
        )
      );

      // Show success notification
      if (addNotification) {
        addNotification("success", `Grant "${nofo.name}" pinned successfully`);
      }
    } catch (error) {
      if (addNotification) {
        addNotification("error", "Failed to pin grant. Please try again.");
      }
    }
  };

  // Handle unpinning a grant
  const handleUnpinGrant = async (nofo: NOFO, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation(); // Prevent triggering the parent click handler
    }

    try {
      // Call API to update NOFO pinned status
      await apiClient.landingPage.updateNOFOStatus(nofo.name, undefined, false);

      // Update local state after successful API call
      updateNofos((allNofos) =>
        allNofos.map((item) =>
          item.id === nofo.id ? { ...item, isPinned: false } : item
        )
      );

      // Show success notification
      if (addNotification) {
        addNotification("info", `Grant "${nofo.name}" unpinned`);
      }
    } catch (error) {
      if (addNotification) {
        addNotification("error", "Failed to unpin grant. Please try again.");
      }
    }
  };

  // NOFO Handlers
  const handleEditNofo = (nofo: NOFO) => {
    setSelectedNofo(nofo);
    setEditedNofoName(nofo.name);
    setEditedNofoStatus(nofo.status || "active");
    setEditedNofoGrantType(nofo.grantType || "");
    if (nofo.expirationDate) {
      // Support both formats: "YYYY-MM-DD" (new) or ISO string (old)
      if (/^\d{4}-\d{2}-\d{2}$/.test(nofo.expirationDate)) {
        // Already in YYYY-MM-DD format
        setEditedNofoExpirationDate(nofo.expirationDate);
      } else {
        // ISO string format - extract date part
        const date = new Date(nofo.expirationDate);
        const formattedDate = date.toISOString().split("T")[0];
        setEditedNofoExpirationDate(formattedDate);
      }
    } else {
      setEditedNofoExpirationDate("");
    }
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
      // Call API to update NOFO name if it changed
      if (selectedNofo.name !== editedNofoName.trim()) {
        await apiClient.landingPage.renameNOFO(
          selectedNofo.name,
          editedNofoName.trim()
        );
      }

      // Update NOFO status if it changed
      if (selectedNofo.status !== editedNofoStatus) {
        await apiClient.landingPage.updateNOFOStatus(
          editedNofoName.trim(),
          editedNofoStatus
        );
      }

      // Store in YYYY-MM-DD format (new format)
      const newExpirationDate = editedNofoExpirationDate || null;
      
      // Normalize old expiration date for comparison (convert ISO to YYYY-MM-DD if needed)
      let normalizedOldExpirationDate = selectedNofo.expirationDate || null;
      if (normalizedOldExpirationDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedOldExpirationDate)) {
        // Convert ISO string to YYYY-MM-DD format for comparison
        const date = new Date(normalizedOldExpirationDate);
        normalizedOldExpirationDate = date.toISOString().split("T")[0];
      }

      if (newExpirationDate !== normalizedOldExpirationDate) {
        await apiClient.landingPage.updateNOFOStatus(
          editedNofoName.trim(),
          undefined,
          undefined,
          newExpirationDate
        );
      }

      // Update grant type if it changed
      const newGrantType = editedNofoGrantType || null;
      const oldGrantType = selectedNofo.grantType || null;

      if (newGrantType !== oldGrantType) {
        await apiClient.landingPage.updateNOFOStatus(
          editedNofoName.trim(),
          undefined,
          undefined,
          undefined,
          newGrantType as GrantTypeId
        );
      }

      // Update local state after successful API call
      updateNofos((allNofos) =>
        allNofos.map((nofo) =>
          nofo.id === selectedNofo.id
            ? {
                ...nofo,
                name: editedNofoName.trim(),
                status: editedNofoStatus,
                expirationDate: newExpirationDate,
                grantType: newGrantType as GrantTypeId | null,
              }
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
      setEditedNofoExpirationDate("");
      setEditedNofoGrantType("");
    } catch (error) {
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

    try {
      // Call API to update NOFO status
      const result = await apiClient.landingPage.updateNOFOStatus(
        nofo.name,
        newStatus
      );

      // Update local state after successful API call
      updateNofos((allNofos) =>
        allNofos.map((item) =>
          item.id === nofo.id ? { ...item, status: newStatus } : item
        )
      );

      // Show success notification
      if (addNotification) {
        addNotification("success", `Grant status changed to ${newStatus}`);
      } else {
        alert(`Grant status changed to ${newStatus}`);
      }
    } catch (error) {
      if (addNotification) {
        addNotification(
          "error",
          "Failed to update grant status. Please try again."
        );
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
      updateNofos((allNofos) => allNofos.filter((nofo) => nofo.id !== selectedNofo.id));

      // Show success notification
      if (addNotification) {
        addNotification(
          "success",
          `Grant "${selectedNofo.name}" deleted successfully`
        );
      } else {
        alert(`Grant "${selectedNofo.name}" deleted successfully`);
      }

      // Reset state
      setDeleteModalOpen(false);
      setSelectedNofo(null);
    } catch (error) {
      if (addNotification) {
        addNotification("error", "Failed to delete grant. Please try again.");
      } else {
        alert("Failed to delete grant. Please try again.");
      }
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

  // Function to upload NOFO without automatic refresh
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

    if (!uploadCategory) {
      if (addNotification) {
        addNotification("error", "Category is required");
      } else {
        alert("Please select a category");
      }
      return;
    }

    try {
      const folderName = customGrantName.trim();

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

      // Set initial status to active for the new NOFO, and grant type (default to 'federal' if not specified)
      await apiClient.landingPage.updateNOFOStatus(
        folderName, 
        "active", 
        undefined, 
        undefined,
        uploadGrantType ? (uploadGrantType as GrantTypeId) : "federal"
      );

      // Use the banner if available, otherwise fall back to alert
      if (showGrantSuccessBanner) {
        showGrantSuccessBanner(folderName);
      } else if (addNotification) {
        addNotification("success", `Grant "${folderName}" added successfully!`);
      } else {
        alert("Grant file uploaded successfully!");
      }

      // Reset state
      setSelectedFile(null);
      setCustomGrantName("");
      setUploadGrantType("");
      setUploadCategory("");
      setUploadNofoModalOpen(false);

      // We won't automatically refresh - that's now handled by the parent's showGrantSuccessBanner
    } catch (error) {
      if (addNotification) {
        addNotification("error", "Failed to upload the grant file.");
      } else {
        alert("Failed to upload the grant file.");
      }
    }
  };

  return (
    <div className="tab-content">
      {/* NOFO Table Header */}
      <div className="table-container">
        <div className="table-header">
          <div className="header-cell">Name</div>
          <div className="header-cell">Type</div>
          <div className="header-cell">Expiry Date</div>
          <div className="header-cell">Actions</div>
        </div>

        {/* NOFO Table Rows */}
        <div className="table-body">
          {filteredNofos.length === 0 && (
            <div className="no-data">
              <LuFileX size={24} className="no-data-icon" />
              <p>No grants found</p>
            </div>
          )}
          {filteredNofos.map((nofo) => (
            <div key={nofo.id} className="table-row">
              <div className="row-cell">
                <span className="nofo-name">{nofo.name}</span>
                {isNofoPinned(nofo) && (
                  <span className="pinned-badge">
                    <LuPin size={14} />
                    <span>Pinned</span>
                  </span>
                )}
              </div>
              <div className="row-cell">
                {nofo.grantType && GRANT_TYPES[nofo.grantType] ? (
                  <span 
                    className="grant-type-badge"
                    style={{ 
                      backgroundColor: `${GRANT_TYPES[nofo.grantType].color}15`,
                      color: GRANT_TYPES[nofo.grantType].color,
                      borderColor: `${GRANT_TYPES[nofo.grantType].color}40`
                    }}
                  >
                    {GRANT_TYPES[nofo.grantType].label}
                  </span>
                ) : (
                  <span className="grant-type-badge unset">Unset</span>
                )}
              </div>
              <div className="row-cell">
                {nofo.expirationDate ? (
                  <span className="expiry-date">
                    {Utils.formatExpirationDate(nofo.expirationDate)}
                  </span>
                ) : (
                  <span className="expiry-date no-date">N/A</span>
                )}
              </div>
              <div className="row-cell actions">
                {/* Pin/Unpin Button */}
                {isNofoPinned(nofo) ? (
                  <button
                    className="action-button unpin"
                    onClick={(e) => handleUnpinGrant(nofo, e)}
                    title="Unpin grant"
                    aria-label="Unpin grant"
                  >
                    <LuPinOff size={18} />
                  </button>
                ) : (
                  <button
                    className="action-button pin"
                    onClick={(e) => handlePinGrant(nofo, e)}
                    title="Pin grant"
                    aria-label="Pin grant"
                  >
                    <LuPin size={18} />
                  </button>
                )}

                {/* Actions Dropdown */}
                <GrantActionsDropdown
                  nofo={nofo}
                  onToggleStatus={() => toggleNofoStatus(nofo)}
                  onEdit={() => handleEditNofo(nofo)}
                  onDelete={() => handleDeleteNofo(nofo)}
                />
              </div>
            </div>
          ))}
        </div>
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
              placeholder="Enter grant name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="nofo-status">Status</label>
            <div className="select-wrapper">
              <select
                id="nofo-status"
                value={editedNofoStatus}
                onChange={(e) =>
                  setEditedNofoStatus(e.target.value as "active" | "archived")
                }
                className="form-input"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="field-note">
              Active grants are visible to users. Archived grants are hidden.
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="nofo-expiration-date">Expiry Date</label>
            <input
              type="date"
              id="nofo-expiration-date"
              value={editedNofoExpirationDate}
              onChange={(e) => setEditedNofoExpirationDate(e.target.value)}
              className="form-input"
            />
            <div className="field-note">
              Leave empty if no expiration date. Grants will be auto-archived
              after this date.
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="nofo-grant-type">Grant Type</label>
            <div className="select-wrapper">
              <select
                id="nofo-grant-type"
                value={editedNofoGrantType}
                onChange={(e) =>
                  setEditedNofoGrantType(e.target.value as GrantTypeId | "")
                }
                className="form-input"
              >
                <option value="">Select type...</option>
                <option value="federal">Federal</option>
                <option value="state">State</option>
                <option value="quasi">Quasi</option>
                <option value="philanthropic">Philanthropic</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="field-note">
              Federal, State, Quasi-governmental, Philanthropic, or Unknown.
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
                (editedNofoName === selectedNofo?.name &&
                  editedNofoStatus === selectedNofo?.status &&
                  editedNofoExpirationDate ===
                    (selectedNofo?.expirationDate 
                      ? (/^\d{4}-\d{2}-\d{2}$/.test(selectedNofo.expirationDate)
                          ? selectedNofo.expirationDate
                          : new Date(selectedNofo.expirationDate).toISOString().split("T")[0])
                      : "") &&
                  editedNofoGrantType === (selectedNofo?.grantType || ""))
              }
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete NOFO Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDeleteNofo}
        title="Delete Grant"
        itemName={selectedNofo?.name}
        itemLabel="grant"
      />

      {/* Upload NOFO Modal */}
      <Modal
        isOpen={uploadNofoModalOpen}
        onClose={() => {
          setUploadNofoModalOpen(false);
          setSelectedFile(null);
          setCustomGrantName("");
          setUploadGrantType("");
          setUploadCategory("");
        }}
        title="Upload Grant"
      >
        <div className="modal-form">
          <p className="modal-description">
            Upload a new grant file in PDF or TXT format.
          </p>

          <div className="info-box">
            <LuInfo size={18} className="info-icon" />
            <span>
              Upload a new NOFO to the NOFO dropdown above. It will take 5-7
              minutes for the document to process and appear in the dropdown.
              Grab a coffee, and it'll be ready for your review!
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="file-upload">Select File</label>
            <div className="file-upload-container">
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileSelect}
                className="file-input"
              />
              <div className="file-upload-button">
                <LuUpload size={16} className="button-icon" />
                <span>Choose File</span>
              </div>
            </div>
            {selectedFile && (
              <div className="selected-file">
                <LuFile size={16} className="file-icon" />
                <span>{selectedFile.name}</span>
              </div>
            )}
          </div>

          {selectedFile && (
            <>
              <div className="form-group">
                <label htmlFor="custom-grant-name">Grant Name</label>
                <input
                  type="text"
                  id="custom-grant-name"
                  value={customGrantName}
                  onChange={(e) => setCustomGrantName(e.target.value)}
                  className="form-input"
                  placeholder="Enter grant name"
                />
                <div className="field-note">
                  This name will be used to identify the grant in the system.
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="upload-grant-type">Grant Type</label>
                <div className="select-wrapper">
                  <select
                    id="upload-grant-type"
                    value={uploadGrantType}
                    onChange={(e) =>
                      setUploadGrantType(e.target.value as GrantTypeId | "")
                    }
                    className="form-input"
                  >
                    <option value="">Select type (optional)...</option>
                    <option value="federal">Federal</option>
                    <option value="state">State</option>
                    <option value="quasi">Quasi</option>
                    <option value="philanthropic">Philanthropic</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <div className="field-note">
                  Optional. Can be auto-detected or set later after upload.
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="upload-category">Category *</label>
                <div className="select-wrapper">
                  <select
                    id="upload-category"
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="form-input"
                    required
                  >
                    <option value="">Select category...</option>
                    {GRANT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-note">
                  Required. Select the funding category for this grant.
                </div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button
              className="modal-button secondary"
              onClick={() => {
                setUploadNofoModalOpen(false);
                setSelectedFile(null);
                setCustomGrantName("");
                setUploadGrantType("");
                setUploadCategory("");
              }}
            >
              Cancel
            </button>
            <button
              className="modal-button primary"
              onClick={uploadNOFO}
              disabled={!selectedFile || !customGrantName.trim() || !uploadCategory}
            >
              <LuUpload size={16} className="button-icon" />
              <span>Upload Grant</span>
            </button>
          </div>
        </div>
      </Modal>
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
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "archived"
  >("active");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states
  const [uploadNofoModalOpen, setUploadNofoModalOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  // Automated NOFO scraper state
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeConfirmModalOpen, setScrapeConfirmModalOpen] = useState(false);

  // Refs for click outside detection
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  // Hooks
  const navigate = useNavigate();
  const location = useLocation();
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const { addNotification } = useNotifications();

  // Scroll to top when route changes or component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Check admin permissions and fetch NOFOs on component mount
  useEffect(() => {
    const checkAdminAndFetchData = async () => {
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
          // Only fetch NOFOs if user is admin
          await fetchNofos();
        } else {
          // Redirect non-admin users
          navigate("/");
        }
      } catch (e) {
        // Error handling without console.error
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndFetchData();
  }, [navigate]);

  // Fetch NOFOs data
  const fetchNofos = async () => {
    try {
      setIsRefreshing(true);
      // Fetch NOFOs from API
      const nofoResult = await apiClient.landingPage.getNOFOs();

      // Convert to required format and include pinned status and grant type
      if (nofoResult.nofoData) {
        const nofoData = nofoResult.nofoData.map((nofo, index) => ({
          id: index,
          name: nofo.name,
          status: nofo.status || "active",
          isPinned: nofo.isPinned || false,
          expirationDate: nofo.expiration_date || null,
          grantType: nofo.grant_type || null,
          agency: nofo.agency || null,
          category: nofo.category || null,
        }));
        setNofos(nofoData);
      } else {
        // Fallback for backward compatibility
        const nofoData = (nofoResult.folders || []).map((nofo, index) => ({
          id: index,
          name: nofo,
          status: "active",
          isPinned: false,
          expirationDate: null,
          grantType: null,
          agency: null,
          category: null,
        }));
        setNofos(nofoData);
      }

      // Show success notification on manual refresh
      if (isRefreshing) {
        addNotification("success", "Dashboard refreshed successfully");
      }
    } catch (error) {
      if (isRefreshing) {
        addNotification("error", "Failed to refresh dashboard data");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

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
      addNotification(
        "success",
        `Invitation sent successfully to ${inviteEmail}`
      );

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
      addNotification("error", "Failed to send invitation. Please try again.");
    }
  };

  // Open scrape confirmation modal
  const handleScrapeButtonClick = () => {
    setScrapeConfirmModalOpen(true);
  };

  // Automated NOFO scraper handler - called after confirmation
  const confirmAutomatedScraper = async () => {
    setScrapeConfirmModalOpen(false);
    try {
      setIsScraping(true);
      addNotification("info", "Starting automated NOFO scraping...");

      const response = await apiClient.landingPage.triggerAutomatedScraper();

      if (response.result && response.result.processed > 0) {
        addNotification(
          "success",
          `Successfully processed ${response.result.processed} new NOFOs!`
        );
        // Refresh the NOFOs list to show new items
        await fetchNofos();
      } else {
        addNotification("info", "No new NOFOs found to process.");
      }
    } catch (error) {
      addNotification(
        "error",
        "Failed to run automated NOFO scraper. Please try again."
      );
    } finally {
      setIsScraping(false);
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

    // Refresh data after adding a grant
    fetchNofos();
  };

  // Filter handler
  const toggleFilterMenu = () => {
    setFilterMenuOpen(!filterMenuOpen);
  };

  // Apply status filter handler
  const applyFilter = (status: "all" | "active" | "archived") => {
    setStatusFilter(status);
    // Don't close menu so user can also select grant type filter
  };

  // Apply grant type filter handler
  const applyGrantTypeFilter = (grantType: GrantTypeId | "all") => {
    setGrantTypeFilter(grantType);
    // Don't close menu so user can also select status filter
  };

  // Get filtered data based on search query, status filter, and grant type filter
  const getFilteredNofos = () => {
    // First filter by search query
    let filtered = nofos.filter((nofo) =>
      nofo.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Then filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (nofo) => (nofo.status || "active") === statusFilter
      );
    }

    // Then filter by grant type
    if (grantTypeFilter !== "all") {
      filtered = filtered.filter(
        (nofo) => nofo.grantType === grantTypeFilter
      );
    }

    // Sort alphabetically: pinned grants first, then alphabetically by name
    filtered.sort((a, b) => {
      // Pinned grants come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Then sort alphabetically by name (case-insensitive)
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return filtered;
  };

  // Calculate active filter count for badge
  const getActiveFilterCount = () => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (grantTypeFilter !== "all") count++;
    return count;
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
    const paginatedItems = filteredData.slice(
      startIndex,
      startIndex + itemsPerPage
    );

    return {
      items: paginatedItems,
      totalItems: filteredData.length,
      totalPages: totalPages,
    };
  };

  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Handle items per page change
  const handleItemsPerPageChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
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
    const endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);

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
          <span key="ellipsis1" style={{ margin: "0 5px" }}>
            ...
          </span>
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
          aria-label={`Go to page ${i}`}
          aria-current={currentPage === i ? "page" : undefined}
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
          <span key="ellipsis2" style={{ margin: "0 5px" }}>
            ...
          </span>
        );
      }

      pageButtons.push(
        <button
          key={totalPages}
          className={`pagination-button ${
            currentPage === totalPages ? "active" : ""
          }`}
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
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="pagination-controls">{pageButtons}</div>
          <div className="items-per-page">
            <label
              htmlFor="items-per-page-select"
              style={{ marginRight: "8px" }}
            >
              Show:
            </label>
            <select
              id="items-per-page-select"
              value={itemsPerPage}
              onChange={handleItemsPerPageChange}
              aria-label="Items per page"
              className="form-input"
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

  // Reset pagination to page 1 when filters or search query change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, grantTypeFilter, searchQuery]);

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
    return <div className="loading">Loading Dashboard...</div>;
  }

  // Redirect happens in useEffect if not admin
  if (!isAdmin) {
    return null;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <nav aria-label="Application navigation" style={{ flexShrink: 0 }}>
        <UnifiedNavigation />
      </nav>
      <div className="dashboard-container" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <div className="breadcrumb-item">
            <button
              className="breadcrumb-link"
              onClick={() => navigate("/")}
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                color: "inherit",
                textDecoration: "underline",
              }}
            >
              Home
            </button>
          </div>
          <div className="breadcrumb-item" aria-current="page">
            Dashboard
          </div>
        </nav>

      <div className="dashboard-main-content">
        {/* Header with Refresh Button */}
        <div className="dashboard-header">
          <h1>Admin Dashboard</h1>
          <button
            className="action-button refresh-button"
            onClick={fetchNofos}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <span className="refresh-loading">Refreshing...</span>
            ) : (
              <>
                <LuRefreshCw size={16} className="button-icon refresh-icon" />
                <span>Refresh</span>
              </>
            )}
          </button>
        </div>

        {/* Invitation Success Banner */}
        {showSuccessBanner && (
          <div className="success-banner">
            <div className="success-banner-content">
              <LuCheck size={20} className="success-icon" />
              <span>
                Success! An invitation has been sent to {invitedEmail}
              </span>
            </div>
            <button
              onClick={() => setShowSuccessBanner(false)}
              className="banner-close-button"
              aria-label="Close notification"
            >
              <LuX size={18} />
            </button>
          </div>
        )}

        {/* Grant Added Success Banner */}
        {showGrantBanner && (
          <div className="success-banner">
            <div className="success-banner-content">
              <LuCheck size={20} className="success-icon" />
              <span>Success! Grant "{addedGrantName}" has been added</span>
            </div>
            <button
              onClick={() => setShowGrantBanner(false)}
              className="banner-close-button"
              aria-label="Close notification"
            >
              <LuX size={18} />
            </button>
          </div>
        )}

        {/* Only one tab now, but keeping the styling consistent */}
        <div className="tab-controls">
          <button className="tab-button active">Grants</button>
        </div>

        {/* Main content container - prevents double scrollbar */}
        <div className="dashboard-content">
          {/* Combined search and actions bar */}
          <div className="search-actions-container">
            {/* Search bar */}
            <div className="search-filter-container">
              <div className="search-input-wrapper">
                <LuSearch className="search-icon" size={18} />
                <label htmlFor="grant-search" className="visually-hidden">
                  Search grants
                </label>
                <input
                  id="grant-search"
                  type="text"
                  className="search-input"
                  placeholder="Search grants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-container">
                <button
                  ref={filterButtonRef}
                  className={`filter-button ${
                    getActiveFilterCount() > 0 ? "active" : ""
                  }`}
                  onClick={toggleFilterMenu}
                  aria-label="Filter grants"
                  aria-expanded={filterMenuOpen}
                  aria-haspopup="menu"
                >
                  <LuFilter size={18} />
                  {getActiveFilterCount() > 0 && (
                    <span className="filter-badge" aria-label={`${getActiveFilterCount()} filter(s) active`}>
                      {getActiveFilterCount()}
                    </span>
                  )}
                </button>

                {filterMenuOpen && (
                  <div ref={filterMenuRef} className="filter-menu" role="menu">
                    <div className="filter-menu-header">Filter by Status</div>
                    <div>
                      <button
                        onClick={() => applyFilter("all")}
                        className={`filter-option ${
                          statusFilter === "all" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={statusFilter === "all"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {statusFilter === "all" ? "✓" : ""}
                          </span>
                          All Status
                        </div>
                      </button>

                      <button
                        onClick={() => applyFilter("active")}
                        className={`filter-option ${
                          statusFilter === "active" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={statusFilter === "active"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {statusFilter === "active" ? "✓" : ""}
                          </span>
                          Active
                        </div>
                      </button>

                      <button
                        onClick={() => applyFilter("archived")}
                        className={`filter-option ${
                          statusFilter === "archived" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={statusFilter === "archived"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {statusFilter === "archived" ? "✓" : ""}
                          </span>
                          Archived
                        </div>
                      </button>
                    </div>

                    <div className="filter-menu-divider"></div>

                    <div className="filter-menu-header">Filter by Grant Type</div>
                    <div>
                      <button
                        onClick={() => applyGrantTypeFilter("all")}
                        className={`filter-option ${
                          grantTypeFilter === "all" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={grantTypeFilter === "all"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {grantTypeFilter === "all" ? "✓" : ""}
                          </span>
                          All Types
                        </div>
                      </button>

                      <button
                        onClick={() => applyGrantTypeFilter("federal")}
                        className={`filter-option ${
                          grantTypeFilter === "federal" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={grantTypeFilter === "federal"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {grantTypeFilter === "federal" ? "✓" : ""}
                          </span>
                          Federal
                        </div>
                      </button>

                      <button
                        onClick={() => applyGrantTypeFilter("state")}
                        className={`filter-option ${
                          grantTypeFilter === "state" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={grantTypeFilter === "state"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {grantTypeFilter === "state" ? "✓" : ""}
                          </span>
                          State
                        </div>
                      </button>

                      <button
                        onClick={() => applyGrantTypeFilter("quasi")}
                        className={`filter-option ${
                          grantTypeFilter === "quasi" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={grantTypeFilter === "quasi"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {grantTypeFilter === "quasi" ? "✓" : ""}
                          </span>
                          Quasi
                        </div>
                      </button>

                      <button
                        onClick={() => applyGrantTypeFilter("philanthropic")}
                        className={`filter-option ${
                          grantTypeFilter === "philanthropic" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={grantTypeFilter === "philanthropic"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {grantTypeFilter === "philanthropic" ? "✓" : ""}
                          </span>
                          Philanthropic
                        </div>
                      </button>

                      <button
                        onClick={() => applyGrantTypeFilter("unknown")}
                        className={`filter-option ${
                          grantTypeFilter === "unknown" ? "selected" : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={grantTypeFilter === "unknown"}
                      >
                        <div className="filter-option-content">
                          <span className="filter-option-check">
                            {grantTypeFilter === "unknown" ? "✓" : ""}
                          </span>
                          Unknown
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="action-buttons">
              <button
                className="action-button invite-button"
                onClick={handleInviteUser}
              >
                <LuMail size={16} className="button-icon" />
                <span>Invite User</span>
              </button>

              <button
                className="action-button add-button"
                onClick={handleUploadNofo}
              >
                <LuUpload size={16} className="button-icon" />
                <span>Add Grant</span>
              </button>

              <button
                className="action-button scraper-button"
                onClick={handleScrapeButtonClick}
                disabled={isScraping}
                aria-label="Auto-scrape NOFOs from grants.gov"
              >
                <LuDownload size={16} className="button-icon" />
                <span>{isScraping ? "Scraping..." : "Auto-Scrape NOFOs"}</span>
              </button>
            </div>
          </div>

          {/* Scrape Confirmation Modal */}
          <Modal
            isOpen={scrapeConfirmModalOpen}
            onClose={() => setScrapeConfirmModalOpen(false)}
            title="Confirm Auto-Scrape"
          >
            <div className="modal-form">
              <div className="delete-confirmation">
                <LuInfo
                  size={32}
                  className="warning-icon"
                  style={{ color: "#14558F" }}
                />
                <p>Are you sure you want to scrape NOFOs now?</p>
              </div>
              <p className="warning-text">
                This will search for new grants on grants.gov and add them to
                the system. This process may take a few minutes.
              </p>
              <div className="modal-actions">
                <button
                  className="modal-button secondary"
                  onClick={() => setScrapeConfirmModalOpen(false)}
                  aria-label="Cancel scraping"
                >
                  Cancel
                </button>
                <button
                  className="modal-button primary"
                  onClick={confirmAutomatedScraper}
                  aria-label="Confirm and start scraping"
                >
                  Yes, Scrape Now
                </button>
              </div>
            </div>
          </Modal>

          {/* Tab Content */}
          <NOFOsTab
            nofos={getPaginatedData().items}
            searchQuery={searchQuery}
            apiClient={apiClient}
            updateNofos={(updater) => setNofos(updater)}
            uploadNofoModalOpen={uploadNofoModalOpen}
            setUploadNofoModalOpen={setUploadNofoModalOpen}
            showGrantSuccessBanner={showGrantSuccessBanner}
            useNotifications={{ addNotification }}
          />

          {/* Pagination Controls */}
          <PaginationControls />
        </div>
      </div>

      {/* Invite User Modal */}
      <Modal
        isOpen={inviteUserModalOpen}
        onClose={() => setInviteUserModalOpen(false)}
        title="Invite New User"
      >
        <div className="modal-form">
          <p className="modal-description">
            Enter the email address of the user you want to invite. They will
            receive an email with instructions to set up their account.
          </p>
          <div className="form-group">
            <label htmlFor="invite-email">Email Address</label>
            <input
              type="email"
              id="invite-email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="form-input"
              placeholder="user@example.com"
            />
          </div>
          <div className="modal-actions">
            <button
              className="modal-button secondary"
              onClick={() => setInviteUserModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="modal-button primary"
              onClick={sendInvite}
              disabled={
                !inviteEmail.trim() || !/\S+@\S+\.\S+/.test(inviteEmail)
              }
            >
              Send Invitation
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
};

export default Dashboard;

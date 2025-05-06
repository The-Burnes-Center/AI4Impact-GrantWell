import React, { useState } from "react";
import { ApiClient } from "../../common/api-client/api-client";
import { RowActions } from "./index";

export interface NOFO {
  id: number;
  name: string;
  status: "active" | "archived";
}

interface NOFOsTabProps {
  nofos: NOFO[];
  searchQuery: string;
  apiClient: ApiClient;
  setNofos: React.Dispatch<React.SetStateAction<NOFO[]>>;
  uploadNofoModalOpen: boolean;
  setUploadNofoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const NOFOsTab: React.FC<NOFOsTabProps> = ({
  nofos,
  searchQuery,
  apiClient,
  setNofos,
  uploadNofoModalOpen,
  setUploadNofoModalOpen,
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
      // Call API to update NOFO name and status
      await apiClient.landingPage.renameNOFO(
        selectedNofo.name,
        editedNofoName.trim()
      );
      
      // Update NOFO status
      await apiClient.landingPage.updateNOFOStatus(editedNofoName.trim(), editedNofoStatus);

      // Update local state after successful API call
      setNofos(
        nofos.map((nofo) =>
          nofo.id === selectedNofo.id
            ? { ...nofo, name: editedNofoName.trim(), status: editedNofoStatus }
            : nofo
        )
      );

      // Show success notification
      alert(
        `Grant updated successfully`
      );

      // Reset state
      setEditModalOpen(false);
      setSelectedNofo(null);
      setEditedNofoName("");
    } catch (error) {
      console.error("Error updating grant:", error);
      alert("Failed to update grant. Please try again.");
    }
  };

  // Toggle NOFO status
  const toggleNofoStatus = async (nofo: NOFO) => {
    const newStatus = nofo.status === "active" ? "archived" : "active";
    
    try {
      // Call API to update NOFO status
      await apiClient.landingPage.updateNOFOStatus(nofo.name, newStatus);
      
      // Update local state after successful API call
      setNofos(
        nofos.map((item) =>
          item.id === nofo.id
            ? { ...item, status: newStatus }
            : item
        )
      );

      // Show success notification
      alert(`Grant status changed to ${newStatus}`);
    } catch (error) {
      console.error("Error updating grant status:", error);
      alert("Failed to update grant status. Please try again.");
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
      alert("Please select a file first");
      return;
    }

    if (!customGrantName.trim()) {
      alert("Grant name cannot be empty");
      return;
    }

    try {
      // Use the custom grant name for the folder
      const folderName = customGrantName.trim();
      
      let newFilePath;
      if (selectedFile.type === "text/plain") {
        newFilePath = `${folderName}/Grant-File-TXT`;
      } else if (selectedFile.type === "application/pdf") {
        newFilePath = `${folderName}/Grant-File-PDF`;
      } else {
        newFilePath = `${folderName}/Grant-File`;
      }

      const signedUrl = await apiClient.landingPage.getUploadURL(
        newFilePath,
        selectedFile.type
      );
      await apiClient.landingPage.uploadFileToS3(signedUrl, selectedFile);

      alert("Grant file uploaded successfully!");

      // Refresh NOFO list after successful upload
      const nofoResult = await apiClient.landingPage.getNOFOs();
      const nofoData = (nofoResult.folders || []).map((nofo, index) => ({
        id: index,
        name: nofo,
        status: "active" // Default new grants to active
      }));
      setNofos(nofoData);
      
      // Reset state
      setSelectedFile(null);
      setCustomGrantName("");
      setUploadNofoModalOpen(false);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload the grant file.");
    }
  };

  // Legacy file selection method (directly from file dialog)
  const openFileDialog = () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.txt";

    fileInput.onchange = async (event) => {
      const file = fileInput.files[0];

      if (!file) return;

      setSelectedFile(file);
      const defaultName = file.name.split(".").slice(0, -1).join("");
      setCustomGrantName(defaultName);
    };

    fileInput.click();
  };

  return (
    <>
      <div className="data-table">
        <div className="table-header">
          <div className="header-cell nofo-name">Grant Name</div>
          <div className="header-cell">Status</div>
          <div className="header-cell actions-cell"></div>
        </div>
        {filteredNofos.length > 0 ? (
          filteredNofos.map((nofo) => (
            <div className="table-row" key={nofo.id}>
              <div className="row-cell nofo-name">{nofo.name}</div>
              <div className="row-cell">
                <div 
                  className={`status-badge ${nofo.status || 'active'}`} 
                  onClick={() => toggleNofoStatus(nofo)}
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    background: (nofo.status || 'active') === 'active' ? '#e6f7ed' : '#f0f0f0',
                    color: (nofo.status || 'active') === 'active' ? '#0a6634' : '#666666',
                    border: (nofo.status || 'active') === 'active' ? '1px solid #b7e3c7' : '1px solid #dddddd',
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

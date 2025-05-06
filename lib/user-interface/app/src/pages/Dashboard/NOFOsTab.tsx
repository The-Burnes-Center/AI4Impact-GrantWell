import React, { useState } from "react";
import { ApiClient } from "../../common/api-client/api-client";
import { RowActions } from "./index";

export interface NOFO {
  id: number;
  name: string;
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

  // Filter data based on search query
  const filteredNofos = nofos.filter((nofo) =>
    nofo.name.toLowerCase().includes(searchQuery.toLowerCase())
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

  // Save edited NOFO
  const confirmEditNofo = async () => {
    if (!selectedNofo || !editedNofoName.trim()) return;

    try {
      // Call API to update NOFO name
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
        `Grant renamed successfully from "${selectedNofo.name}" to "${editedNofoName}"`
      );

      // Reset state
      setEditModalOpen(false);
      setSelectedNofo(null);
      setEditedNofoName("");
    } catch (error) {
      console.error("Error updating grant:", error);
      alert("Failed to rename grant. Please try again.");
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

  // Upload NOFO implementation
  const uploadNOFO = async () => {
    setUploadNofoModalOpen(false);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.txt";

    fileInput.onchange = async (event) => {
      const file = fileInput.files[0];

      if (!file) return;

      try {
        const documentName = file.name.split(".").slice(0, -1).join("");
        let newFilePath;
        if (file.type === "text/plain") {
          newFilePath = `${documentName}/Grant-File-TXT`;
        } else if (file.type === "application/pdf") {
          newFilePath = `${documentName}/Grant-File-PDF`;
        } else {
          newFilePath = `${documentName}/Grant-File`;
        }

        const signedUrl = await apiClient.landingPage.getUploadURL(
          newFilePath,
          file.type
        );
        await apiClient.landingPage.uploadFileToS3(signedUrl, file);

        alert("Grant file uploaded successfully!");

        // Refresh NOFO list after successful upload
        const nofoResult = await apiClient.landingPage.getNOFOs();
        const nofoData = (nofoResult.folders || []).map((nofo, index) => ({
          id: index,
          name: nofo,
        }));
        setNofos(nofoData);
      } catch (error) {
        console.error("Upload failed:", error);
        alert("Failed to upload the grant file.");
      }
    };

    fileInput.click();
  };

  return (
    <>
      <div className="data-table">
        <div className="table-header">
          <div className="header-cell nofo-name">Grant Name</div>
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
        onClose={() => setUploadNofoModalOpen(false)}
        title="Upload Grant"
      >
        <div className="modal-form">
          <p>
            Upload a new grant file in PDF or TXT format. The file name will be used as the grant name.
          </p>
          <div className="modal-actions">
            <button
              className="modal-button secondary"
              onClick={() => setUploadNofoModalOpen(false)}
            >
              Cancel
            </button>
            <button className="modal-button primary" onClick={uploadNOFO}>
              Choose File
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

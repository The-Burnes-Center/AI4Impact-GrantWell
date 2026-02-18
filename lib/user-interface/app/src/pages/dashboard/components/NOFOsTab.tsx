import React, { useState } from "react";
import {
  LuPin, LuPinOff, LuFileX, LuUpload, LuInfo, LuFile,
} from "react-icons/lu";
import { ApiClient } from "../../../common/api-client/api-client";
import { Modal } from "../../../components/common/Modal";
import { DeleteConfirmationModal } from "../../../components/common/DeleteConfirmationModal";
import GrantActionsDropdown from "./GrantActionsDropdown";
import { Utils } from "../../../common/utils";
import type { NOFO, GrantTypeId } from "../../../common/types/nofo";
import { GRANT_TYPES, GRANT_CATEGORIES } from "../../../common/types/nofo";

interface NOFOsTabProps {
  nofos: NOFO[];
  searchQuery: string;
  apiClient: ApiClient;
  updateNofos: (updater: (nofos: NOFO[]) => NOFO[]) => void;
  uploadNofoModalOpen: boolean;
  setUploadNofoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showGrantSuccessBanner?: (grantName: string) => void;
  addNotification: (type: string, message: string) => void;
}

const NOFOsTab: React.FC<NOFOsTabProps> = ({
  nofos,
  searchQuery,
  apiClient,
  updateNofos,
  uploadNofoModalOpen,
  setUploadNofoModalOpen,
  showGrantSuccessBanner,
  addNotification,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedNofo, setSelectedNofo] = useState<NOFO | null>(null);
  const [editedNofoName, setEditedNofoName] = useState("");
  const [editedNofoStatus, setEditedNofoStatus] = useState<"active" | "archived">("active");
  const [editedNofoExpirationDate, setEditedNofoExpirationDate] = useState<string>("");
  const [editedNofoGrantType, setEditedNofoGrantType] = useState<GrantTypeId | "">("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customGrantName, setCustomGrantName] = useState("");
  const [uploadGrantType, setUploadGrantType] = useState<GrantTypeId | "">("");
  const [uploadCategory, setUploadCategory] = useState<string>("");

  const handlePinGrant = async (nofo: NOFO, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      await apiClient.landingPage.updateNOFOStatus(nofo.name, undefined, true);
      updateNofos((allNofos) =>
        allNofos.map((item) => item.id === nofo.id ? { ...item, isPinned: true } : item)
      );
      addNotification("success", `Grant "${nofo.name}" pinned successfully`);
    } catch {
      addNotification("error", "Failed to pin grant. Please try again.");
    }
  };

  const handleUnpinGrant = async (nofo: NOFO, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      await apiClient.landingPage.updateNOFOStatus(nofo.name, undefined, false);
      updateNofos((allNofos) =>
        allNofos.map((item) => item.id === nofo.id ? { ...item, isPinned: false } : item)
      );
      addNotification("info", `Grant "${nofo.name}" unpinned`);
    } catch {
      addNotification("error", "Failed to unpin grant. Please try again.");
    }
  };

  const handleEditNofo = (nofo: NOFO) => {
    setSelectedNofo(nofo);
    setEditedNofoName(nofo.name);
    setEditedNofoStatus(nofo.status || "active");
    setEditedNofoGrantType(nofo.grantType || "");
    if (nofo.expirationDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(nofo.expirationDate)) {
        setEditedNofoExpirationDate(nofo.expirationDate);
      } else {
        setEditedNofoExpirationDate(new Date(nofo.expirationDate).toISOString().split("T")[0]);
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

  const confirmEditNofo = async () => {
    if (!selectedNofo || !editedNofoName.trim()) return;
    try {
      if (selectedNofo.name !== editedNofoName.trim()) {
        await apiClient.landingPage.renameNOFO(selectedNofo.name, editedNofoName.trim());
      }
      if (selectedNofo.status !== editedNofoStatus) {
        await apiClient.landingPage.updateNOFOStatus(editedNofoName.trim(), editedNofoStatus);
      }
      const newExpirationDate = editedNofoExpirationDate || null;
      let normalizedOld = selectedNofo.expirationDate || null;
      if (normalizedOld && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedOld)) {
        normalizedOld = new Date(normalizedOld).toISOString().split("T")[0];
      }
      if (newExpirationDate !== normalizedOld) {
        await apiClient.landingPage.updateNOFOStatus(editedNofoName.trim(), undefined, undefined, newExpirationDate);
      }
      const newGrantType = editedNofoGrantType || null;
      if (newGrantType !== (selectedNofo.grantType || null)) {
        await apiClient.landingPage.updateNOFOStatus(editedNofoName.trim(), undefined, undefined, undefined, newGrantType as GrantTypeId);
      }
      updateNofos((allNofos) =>
        allNofos.map((nofo) =>
          nofo.id === selectedNofo.id
            ? { ...nofo, name: editedNofoName.trim(), status: editedNofoStatus, expirationDate: newExpirationDate, grantType: newGrantType as GrantTypeId | null }
            : nofo
        )
      );
      addNotification("success", "Grant updated successfully");
      setEditModalOpen(false);
      setSelectedNofo(null);
      setEditedNofoName("");
      setEditedNofoExpirationDate("");
      setEditedNofoGrantType("");
    } catch {
      addNotification("error", "Failed to update grant. Please try again.");
    }
  };

  const toggleNofoStatus = async (nofo: NOFO) => {
    const newStatus = nofo.status === "active" ? "archived" : "active";
    try {
      await apiClient.landingPage.updateNOFOStatus(nofo.name, newStatus);
      updateNofos((allNofos) =>
        allNofos.map((item) => item.id === nofo.id ? { ...item, status: newStatus } : item)
      );
      addNotification("success", `Grant status changed to ${newStatus}`);
    } catch {
      addNotification("error", "Failed to update grant status. Please try again.");
    }
  };

  const confirmDeleteNofo = async () => {
    if (!selectedNofo) return;
    try {
      await apiClient.landingPage.deleteNOFO(selectedNofo.name);
      updateNofos((allNofos) => allNofos.filter((nofo) => nofo.id !== selectedNofo.id));
      addNotification("success", `Grant "${selectedNofo.name}" deleted successfully`);
      setDeleteModalOpen(false);
      setSelectedNofo(null);
    } catch {
      addNotification("error", "Failed to delete grant. Please try again.");
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setSelectedFile(file);
      setCustomGrantName(file.name.split(".").slice(0, -1).join(""));
    }
  };

  const uploadNOFO = async () => {
    if (!selectedFile) { addNotification("error", "Please select a file first"); return; }
    if (!customGrantName.trim()) { addNotification("error", "Grant name cannot be empty"); return; }
    if (!uploadCategory) { addNotification("error", "Category is required"); return; }

    try {
      const folderName = customGrantName.trim();
      let newFilePath: string;
      if (selectedFile.type === "text/plain") newFilePath = `${folderName}/NOFO-File-TXT`;
      else if (selectedFile.type === "application/pdf") newFilePath = `${folderName}/NOFO-File-PDF`;
      else newFilePath = `${folderName}/NOFO-File`;

      const signedUrl = await apiClient.landingPage.getUploadURL(newFilePath, selectedFile.type);
      await apiClient.landingPage.uploadFileToS3(signedUrl, selectedFile);
      await apiClient.landingPage.updateNOFOStatus(
        folderName, "active", undefined, undefined,
        uploadGrantType ? (uploadGrantType as GrantTypeId) : "federal"
      );

      if (showGrantSuccessBanner) {
        showGrantSuccessBanner(folderName);
      } else {
        addNotification("success", `Grant "${folderName}" added successfully!`);
      }

      setSelectedFile(null);
      setCustomGrantName("");
      setUploadGrantType("");
      setUploadCategory("");
      setUploadNofoModalOpen(false);
    } catch {
      addNotification("error", "Failed to upload the grant file.");
    }
  };

  const isChanged = () => {
    if (!selectedNofo) return false;
    if (!editedNofoName.trim()) return false;
    let normalizedOldExp = selectedNofo.expirationDate || "";
    if (normalizedOldExp && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedOldExp)) {
      normalizedOldExp = new Date(normalizedOldExp).toISOString().split("T")[0];
    }
    return (
      editedNofoName !== selectedNofo.name ||
      editedNofoStatus !== selectedNofo.status ||
      editedNofoExpirationDate !== normalizedOldExp ||
      editedNofoGrantType !== (selectedNofo.grantType || "")
    );
  };

  return (
    <div className="tab-content">
      <div className="table-container">
        <div className="table-header">
          <div className="header-cell">Name</div>
          <div className="header-cell">Type</div>
          <div className="header-cell">Expiry Date</div>
          <div className="header-cell">Actions</div>
        </div>
        <div className="table-body">
          {nofos.length === 0 && (
            <div className="no-data">
              <LuFileX size={24} className="no-data-icon" />
              <p>No grants found</p>
            </div>
          )}
          {nofos.map((nofo) => (
            <div key={nofo.id} className="table-row">
              <div className="row-cell">
                <span className="nofo-name">{nofo.name}</span>
                {nofo.isPinned && (
                  <span className="pinned-badge"><LuPin size={14} /><span>Pinned</span></span>
                )}
              </div>
              <div className="row-cell">
                {nofo.grantType && GRANT_TYPES[nofo.grantType] ? (
                  <span
                    className="grant-type-badge"
                    style={{
                      backgroundColor: `${GRANT_TYPES[nofo.grantType].color}15`,
                      color: GRANT_TYPES[nofo.grantType].color,
                      borderColor: `${GRANT_TYPES[nofo.grantType].color}40`,
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
                  <span className="expiry-date">{Utils.formatExpirationDate(nofo.expirationDate)}</span>
                ) : (
                  <span className="expiry-date no-date">N/A</span>
                )}
              </div>
              <div className="row-cell actions">
                {nofo.isPinned ? (
                  <button className="action-button unpin" onClick={(e) => handleUnpinGrant(nofo, e)} title="Unpin grant" aria-label="Unpin grant">
                    <LuPinOff size={18} />
                  </button>
                ) : (
                  <button className="action-button pin" onClick={(e) => handlePinGrant(nofo, e)} title="Pin grant" aria-label="Pin grant">
                    <LuPin size={18} />
                  </button>
                )}
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
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Grant">
        <div className="modal-form">
          <div className="form-group">
            <label htmlFor="nofo-name">Grant Name</label>
            <input type="text" id="nofo-name" value={editedNofoName} onChange={(e) => setEditedNofoName(e.target.value)} className="form-input" placeholder="Enter grant name" />
          </div>
          <div className="form-group">
            <label htmlFor="nofo-status">Status</label>
            <div className="select-wrapper">
              <select id="nofo-status" value={editedNofoStatus} onChange={(e) => setEditedNofoStatus(e.target.value as "active" | "archived")} className="form-input">
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="field-note">Active grants are visible to users. Archived grants are hidden.</div>
          </div>
          <div className="form-group">
            <label htmlFor="nofo-expiration-date">Expiry Date</label>
            <input type="date" id="nofo-expiration-date" value={editedNofoExpirationDate} onChange={(e) => setEditedNofoExpirationDate(e.target.value)} className="form-input" />
            <div className="field-note">Leave empty if no expiration date. Grants will be auto-archived after this date.</div>
          </div>
          <div className="form-group">
            <label htmlFor="nofo-grant-type">Grant Type</label>
            <div className="select-wrapper">
              <select id="nofo-grant-type" value={editedNofoGrantType} onChange={(e) => setEditedNofoGrantType(e.target.value as GrantTypeId | "")} className="form-input">
                <option value="">Select type...</option>
                <option value="federal">Federal</option>
                <option value="state">State</option>
                <option value="quasi">Quasi</option>
                <option value="philanthropic">Philanthropic</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="field-note">Federal, State, Quasi-governmental, Philanthropic, or Unknown.</div>
          </div>
          <div className="modal-actions">
            <button className="modal-button secondary" onClick={() => setEditModalOpen(false)}>Cancel</button>
            <button className="modal-button primary" onClick={confirmEditNofo} disabled={!isChanged()}>Save Changes</button>
          </div>
        </div>
      </Modal>

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={confirmDeleteNofo} title="Delete Grant" itemName={selectedNofo?.name} itemLabel="grant" />

      {/* Upload NOFO Modal */}
      <Modal
        isOpen={uploadNofoModalOpen}
        onClose={() => { setUploadNofoModalOpen(false); setSelectedFile(null); setCustomGrantName(""); setUploadGrantType(""); setUploadCategory(""); }}
        title="Upload Grant"
      >
        <div className="modal-form">
          <p className="modal-description">Upload a new grant file in PDF or TXT format.</p>
          <div className="info-box">
            <LuInfo size={18} className="info-icon" />
            <span>Upload a new NOFO to the NOFO dropdown above. It will take 5-7 minutes for the document to process and appear in the dropdown. Grab a coffee, and it&#39;ll be ready for your review!</span>
          </div>
          <div className="form-group">
            <label htmlFor="file-upload">Select File</label>
            <div className="file-upload-container">
              <input id="file-upload" type="file" accept=".pdf,.txt" onChange={handleFileSelect} className="file-input" />
              <div className="file-upload-button"><LuUpload size={16} className="button-icon" /><span>Choose File</span></div>
            </div>
            {selectedFile && (
              <div className="selected-file"><LuFile size={16} className="file-icon" /><span>{selectedFile.name}</span></div>
            )}
          </div>
          {selectedFile && (
            <>
              <div className="form-group">
                <label htmlFor="custom-grant-name">Grant Name</label>
                <input type="text" id="custom-grant-name" value={customGrantName} onChange={(e) => setCustomGrantName(e.target.value)} className="form-input" placeholder="Enter grant name" />
                <div className="field-note">This name will be used to identify the grant in the system.</div>
              </div>
              <div className="form-group">
                <label htmlFor="upload-grant-type">Grant Type</label>
                <div className="select-wrapper">
                  <select id="upload-grant-type" value={uploadGrantType} onChange={(e) => setUploadGrantType(e.target.value as GrantTypeId | "")} className="form-input">
                    <option value="">Select type (optional)...</option>
                    <option value="federal">Federal</option>
                    <option value="state">State</option>
                    <option value="quasi">Quasi</option>
                    <option value="philanthropic">Philanthropic</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <div className="field-note">Optional. Can be auto-detected or set later after upload.</div>
              </div>
              <div className="form-group">
                <label htmlFor="upload-category">Category *</label>
                <div className="select-wrapper">
                  <select id="upload-category" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className="form-input" required>
                    <option value="">Select category...</option>
                    {GRANT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div className="field-note">Required. Select the funding category for this grant.</div>
              </div>
            </>
          )}
          <div className="modal-actions">
            <button className="modal-button secondary" onClick={() => { setUploadNofoModalOpen(false); setSelectedFile(null); setCustomGrantName(""); setUploadGrantType(""); setUploadCategory(""); }}>Cancel</button>
            <button className="modal-button primary" onClick={uploadNOFO} disabled={!selectedFile || !customGrantName.trim() || !uploadCategory}>
              <LuUpload size={16} className="button-icon" /><span>Upload Grant</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NOFOsTab;

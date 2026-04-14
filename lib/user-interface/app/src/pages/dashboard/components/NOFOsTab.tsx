import React, { useState, useCallback } from "react";
import {
  LuPin, LuPinOff, LuFileX, LuUpload, LuInfo, LuFile, LuLoader,
} from "react-icons/lu";
import { ApiClient } from "../../../common/api-client/api-client";
import { Modal } from "../../../components/common/Modal";
import { DeleteConfirmationModal } from "../../../components/common/DeleteConfirmationModal";
import GrantActionsDropdown from "./GrantActionsDropdown";
import SummaryEditor from "./SummaryEditor";
import { Utils } from "../../../common/utils";
import type { NOFO, GrantTypeId } from "../../../common/types/nofo";
import { GRANT_TYPES, GRANT_CATEGORIES } from "../../../common/types/nofo";

const PROCESSING_LABELS: Record<string, string> = {
  uploading: "Uploading...",
  extracting_text: "Extracting text...",
  detecting_sections: "Detecting sections...",
  synthesizing: "Synthesizing...",
  validating: "Validating...",
  quarantined: "Quarantined",
  incomplete: "Incomplete",
};

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

const NOFOsTab = React.memo(function NOFOsTab({
  nofos,
  searchQuery,
  apiClient,
  updateNofos,
  uploadNofoModalOpen,
  setUploadNofoModalOpen,
  showGrantSuccessBanner,
  addNotification,
}: NOFOsTabProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedNofo, setSelectedNofo] = useState<NOFO | null>(null);
  const [editedNofoName, setEditedNofoName] = useState("");
  const [editedNofoStatus, setEditedNofoStatus] = useState<"active" | "archived">("active");
  const [editedNofoExpirationDate, setEditedNofoExpirationDate] = useState<string>("");
  const [editedNofoGrantType, setEditedNofoGrantType] = useState<GrantTypeId | "">("");
  const [editedNofoIsRolling, setEditedNofoIsRolling] = useState<boolean>(false);

  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summarySaving, setSummarySaving] = useState(false);
  const [originalSummary, setOriginalSummary] = useState<Record<string, unknown> | null>(null);
  const [editedSummary, setEditedSummary] = useState<Record<string, unknown>>({});

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customGrantName, setCustomGrantName] = useState("");
  const [uploadGrantType, setUploadGrantType] = useState<GrantTypeId | "">("");
  const [uploadCategory, setUploadCategory] = useState<string>("");
  const [uploadAgency, setUploadAgency] = useState<string>("");

  const handleEditSummary = useCallback(async (nofo: NOFO) => {
    setSelectedNofo(nofo);
    setSummaryModalOpen(true);
    setSummaryLoading(true);
    try {
      const result = await apiClient.landingPage.getNOFOSummary(nofo.name);
      const data = result.data || {};
      setOriginalSummary(JSON.parse(JSON.stringify(data)));
      setEditedSummary(data);
    } catch {
      addNotification("error", "Failed to load grant summary. Please try again.");
      setSummaryModalOpen(false);
    } finally {
      setSummaryLoading(false);
    }
  }, [apiClient, addNotification]);

  const handleSummaryChange = useCallback((updated: Record<string, unknown>) => {
    setEditedSummary(updated);
  }, []);

  const isSummaryChanged = useCallback(() => {
    if (!originalSummary) return false;
    return JSON.stringify(editedSummary) !== JSON.stringify(originalSummary);
  }, [editedSummary, originalSummary]);

  const confirmSaveSummary = useCallback(async () => {
    if (!selectedNofo || !isSummaryChanged()) return;
    setSummarySaving(true);
    try {
      await apiClient.landingPage.updateNOFOSummary(selectedNofo.name, editedSummary);
      addNotification("success", `Summary for "${selectedNofo.name}" updated successfully`);
      setSummaryModalOpen(false);
      setSelectedNofo(null);
      setOriginalSummary(null);
      setEditedSummary({});
    } catch {
      addNotification("error", "Failed to save summary changes. Please try again.");
    } finally {
      setSummarySaving(false);
    }
  }, [selectedNofo, editedSummary, isSummaryChanged, apiClient, addNotification]);

  const closeSummaryModal = useCallback(() => {
    setSummaryModalOpen(false);
    setSelectedNofo(null);
    setOriginalSummary(null);
    setEditedSummary({});
  }, []);

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
    setEditedNofoIsRolling(nofo.isRolling || false);
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
      if (editedNofoIsRolling !== (selectedNofo.isRolling || false)) {
        await apiClient.landingPage.updateNOFOStatus(editedNofoName.trim(), undefined, undefined, undefined, undefined, undefined, undefined, editedNofoIsRolling);
      }
      updateNofos((allNofos) =>
        allNofos.map((nofo) =>
          nofo.id === selectedNofo.id
            ? { ...nofo, name: editedNofoName.trim(), status: editedNofoStatus, expirationDate: newExpirationDate, grantType: newGrantType as GrantTypeId | null, isRolling: editedNofoIsRolling }
            : nofo
        )
      );
      addNotification("success", "Grant updated successfully");
      setEditModalOpen(false);
      setSelectedNofo(null);
      setEditedNofoName("");
      setEditedNofoExpirationDate("");
      setEditedNofoGrantType("");
      setEditedNofoIsRolling(false);
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
      else if (selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") newFilePath = `${folderName}/NOFO-File-DOCX`;
      else newFilePath = `${folderName}/NOFO-File`;

      const signedUrl = await apiClient.landingPage.getUploadURL(newFilePath, selectedFile.type);
      await apiClient.landingPage.uploadFileToS3(signedUrl, selectedFile);
      await apiClient.landingPage.updateNOFOStatus(
        folderName, "active", undefined, undefined,
        uploadGrantType ? (uploadGrantType as GrantTypeId) : "federal",
        uploadCategory,
        uploadAgency || undefined
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
      setUploadAgency("");
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
      editedNofoGrantType !== (selectedNofo.grantType || "") ||
      editedNofoIsRolling !== (selectedNofo.isRolling || false)
    );
  };

  return (
    <div className="tab-content">
      <div className="table-container">
        <div className="table-header">
          <div className="header-cell">Name</div>
          <div className="header-cell">Type</div>
          <div className="header-cell">Deadline</div>
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
                {nofo.processingStatus && (
                  <span className="processing-status-pill" aria-live="polite">
                    {PROCESSING_LABELS[nofo.processingStatus] ?? nofo.processingStatus}
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
                {nofo.isRolling || !nofo.expirationDate ? (
                  <span className="expiry-date rolling">Rolling</span>
                ) : (
                  <span className="expiry-date">{Utils.formatExpirationDate(nofo.expirationDate!)}</span>
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
                  onEditSummary={() => handleEditSummary(nofo)}
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
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editedNofoIsRolling}
                onChange={(e) => setEditedNofoIsRolling(e.target.checked)}
              />
              Rolling grant (no fixed deadline)
            </label>
            <div className="field-note">Rolling grants show "Rolling" instead of a deadline date.</div>
          </div>
          <div className="form-group">
            <label htmlFor="nofo-expiration-date">Deadline</label>
            <input type="date" id="nofo-expiration-date" value={editedNofoExpirationDate} onChange={(e) => setEditedNofoExpirationDate(e.target.value)} className="form-input" disabled={editedNofoIsRolling} />
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
              </select>
            </div>
            <div className="field-note">Federal, State, Quasi-governmental, or Philanthropic.</div>
          </div>
          <div className="modal-actions">
            <button className="modal-button secondary" onClick={() => setEditModalOpen(false)}>Cancel</button>
            <button className="modal-button primary" onClick={confirmEditNofo} disabled={!isChanged()}>Save Changes</button>
          </div>
        </div>
      </Modal>

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={confirmDeleteNofo} title="Delete Grant" itemName={selectedNofo?.name} itemLabel="grant" />

      {/* Edit Summary Modal */}
      <Modal
        isOpen={summaryModalOpen}
        onClose={closeSummaryModal}
        title={`Edit Summary — ${selectedNofo?.name || ""}`}
      >
        <div className="modal-form" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {summaryLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: "12px", color: "var(--mds-color-text-secondary)" }}>
              <LuLoader size={20} className="spin-animation" aria-hidden="true" />
              <span role="status">Loading summary...</span>
            </div>
          ) : (
            <>
              <p className="modal-description" style={{ marginBottom: "16px" }}>
                Review and correct the extracted grant summary below. Changes will take effect immediately for all users.
              </p>
              <SummaryEditor
                editedSummary={editedSummary}
                onSummaryChange={handleSummaryChange}
              />
              <div className="modal-actions" style={{ marginTop: "16px" }}>
                <button className="modal-button secondary" onClick={closeSummaryModal}>
                  Cancel
                </button>
                <button
                  className="modal-button primary"
                  onClick={confirmSaveSummary}
                  disabled={!isSummaryChanged() || summarySaving}
                >
                  {summarySaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Upload NOFO Modal */}
      <Modal
        isOpen={uploadNofoModalOpen}
        onClose={() => { setUploadNofoModalOpen(false); setSelectedFile(null); setCustomGrantName(""); setUploadGrantType(""); setUploadCategory(""); setUploadAgency(""); }}
        title="Upload Grant"
      >
        <div className="modal-form">
          <p className="modal-description">Upload a new grant file in PDF, TXT, or DOCX format.</p>
          <div className="info-box">
            <LuInfo size={18} className="info-icon" />
            <span>Upload a new NOFO to the NOFO dropdown above. It will take 5-7 minutes for the document to process and appear in the dropdown. Grab a coffee, and it&#39;ll be ready for your review!</span>
          </div>
          <div className="form-group">
            <label htmlFor="file-upload">Select File</label>
            <div className="file-upload-container">
              <input id="file-upload" type="file" accept=".pdf,.txt,.docx" onChange={handleFileSelect} className="file-input" />
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
              <div className="form-group">
                <label htmlFor="upload-agency">Agency</label>
                <input type="text" id="upload-agency" value={uploadAgency} onChange={(e) => setUploadAgency(e.target.value)} className="form-input" placeholder="e.g. Department of Health and Human Services" />
                <div className="field-note">Optional. The government agency issuing this grant.</div>
              </div>
            </>
          )}
          <div className="modal-actions">
            <button className="modal-button secondary" onClick={() => { setUploadNofoModalOpen(false); setSelectedFile(null); setCustomGrantName(""); setUploadGrantType(""); setUploadCategory(""); setUploadAgency(""); }}>Cancel</button>
            <button className="modal-button primary" onClick={uploadNOFO} disabled={!selectedFile || !customGrantName.trim() || !uploadCategory}>
              <LuUpload size={16} className="button-icon" /><span>Upload Grant</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default NOFOsTab;

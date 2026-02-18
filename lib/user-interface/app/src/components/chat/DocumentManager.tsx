import React, { useState, useContext, useEffect, useCallback, useRef } from "react";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { FileUploader } from "../../common/file-uploader";
import { Auth } from "aws-amplify";
import {
  X,
  Upload,
  Trash2,
  FileText,
  RefreshCw,
  Download,
} from "lucide-react";
import "../../styles/document-manager.css";

const SUPPORTED_EXTENSIONS = [
  ".csv", ".doc", ".docx", ".epub", ".odt", ".pdf", ".ppt", ".pptx",
  ".tsv", ".xlsx", ".eml", ".html", ".json", ".md", ".msg", ".rst",
  ".rtf", ".txt", ".xml",
];

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".html": "text/html",
  ".json": "application/json",
  ".xml": "application/xml",
  ".md": "text/markdown",
  ".rtf": "application/rtf",
  ".epub": "application/epub+zip",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".tsv": "text/tab-separated-values",
  ".eml": "message/rfc822",
  ".msg": "application/vnd.ms-outlook",
};

interface DocumentManagerProps {
  isOpen: boolean;
  onClose: () => void;
  documentIdentifier: string | null;
}

interface UploadedFile {
  name: string;
  size: number;
  uploadDate: string;
}

export default function DocumentManager({
  isOpen,
  onClose,
  documentIdentifier,
}: DocumentManagerProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "view">("upload");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusAnnouncement, setUploadStatusAnnouncement] = useState("");
  const [existingFiles, setExistingFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const appContext = useContext(AppContext);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);

  const extractNofoName = (docId: string | null): string => {
    if (!docId) return "";
    return docId.split("/").pop() || docId;
  };

  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        setUserId(user.username);
      } catch (err) {
        console.error("Error getting user:", err);
        setError("Failed to authenticate user. Please refresh the page.");
      }
    };
    if (isOpen) {
      fetchUserId();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 100);

    return () => {
      if (previousFocusRef.current && document.body.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement;
      const isInsideModal = modalRef.current?.contains(activeElement);

      if (!isInsideModal) {
        e.preventDefault();
        firstElement.focus();
        return;
      }

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);
    return () => document.removeEventListener("keydown", handleTabKey);
  }, [isOpen]);

  // Focus the confirm dialog when it opens
  useEffect(() => {
    if (fileToDelete && confirmDialogRef.current) {
      confirmDialogRef.current.focus();
    }
  }, [fileToDelete]);

  const fetchExistingFiles = useCallback(async () => {
    if (!appContext || !documentIdentifier || !userId) return;

    setLoadingFiles(true);
    setError(null);

    try {
      const apiClient = new ApiClient(appContext);
      const nofoName = extractNofoName(documentIdentifier);
      const result = await apiClient.knowledgeManagement.getDocuments(userId, nofoName);

      if (result && result.Contents) {
        const files = result.Contents
          .map((item: { Key: string; Size: number; LastModified: string }) => ({
            name: item.Key.split("/").pop() || item.Key,
            size: item.Size,
            uploadDate: item.LastModified,
          }))
          .filter((file: { name: string }) =>
            file.name !== "" && !file.name.endsWith(".metadata.json")
          );

        setExistingFiles(files);
      } else {
        setExistingFiles([]);
      }
    } catch (err) {
      console.error("Error fetching existing files:", err);
      setError("Failed to load existing files. Please try again.");
    } finally {
      setLoadingFiles(false);
    }
  }, [appContext, documentIdentifier, userId]);

  useEffect(() => {
    if (isOpen && activeTab === "view") {
      fetchExistingFiles();
    }
  }, [isOpen, activeTab, fetchExistingFiles]);

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (files: File[]) => {
    setError(null);
    const validFiles: File[] = [];

    for (const file of files) {
      const extension = "." + file.name.split(".").pop()?.toLowerCase();

      if (!SUPPORTED_EXTENSIONS.includes(extension)) {
        setError(
          `Unsupported file type: ${extension}. Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`
        );
        continue;
      }

      if (file.size > 100 * 1024 * 1024) {
        setError("File size exceeds 100MB limit.");
        continue;
      }

      validFiles.push(file);
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (!appContext || !documentIdentifier || !userId || selectedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setUploadStatusAnnouncement("Uploading files");

    const uploader = new FileUploader();
    const apiClient = new ApiClient(appContext);
    const nofoName = extractNofoName(documentIdentifier);
    const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);
    let uploadedSize = 0;

    try {
      for (const file of selectedFiles) {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
        const fileType = MIME_TYPES[fileExt] || "application/octet-stream";

        try {
          const uploadUrl = await apiClient.knowledgeManagement.getUploadURL(
            file.name, fileType, userId, nofoName
          );

          await uploader.upload(file, uploadUrl, fileType, (uploaded: number) => {
            const progress = Math.round(((uploadedSize + uploaded) / totalSize) * 100);
            setUploadProgress(progress);
          });

          uploadedSize += file.size;
        } catch (err) {
          console.error(`Error uploading file ${file.name}:`, err);
          setError(`Failed to upload ${file.name}. Please try again.`);
          setUploading(false);
          setUploadStatusAnnouncement("");
          return;
        }
      }

      setSelectedFiles([]);
      setUploadProgress(100);
      setUploadStatusAnnouncement("Files uploaded. Indexing documents.");

      try {
        await apiClient.knowledgeManagement.syncKendra();
        setUploadStatusAnnouncement("Indexing complete. Viewing uploaded files.");
      } catch (syncError) {
        console.error("Error syncing knowledge base:", syncError);
        setUploadStatusAnnouncement("Files uploaded successfully. Viewing uploaded files.");
      }

      if (activeTab === "view") {
        fetchExistingFiles();
      }

      setTimeout(() => {
        setUploading(false);
        setActiveTab("view");
        setUploadStatusAnnouncement("");
      }, 1000);
    } catch (err) {
      console.error("Error during upload:", err);
      setError("An error occurred during upload. Please try again.");
      setUploading(false);
      setUploadStatusAnnouncement("");
    }
  };

  const confirmDelete = (fileName: string) => {
    setFileToDelete(fileName);
  };

  const cancelDelete = () => {
    setFileToDelete(null);
  };

  const executeDelete = async () => {
    if (!fileToDelete || !appContext || !documentIdentifier || !userId) return;

    const fileName = fileToDelete;
    setFileToDelete(null);

    try {
      const apiClient = new ApiClient(appContext);
      const nofoName = extractNofoName(documentIdentifier);
      await apiClient.knowledgeManagement.deleteFile(userId, nofoName, fileName);
      fetchExistingFiles();
    } catch (err) {
      console.error(`Error deleting file ${fileName}:`, err);
      setError(`Failed to delete ${fileName}. Please try again.`);
    }
  };

  const downloadFile = async (fileName: string) => {
    if (!appContext || !documentIdentifier || !userId) return;

    try {
      setDownloadingFile(fileName);
      setError(null);
      const apiClient = new ApiClient(appContext);
      const nofoName = extractNofoName(documentIdentifier);

      const fileExt = "." + fileName.split(".").pop()?.toLowerCase();
      const fileType = MIME_TYPES[fileExt] || "application/octet-stream";

      const downloadUrl = await apiClient.knowledgeManagement.getUploadURL(
        fileName, fileType, userId, nofoName
      );

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(`Error downloading file ${fileName}:`, err);
      setError(`Failed to download ${fileName}. Please try again.`);
    } finally {
      setDownloadingFile(null);
    }
  };

  const formatFileSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  if (!isOpen) return null;

  return (
    <div
      className="dm-overlay"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className="dm-container"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
        aria-labelledby="dm-title"
      >
        <div className="dm-header">
          <h2 id="dm-title" className="dm-title">Document Manager</h2>
          <button className="dm-close-btn" onClick={onClose} aria-label="Close document manager">
            <X size={20} />
          </button>
        </div>

        <div className="dm-tab-container" role="tablist" aria-label="Document manager tabs">
          <button
            className="dm-tab"
            onClick={() => setActiveTab("upload")}
            role="tab"
            tabIndex={activeTab === "upload" ? 0 : -1}
            aria-selected={activeTab === "upload"}
            aria-controls="upload-panel"
            id="upload-tab"
          >
            Upload New Files
          </button>
          <button
            className="dm-tab"
            onClick={() => { setActiveTab("view"); fetchExistingFiles(); }}
            role="tab"
            tabIndex={activeTab === "view" ? 0 : -1}
            aria-selected={activeTab === "view"}
            aria-controls="view-panel"
            id="view-tab"
          >
            View Existing Files
          </button>
        </div>

        <div className="dm-body">
          {activeTab === "upload" ? (
            <div role="tabpanel" aria-labelledby="upload-tab" id="upload-panel">
              <div
                className={`dm-drop-zone${dragActive ? " dm-drag-active" : ""}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                role="region"
                aria-label="File upload area with drag and drop"
              >
                <label htmlFor="dm-file-input" className="dm-drop-label" tabIndex={0}>
                  <Upload size={40} className="dm-upload-icon" aria-hidden="true" />
                  <p className="dm-drop-text">Drag and drop your files here</p>
                  <p className="dm-browse-text" id="upload-instructions">
                    or <span className="dm-browse-link">browse files</span>
                  </p>
                </label>

                <input
                  id="dm-file-input"
                  type="file"
                  multiple
                  className="dm-file-input"
                  onChange={handleFileInput}
                  accept={SUPPORTED_EXTENSIONS.join(",")}
                  aria-describedby="upload-instructions"
                />
              </div>

              {error && <div role="alert" className="dm-error">{error}</div>}

              <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                {uploadStatusAnnouncement}
              </div>

              {selectedFiles.length > 0 && (
                <div className="dm-file-list">
                  <p className="dm-file-list-header">
                    Selected Files ({selectedFiles.length})
                  </p>
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="dm-file-item">
                      <FileText size={20} className="dm-file-icon" aria-hidden="true" />
                      <div className="dm-file-details">
                        <p className="dm-file-name">{file.name}</p>
                        <p className="dm-file-size">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        className="dm-delete-btn"
                        onClick={() => removeFile(index)}
                        disabled={uploading}
                        aria-label={`Remove ${file.name} from upload queue`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}

                  <button
                    className="dm-upload-btn"
                    onClick={uploadFiles}
                    disabled={uploading || selectedFiles.length === 0}
                    aria-label={
                      uploading
                        ? `Uploading files, ${uploadProgress}% complete`
                        : `Upload ${selectedFiles.length} selected files`
                    }
                  >
                    <Upload size={16} aria-hidden="true" />
                    {uploading ? `Uploading... ${uploadProgress}%` : "Upload Files"}
                  </button>

                  {uploading && (
                    <div className="dm-progress-container">
                      <div className="dm-progress-bar">
                        <div
                          className="dm-progress-fill"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="dm-file-list" role="tabpanel" aria-labelledby="view-tab" id="view-panel">
              <div className="dm-file-list-header">
                <p>Current Files</p>
                <button
                  className="dm-refresh-btn"
                  onClick={fetchExistingFiles}
                  disabled={loadingFiles || !isOpen}
                  aria-label="Refresh file list"
                >
                  <RefreshCw size={14} />
                  {loadingFiles ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div role="status" aria-live="polite" className="sr-only">
                {loadingFiles ? "Loading files" : ""}
              </div>

              {loadingFiles ? (
                <div className="dm-loading-container">
                  <div className="dm-spinner" />
                </div>
              ) : existingFiles.length === 0 ? (
                <div className="dm-empty-state">
                  <p>No files have been uploaded yet.</p>
                </div>
              ) : (
                existingFiles.map((file, index) => (
                  <div key={index} className="dm-file-item">
                    <FileText size={20} className="dm-file-icon" aria-hidden="true" />
                    <div
                      className="dm-file-details-clickable"
                      onClick={() => downloadFile(file.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          downloadFile(file.name);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Download ${file.name}`}
                    >
                      <p className="dm-file-name">
                        {file.name}
                        {downloadingFile === file.name && (
                          <span className="dm-download-status">(Preparing download...)</span>
                        )}
                      </p>
                      <p className="dm-file-size">
                        {formatFileSize(file.size)} &bull; Uploaded {formatDate(file.uploadDate)}
                      </p>
                    </div>
                    <button
                      className="dm-download-btn"
                      onClick={() => downloadFile(file.name)}
                      disabled={downloadingFile === file.name}
                      aria-label={`Download ${file.name}`}
                    >
                      {downloadingFile === file.name ? (
                        <div className="dm-download-spinner" />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                    <button
                      className="dm-delete-btn"
                      onClick={() => confirmDelete(file.name)}
                      disabled={downloadingFile === file.name}
                      aria-label={`Delete ${file.name}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}

              {error && <div role="alert" className="dm-error">{error}</div>}
            </div>
          )}
        </div>

        <div className="dm-footer">
          <button className="dm-footer-close-btn" onClick={onClose} aria-label="Close document manager">
            Close
          </button>
        </div>
      </div>

      {fileToDelete && (
        <div
          className="dm-confirm-overlay"
          onClick={cancelDelete}
          onKeyDown={(e) => { if (e.key === "Escape") cancelDelete(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dm-confirm-title"
        >
          <div
            ref={confirmDialogRef}
            className="dm-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            <h3 id="dm-confirm-title" className="dm-confirm-title">Delete File</h3>
            <p className="dm-confirm-message">
              Are you sure you want to delete <strong>{fileToDelete}</strong>?
              This will remove it from your uploaded documents and it will no
              longer be available in chat.
            </p>
            <div className="dm-confirm-actions">
              <button className="dm-confirm-cancel-btn" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="dm-confirm-delete-btn" onClick={executeDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

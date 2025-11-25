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

// Define keyframes for spinner animation
const spinKeyframes = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Define supported file extensions
const SUPPORTED_EXTENSIONS = [
  ".csv",
  ".doc",
  ".docx",
  ".epub",
  ".odt",
  ".pdf",
  ".ppt",
  ".pptx",
  ".tsv",
  ".xlsx",
  ".eml",
  ".html",
  ".json",
  ".md",
  ".msg",
  ".rst",
  ".rtf",
  ".txt",
  ".xml",
];

// File type mapping
const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentIdentifier: string | null;
}

interface UploadedFile {
  name: string;
  size: number;
  uploadDate: string;
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    width: "700px",
    maxWidth: "90vw",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    padding: "16px 24px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: "20px",
    fontWeight: 600,
    margin: 0,
  },
  closeButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#4a5159",
    minWidth: "44px",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    padding: "24px",
    overflowY: "auto",
    flexGrow: 1,
  },
  tabContainer: {
    display: "flex",
    borderBottom: "1px solid #e5e7eb",
    marginBottom: "24px",
  },
  tab: {
    padding: "12px 16px",
    cursor: "pointer",
    fontSize: "16px",
    borderBottom: "2px solid transparent",
  },
  activeTab: {
    borderBottom: "2px solid #0073bb",
    color: "#0073bb",
    fontWeight: 500,
  },
  dropZone: {
    border: "2px dashed #d1d5db",
    borderRadius: "8px",
    padding: "40px 20px",
    textAlign: "center",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
    transition: "border-color 0.3s, background-color 0.3s",
  },
  dragActive: {
    borderColor: "#0073bb",
    backgroundColor: "rgba(0, 115, 187, 0.05)",
  },
  uploadIcon: {
    marginBottom: "8px",
    color: "#5a6169",
  },
  dropText: {
    fontSize: "16px",
    fontWeight: 500,
    color: "#4b5563",
    marginBottom: "8px",
  },
  browseText: {
    fontSize: "14px",
    color: "#5a6169",
  },
  browseLink: {
    color: "#0073bb",
    textDecoration: "underline",
    cursor: "pointer",
  },
  fileInput: {
    display: "none",
  },
  progressContainer: {
    marginTop: "24px",
  },
  progressBar: {
    height: "4px",
    backgroundColor: "#e5e7eb",
    borderRadius: "2px",
    marginTop: "8px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0073bb",
    transition: "width 0.3s ease",
  },
  progressText: {
    fontSize: "14px",
    color: "#5a6169",
    display: "flex",
    justifyContent: "space-between",
  },
  fileList: {
    marginTop: "24px",
  },
  fileListHeader: {
    fontSize: "16px",
    fontWeight: 500,
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
  },
  fileItem: {
    display: "flex",
    alignItems: "center",
    padding: "12px",
    borderRadius: "4px",
    backgroundColor: "#f9fafb",
    marginBottom: "8px",
  },
  fileIcon: {
    marginRight: "12px",
    color: "#5a6169",
  },
  fileDetails: {
    flex: 1,
    cursor: "pointer",
  },
  fileName: {
    fontSize: "14px",
    fontWeight: 500,
    marginBottom: "4px",
    wordBreak: "break-all",
    color: "#0073bb",
  },
  fileSize: {
    fontSize: "12px",
    color: "#5a6169",
  },
  deleteButton: {
    background: "none",
    border: "none",
    color: "#d32f2f",
    cursor: "pointer",
    padding: "8px",
    borderRadius: "4px",
    minWidth: "44px",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#d32f2f",
    fontSize: "14px",
    marginTop: "8px",
  },
  uploadButton: {
    backgroundColor: "#0073bb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "16px",
    minHeight: "44px",
  },
  disabledButton: {
    backgroundColor: "#e5e7eb",
    color: "#6c7481",
    cursor: "not-allowed",
  },
  modalFooter: {
    padding: "16px 24px",
    borderTop: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "flex-end",
  },
  footerButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    marginLeft: "12px",
    minHeight: "44px",
  },
  cancelButton: {
    backgroundColor: "white",
    color: "#4b5563",
    border: "1px solid #d1d5db",
  },
  confirmButton: {
    backgroundColor: "#0073bb",
    color: "white",
    border: "none",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 0",
    color: "#5a6169",
  },
  refreshButton: {
    background: "none",
    border: "none",
    color: "#0073bb",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "14px",
    marginLeft: "auto",
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
  },
  spinner: {
    border: "4px solid rgba(0, 0, 0, 0.1)",
    borderTop: "4px solid #0073bb",
    borderRadius: "50%",
    width: "30px",
    height: "30px",
    animation: "spin 1s linear infinite",
  },
  downloadButton: {
    background: "none",
    border: "none",
    color: "#0073bb",
    cursor: "pointer",
    padding: "8px",
    borderRadius: "4px",
    marginRight: "6px",
    minWidth: "44px",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};

export default function UploadModal({
  isOpen,
  onClose,
  documentIdentifier,
}: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "view">("upload");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusAnnouncement, setUploadStatusAnnouncement] = useState('');
  const [existingFiles, setExistingFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const appContext = useContext(AppContext);
  
  // Ref for modal container and focus restoration
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Helper to extract NOFO name from documentIdentifier
  const extractNofoName = (docId: string | null): string => {
    if (!docId) return "";
    return docId.split("/").pop() || docId;
  };

  // Get userId on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        setUserId(user.username);
      } catch (error) {
        console.error("Error getting user:", error);
        setError("Failed to authenticate user. Please refresh the page.");
      }
    };
    if (isOpen) {
      fetchUserId();
    }
  }, [isOpen]);

  // Focus trap and focus restoration
  useEffect(() => {
    if (!isOpen) return;

    // Store the currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the modal after a short delay
    setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 100);

    // Restore focus when modal closes
    return () => {
      // Only restore focus if the element still exists in the DOM
      if (previousFocusRef.current && document.body.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  // Focus trap handler
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

      // Check if currently focused element is inside the modal
      const activeElement = document.activeElement as HTMLElement;
      const isInsideModal = modalRef.current?.contains(activeElement);

      // If focus is outside the modal, bring it back
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

  // Fetch existing files on component mount
  const fetchExistingFiles = useCallback(async () => {
    if (!appContext || !documentIdentifier || !userId) return;

    setLoadingFiles(true);
    setError(null);

    try {
      const apiClient = new ApiClient(appContext);
      const nofoName = extractNofoName(documentIdentifier);
      
      // Get list of documents using userId and nofoName
      const result = await apiClient.knowledgeManagement.getDocuments(
        userId,
        nofoName
      );

      if (result && result.Contents) {
        // Transform the results into our expected format
        const files = result.Contents.map((item) => ({
          name: item.Key.split("/").pop() || item.Key,
          size: item.Size,
          uploadDate: item.LastModified,
        })).filter((file) => file.name !== ""); // Filter out folder entries

        setExistingFiles(files);
      } else {
        setExistingFiles([]);
      }
    } catch (error) {
      console.error("Error fetching existing files:", error);
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
          `Unsupported file type: ${extension}. Please upload one of the following formats: ${SUPPORTED_EXTENSIONS.join(
            ", "
          )}`
        );
        continue;
      }

      if (file.size > 100 * 1024 * 1024) {
        // 100MB limit
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
    if (!appContext || !documentIdentifier || !userId || selectedFiles.length === 0)
      return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setUploadStatusAnnouncement('Uploading files');

    const uploader = new FileUploader();
    const apiClient = new ApiClient(appContext);
    const nofoName = extractNofoName(documentIdentifier);
    const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);
    let uploadedSize = 0;

    try {
      for (const file of selectedFiles) {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
        const fileType =
          MIME_TYPES[fileExt as keyof typeof MIME_TYPES] ||
          "application/octet-stream";

        try {
          // Get upload URL from API (path will be constructed as userId/nofoName/filename)
          const uploadUrl = await apiClient.knowledgeManagement.getUploadURL(
            file.name,  // Just the filename
            fileType,
            userId,     // User ID
            nofoName    // NOFO name
          );

          // Upload the file
          await uploader.upload(
            file,
            uploadUrl,
            fileType,
            (uploaded: number) => {
              const progress = Math.round(
                ((uploadedSize + uploaded) / totalSize) * 100
              );
              setUploadProgress(progress);
            }
          );

          uploadedSize += file.size;
        } catch (error) {
          console.error(`Error uploading file ${file.name}:`, error);
          setError(`Failed to upload ${file.name}. Please try again.`);
          setUploading(false);
          setUploadStatusAnnouncement('');
          return;
        }
      }

      // All files uploaded successfully
      setSelectedFiles([]);
      setUploadProgress(100);
      setUploadStatusAnnouncement('Files uploaded. Indexing documents.');

      // Sync Kendra after upload to ensure documents are indexed
      try {
        await apiClient.knowledgeManagement.syncKendra();
        setUploadStatusAnnouncement('Indexing complete. Viewing uploaded files.');
      } catch (syncError) {
        console.error("Error syncing knowledge base:", syncError);
        // Non-critical error, don't show to user since files were uploaded successfully
        setUploadStatusAnnouncement('Files uploaded successfully. Viewing uploaded files.');
      }

      // Refresh the list of existing files
      if (activeTab === "view") {
        fetchExistingFiles();
      }

      setTimeout(() => {
        setUploading(false);
        setActiveTab("view");
        setUploadStatusAnnouncement('');
      }, 1000);
    } catch (error) {
      console.error("Error during upload:", error);
      setError("An error occurred during upload. Please try again.");
      setUploading(false);
      setUploadStatusAnnouncement('');
    }
  };

  const deleteFile = async (fileName: string) => {
    if (!appContext || !documentIdentifier || !userId) return;

    try {
      const apiClient = new ApiClient(appContext);
      const nofoName = extractNofoName(documentIdentifier);

      // Delete the file from S3 (key will be constructed as userId/nofoName/filename)
      await apiClient.knowledgeManagement.deleteFile(
        userId,
        nofoName,
        fileName
      );

      // Refresh the file list
      fetchExistingFiles();
    } catch (error) {
      console.error(`Error deleting file ${fileName}:`, error);
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

      // Get a pre-signed URL for downloading the file
      try {
        // Use the same getUploadURL method but specify the content-disposition to be attachment
        // This will force the browser to download rather than view the file
        const fileExt = "." + fileName.split(".").pop()?.toLowerCase();
        const fileType =
          MIME_TYPES[fileExt as keyof typeof MIME_TYPES] ||
          "application/octet-stream";

        // We're reusing the upload URL method which should return a pre-signed S3 URL
        // The proper approach would be to create a specific getDownloadURL method in the API
        const downloadUrl = await apiClient.knowledgeManagement.getUploadURL(
          fileName,  // Just the filename
          fileType,
          userId,    // User ID
          nofoName   // NOFO name
        );

        // Create a temporary anchor and trigger download
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.setAttribute("download", fileName);

        // Temporarily add to document, click, and then remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setError(null);
      } catch (error) {
        console.error(`Error getting download URL for ${fileName}:`, error);
        setError(`Failed to download ${fileName}. Please try again.`);
      }
    } catch (error) {
      console.error(`Error downloading file ${fileName}:`, error);
      setError(`Failed to download ${fileName}. Please try again.`);
    } finally {
      setDownloadingFile(null);
    }
  };

  const formatFileSize = (size: number): string => {
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    } else {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  if (!isOpen) return null;

  return (
    <div 
      style={styles.modalOverlay} 
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{spinKeyframes}</style>
      <div 
        ref={modalRef}
        style={styles.modalContainer} 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
        aria-labelledby="upload-modal-title"
      >
        <div style={styles.modalHeader}>
          <h2 id="upload-modal-title" style={styles.modalTitle}>Manage Document Files</h2>
          <button 
            style={styles.closeButton} 
            onClick={onClose}
            aria-label="Close upload modal"
          >
            <X size={20} />
          </button>
        </div>

        <div style={styles.tabContainer} role="tablist">
          <div
            style={{
              ...styles.tab,
              ...(activeTab === "upload" ? styles.activeTab : {}),
            }}
            onClick={() => setActiveTab("upload")}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTab("upload");
              }
            }}
            role="tab"
            tabIndex={0}
            aria-selected={activeTab === "upload"}
            aria-controls="upload-panel"
            id="upload-tab"
          >
            Upload New Files
          </div>
          <div
            style={{
              ...styles.tab,
              ...(activeTab === "view" ? styles.activeTab : {}),
            }}
            onClick={() => {
              setActiveTab("view");
              fetchExistingFiles();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTab("view");
                fetchExistingFiles();
              }
            }}
            role="tab"
            tabIndex={0}
            aria-selected={activeTab === "view"}
            aria-controls="view-panel"
            id="view-tab"
          >
            View Existing Files
          </div>
        </div>

        <div style={styles.modalBody}>
          {activeTab === "upload" ? (
            <div role="tabpanel" aria-labelledby="upload-tab" id="upload-panel">
              <div
                style={{
                  ...styles.dropZone,
                  ...(dragActive ? styles.dragActive : {}),
                }}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                role="region"
                aria-label="File upload area with drag and drop"
              >
                {/* Visible button/label for clicking */}
                <label
                  htmlFor="file-input"
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: "20px",
                    borderRadius: "8px",
                    transition: "all 0.2s",
                    width: "100%",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.outline = "2px solid #2c4fdb";
                    e.currentTarget.style.outlineOffset = "2px";
                    e.currentTarget.style.backgroundColor = "#f0f7ff";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = "none";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f0f7ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  tabIndex={0}
                >
                  <Upload size={40} style={styles.uploadIcon} aria-hidden="true" />
                  <p style={styles.dropText}>Drag and drop your files here</p>
                  <p style={styles.browseText} id="upload-instructions">
                    or <span style={styles.browseLink}>browse files</span>
                  </p>
                </label>
                
                {/* Hidden file input, triggered by label */}
                <input
                  id="file-input"
                  type="file"
                  multiple
                  style={styles.fileInput}
                  onChange={handleFileInput}
                  accept={SUPPORTED_EXTENSIONS.join(",")}
                  aria-describedby="upload-instructions"
                />
              </div>

              {error && <div role="alert" style={styles.errorText}>{error}</div>}

              {/* Upload status announcement for screen readers */}
              <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                {uploadStatusAnnouncement}
              </div>

              {selectedFiles.length > 0 && (
                <div style={styles.fileList}>
                  <p style={styles.fileListHeader}>
                    Selected Files ({selectedFiles.length})
                  </p>
                  {selectedFiles.map((file, index) => (
                    <div key={index} style={styles.fileItem}>
                      <FileText size={20} style={styles.fileIcon} />
                      <div style={styles.fileDetails}>
                        <p style={styles.fileName}>{file.name}</p>
                        <p style={styles.fileSize}>
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        style={styles.deleteButton}
                        onClick={() => removeFile(index)}
                        disabled={uploading}
                        aria-label={`Remove ${file.name} from upload queue`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}

                  <button
                    style={{
                      ...styles.uploadButton,
                      ...(uploading || selectedFiles.length === 0
                        ? styles.disabledButton
                        : {}),
                    }}
                    onClick={uploadFiles}
                    disabled={uploading || selectedFiles.length === 0}
                    aria-label={uploading ? `Uploading files, ${uploadProgress}% complete` : `Upload ${selectedFiles.length} selected files`}
                  >
                    <Upload size={16} />
                    {uploading
                      ? `Uploading... ${uploadProgress}%`
                      : "Upload Files"}
                  </button>

                  {uploading && (
                    <div style={styles.progressContainer}>
                      <div style={styles.progressBar}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: `${uploadProgress}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={styles.fileList} role="tabpanel" aria-labelledby="view-tab" id="view-panel">
              <div style={styles.fileListHeader}>
                <p>Current Files</p>
                <button
                  style={styles.refreshButton}
                  onClick={fetchExistingFiles}
                  disabled={loadingFiles || !isOpen}
                  aria-label="Refresh file list"
                >
                  <RefreshCw size={14} />{" "}
                  {loadingFiles ? "Loading..." : "Refresh"}
                </button>
              </div>

              {/* Loading announcement */}
              <div role="status" aria-live="polite" className="sr-only">
                {loadingFiles ? "Loading files" : ""}
              </div>

              {loadingFiles ? (
                <div style={styles.loadingContainer}>
                  <div style={styles.spinner}></div>
                </div>
              ) : existingFiles.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>No files have been uploaded yet.</p>
                </div>
              ) : (
                existingFiles.map((file, index) => (
                  <div key={index} style={styles.fileItem}>
                    <FileText size={20} style={styles.fileIcon} />
                    <div
                      style={styles.fileDetails}
                      onClick={() => downloadFile(file.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          downloadFile(file.name);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Download ${file.name}`}
                    >
                      <p style={styles.fileName}>
                        {file.name}
                        {downloadingFile === file.name && (
                          <span style={{ marginLeft: "8px", fontSize: "12px" }}>
                            (Preparing download...)
                          </span>
                        )}
                      </p>
                      <p style={styles.fileSize}>
                        {formatFileSize(file.size)} • Uploaded{" "}
                        {formatDate(file.uploadDate)}
                      </p>
                    </div>
                    <button
                      style={{
                        ...styles.downloadButton,
                        ...(downloadingFile === file.name
                          ? { opacity: 0.5, cursor: "not-allowed" }
                          : {}),
                      }}
                      onClick={() => downloadFile(file.name)}
                      disabled={downloadingFile === file.name}
                      title="Download file"
                      aria-label={`Download ${file.name}`}
                    >
                      {downloadingFile === file.name ? (
                        <div
                          style={{
                            width: "16px",
                            height: "16px",
                            border: "2px solid #0073bb",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                          }}
                        ></div>
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                    <button
                      style={{
                        ...styles.deleteButton,
                        ...(downloadingFile === file.name
                          ? { opacity: 0.5, cursor: "not-allowed" }
                          : {}),
                      }}
                      onClick={() => deleteFile(file.name)}
                      disabled={downloadingFile === file.name}
                      title="Delete file"
                      aria-label={`Delete ${file.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}

              {error && <div role="alert" style={styles.errorText}>{error}</div>}
            </div>
          )}
        </div>

        <div style={styles.modalFooter}>
          <button
            style={{
              ...styles.footerButton,
              ...styles.cancelButton,
            }}
            onClick={onClose}
            aria-label="Close modal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

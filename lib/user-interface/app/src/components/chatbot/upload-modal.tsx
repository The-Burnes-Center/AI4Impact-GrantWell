import React, { useState, useContext, useEffect, useCallback } from "react";
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
    color: "#5a6169",
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
  },
  disabledButton: {
    backgroundColor: "#e5e7eb",
    color: "#9ca3af",
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
  const [existingFiles, setExistingFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const appContext = useContext(AppContext);

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
          return;
        }
      }

      // All files uploaded successfully
      setSelectedFiles([]);
      setUploadProgress(100);

      // Sync Kendra after upload to ensure documents are indexed
      try {
        await apiClient.knowledgeManagement.syncKendra();
      } catch (syncError) {
        console.error("Error syncing knowledge base:", syncError);
        // Non-critical error, don't show to user since files were uploaded successfully
      }

      // Refresh the list of existing files
      if (activeTab === "view") {
        fetchExistingFiles();
      }

      setTimeout(() => {
        setUploading(false);
        setActiveTab("view");
      }, 1000);
    } catch (error) {
      console.error("Error during upload:", error);
      setError("An error occurred during upload. Please try again.");
      setUploading(false);
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
        style={styles.modalContainer} 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Manage Document Files</h2>
          <button style={styles.closeButton} onClick={onClose}>
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
          >
            View Existing Files
          </div>
        </div>

        <div style={styles.modalBody}>
          {activeTab === "upload" ? (
            <>
              <div
                style={{
                  ...styles.dropZone,
                  ...(dragActive ? styles.dragActive : {}),
                }}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    document.getElementById("file-input")?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Upload files by clicking or dragging and dropping"
              >
                <Upload size={40} style={styles.uploadIcon} />
                <p style={styles.dropText}>Drag and drop your files here</p>
                <p style={styles.browseText}>
                  or <span style={styles.browseLink}>browse files</span>
                </p>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  style={styles.fileInput}
                  onChange={handleFileInput}
                  accept={SUPPORTED_EXTENSIONS.join(",")}
                />
              </div>

              {error && <p style={styles.errorText}>{error}</p>}

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
            </>
          ) : (
            <div style={styles.fileList}>
              <div style={styles.fileListHeader}>
                <p>Current Files</p>
                <button
                  style={styles.refreshButton}
                  onClick={fetchExistingFiles}
                  disabled={loadingFiles || !isOpen}
                >
                  <RefreshCw size={14} />{" "}
                  {loadingFiles ? "Loading..." : "Refresh"}
                </button>
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
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}

              {error && <p style={styles.errorText}>{error}</p>}
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
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

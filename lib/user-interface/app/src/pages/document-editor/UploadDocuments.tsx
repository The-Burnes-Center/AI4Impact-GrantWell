import React, { useState, useRef, useContext, useEffect } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { FileUploader } from "../../common/file-uploader";

// File type mapping
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

interface UploadDocumentsProps {
  onContinue: () => void;
  selectedNofo: string | null;
  onNavigate: (step: string) => void;
  sessionId: string;
}

interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

const UploadDocuments: React.FC<UploadDocumentsProps> = ({
  onContinue,
  selectedNofo,
  onNavigate,
  sessionId,
}) => {
  const appContext = useContext(AppContext);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setUploadError("Failed to authenticate user. Please refresh the page.");
      }
    };
    fetchUserId();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFiles: File[] = Array.from(selectedFiles);
      setFiles((prevFiles) => [...prevFiles, ...newFiles]);
      setUploadError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const newFiles: File[] = Array.from(droppedFiles);
      setFiles((prevFiles) => [...prevFiles, ...newFiles]);
      setUploadError(null);
    }
  };

  const openFileSelector = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const uploadFiles = async () => {
    if (!appContext || !selectedNofo || !userId || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    const uploader = new FileUploader();
    const apiClient = new ApiClient(appContext);
    const nofoName = extractNofoName(selectedNofo);
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    let uploadedSize = 0;

    try {
      for (const file of files) {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
        const fileType =
          MIME_TYPES[fileExt] || "application/octet-stream";

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
          setUploadError(`Failed to upload ${file.name}. Please try again.`);
          setUploading(false);
          return;
        }
      }

      // All files uploaded successfully
      setUploadProgress(100);

      // Sync KB after upload to ensure documents are indexed
      try {
        await apiClient.knowledgeManagement.syncKendra();
      } catch (syncError) {
        console.error("Error syncing knowledge base:", syncError);
        // Non-critical error, don't show to user since files were uploaded successfully
      }

      // Clear files after successful upload
      setTimeout(() => {
        setFiles([]);
        setUploading(false);
        setUploadProgress(0);
      }, 1000);
    } catch (error) {
      console.error("Error during upload:", error);
      setUploadError("An error occurred during upload. Please try again.");
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) {
      return bytes + " bytes";
    } else if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + " KB";
    } else {
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
  };

  const getFileIcon = (fileType: string): string => {
    if (fileType.includes("pdf")) {
      return "📄";
    } else if (fileType.includes("image")) {
      return "🖼️";
    } else if (fileType.includes("word") || fileType.includes("document")) {
      return "📝";
    } else if (fileType.includes("excel") || fileType.includes("spreadsheet")) {
      return "📊";
    } else {
      return "📎";
    }
  };

  const handleAdditionalInfoChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setAdditionalInfo(e.target.value);
  };

  const handleSubmit = async () => {
    if (!appContext || !selectedNofo) return;
    
    try {
      setIsLoading(true);
      
      // Upload files first if any are selected
      if (files.length > 0 && userId) {
        await uploadFiles();
        // Wait a moment for upload to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const apiClient = new ApiClient(appContext);
      const username = userId || (await Auth.currentAuthenticatedUser()).username;

      console.log('Fetching current draft from DB:', { sessionId, username });
      // Get project basics and questionnaire from the database
      const currentDraft = await apiClient.drafts.getDraft({
        sessionId: sessionId,
        userId: username
      });
      console.log('Fetched current draft:', currentDraft);

      if (!currentDraft) {
        throw new Error('No draft found');
      }

      console.log('Generating draft sections...');
      // Generate draft sections using data from the database
      const result = await apiClient.drafts.generateDraft({
        query: "Generate all sections for the grant application",
        documentIdentifier: selectedNofo,
        projectBasics: currentDraft.projectBasics || {},
        questionnaire: currentDraft.questionnaire || {},
        sessionId: sessionId
      });
      console.log('Generated draft sections:', result);

      if (!result) {
        throw new Error('Failed to generate sections');
      }

      console.log('Updating draft in DB with new sections, additionalInfo, and uploadedFiles...');
      // Update the draft with generated sections
      // Include uploaded file info in the draft
      const uploadedFileInfo = files.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified
      }));
      await apiClient.drafts.updateDraft({
        ...currentDraft,
        sections: {
          ...currentDraft.sections,  // Preserve existing sections
          ...result  // Add new sections
        },
        additionalInfo: additionalInfo,
        uploadedFiles: uploadedFileInfo
      });
      console.log('Draft updated successfully. Navigating to next step.');

      // Continue to the next step
      onContinue();
    } catch (error) {
      console.error('Error creating draft:', error);
      alert('Failed to create draft. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 0" }}>
      <h2 style={{ marginBottom: "16px" }}>Supporting Documents</h2>
      <p style={{ color: "#3d4451", marginBottom: "24px" }}>
        Upload supporting documents that will help generate your grant application. These documents will be available to the chatbot for context when creating your draft.
      </p>

      <div
        style={{
          background: "white",
          borderRadius: "8px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          marginBottom: "24px",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={openFileSelector}
            style={{
              border: `2px dashed ${isDragging ? "#2c4fdb" : "#e2e8f0"}`,
              borderRadius: "8px",
              padding: "24px",
              textAlign: "center",
              background: isDragging ? "#f0f4ff" : "#f7fafc",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{
                width: "40px",
                height: "40px",
                stroke: isDragging ? "#2c4fdb" : "#3d4451",
                fill: "none",
                strokeWidth: 2,
                strokeLinecap: "round",
                strokeLinejoin: "round",
                margin: "0 auto 12px",
                display: "block",
              }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p style={{ marginBottom: "16px", color: isDragging ? "#2c4fdb" : "#3d4451" }}>
              {isDragging
                ? "Drop files here"
                : "Drag and drop files here, or click to select"}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openFileSelector();
              }}
              style={{
                background: "#2c4fdb",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Select Files
            </button>
          </div>
          {uploadError && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                background: "#fee",
                border: "1px solid #fcc",
                borderRadius: "4px",
                color: "#c33",
              }}
            >
              {uploadError}
            </div>
          )}
          {uploading && (
            <div style={{ marginTop: "12px" }}>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  background: "#e2e8f0",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${uploadProgress}%`,
                    height: "100%",
                    background: "#2c4fdb",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <p style={{ marginTop: "8px", fontSize: "14px", color: "#3d4451" }}>
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "12px", fontSize: "16px" }}>
            Recommended Documents
          </h3>
          <ul style={{ color: "#3d4451", paddingLeft: "20px" }}>
            <li>Letters of Support</li>
            <li>Financial Statements</li>
            <li>Maps or Geographic Data</li>
            <li>Research Studies</li>
            <li>Organizational Chart</li>
            <li>Photos or Illustrations</li>
          </ul>
        </div>

        {/* File list section */}
        {files.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ marginBottom: "12px", fontSize: "16px" }}>Selected Files</h3>
            <div>
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    backgroundColor: "#f7fafc",
                    borderRadius: "4px",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ marginRight: "8px", fontSize: "20px" }}>
                    {getFileIcon(file.type)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{file.name}</div>
                    <div style={{ fontSize: "12px", color: "#5a6575" }}>
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFiles(files.filter((_, i) => i !== index));
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#a0aec0",
                      cursor: "pointer",
                      fontSize: "18px",
                    }}
                    title="Remove file"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 style={{ marginBottom: "12px", fontSize: "16px" }}>
            Additional Information
          </h3>
          <p
            style={{ color: "#3d4451", marginBottom: "12px", fontSize: "14px" }}
          >
            Is there anything else you'd like to share about these documents or
            your application?
          </p>
          <textarea
            value={additionalInfo}
            onChange={handleAdditionalInfoChange}
            placeholder="Enter any additional context or notes about your uploaded documents..."
            style={{
              width: "100%",
              minHeight: "120px",
              padding: "12px",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "16px",
              resize: "vertical",
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => onNavigate("questionnaire")}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 20px",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            color: "#3d4451",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: "8px" }}
          >
            <path d="M19 12H5"></path>
            <path d="m12 19-7-7 7-7"></path>
          </svg>
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 24px",
            background: isLoading ? "#a0aec0" : "#2c4fdb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "16px",
            fontWeight: 500,
            cursor: isLoading ? "not-allowed" : "pointer",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
          }}
        >
          {isLoading ? "Creating Draft..." : "Create Draft"}
          {!isLoading && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginLeft: "8px" }}
            >
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default UploadDocuments;

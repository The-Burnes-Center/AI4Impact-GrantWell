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
  documentData?: any; // Add documentData to check if draft exists
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
  documentData,
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
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftProgress, setDraftProgress] = useState<string>("");
  const [hasExistingDraft, setHasExistingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to extract NOFO name from documentIdentifier
  const extractNofoName = (docId: string | null): string => {
    if (!docId) return "";
    return docId.split("/").pop() || docId;
  };

  // Get userId on mount and check if draft already exists
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        setUserId(user.username);
        
        // Check if draft already exists with sections
        if (appContext && sessionId && user.username) {
          try {
            const apiClient = new ApiClient(appContext);
            const draft = await apiClient.drafts.getDraft({
              sessionId: sessionId,
              userId: user.username
            });
            
            // Check if draft has sections (meaning it was already generated)
            if (draft && draft.sections && Object.keys(draft.sections).length > 0) {
              setHasExistingDraft(true);
            }
          } catch (error) {
            // Draft might not exist yet, that's okay
            console.log('No existing draft found');
          }
        }
      } catch (error) {
        console.error("Error getting user:", error);
        setUploadError("Failed to authenticate user. Please refresh the page.");
      }
    };
    fetchUserId();
  }, [appContext, sessionId]);
  
  // Also check documentData prop for existing sections
  useEffect(() => {
    if (documentData?.sections && Object.keys(documentData.sections).length > 0) {
      setHasExistingDraft(true);
    }
  }, [documentData]);

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
      // getDraft() will wait if draft generation is in progress
      const draftToUse = await apiClient.drafts.getDraft({
        sessionId: sessionId,
        userId: username
      });
      console.log('Fetched current draft:', draftToUse);

      if (!draftToUse) {
        throw new Error('Draft not found. Please start a new document first.');
      }

      console.log('Generating draft sections...');
      setGeneratingDraft(true);
      setDraftProgress('Starting draft generation...');
      
      // Generate draft sections using data from the database
      // This uses async polling internally
      const result = await apiClient.drafts.generateDraft({
        query: "Generate all sections for the grant application",
        documentIdentifier: selectedNofo,
        projectBasics: draftToUse.projectBasics || {},
        questionnaire: draftToUse.questionnaire || {},
        sessionId: sessionId,
        onProgress: (status: string) => {
          setDraftProgress(`Generating draft sections... (${status})`);
        }
      });
      console.log('Generated draft sections:', result);

      if (!result || Object.keys(result).length === 0) {
        throw new Error('Failed to generate sections');
      }
      
      setDraftProgress('Draft generation completed!');

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
        ...draftToUse,
        sections: {
          ...draftToUse.sections,  // Preserve existing sections
          ...result  // Add new sections
        },
        status: 'editing_sections', // Draft generation complete, now editing sections
        additionalInfo: additionalInfo,
        uploadedFiles: uploadedFileInfo
      });
      console.log('Draft updated successfully. Navigating to next step.');

      // Skip the "draft created" step and go directly to section editor
      onNavigate("sectionEditor");
    } catch (error) {
      console.error('Error creating draft:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to create draft. Please try again.');
      alert(error instanceof Error ? error.message : 'Failed to create draft. Please try again.');
    } finally {
      setIsLoading(false);
      setGeneratingDraft(false);
      setDraftProgress("");
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 0" }}>
      <h2 style={{ marginBottom: "16px" }}>Additional Information</h2>
      <p style={{ color: "#3d4451", marginBottom: "24px" }}>
        Share any additional context or information that will help generate your grant application.
      </p>

      {/* Additional Information section */}
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          marginBottom: "24px",
        }}
      >
        <div>
          <h3 style={{ marginBottom: "12px", fontSize: "16px", fontWeight: 500 }}>
            Additional Information
          </h3>
          <p
            style={{ color: "#3d4451", marginBottom: "12px", fontSize: "14px" }}
          >
            Is there anything else you'd like to share about your application?
          </p>
          <textarea
            value={additionalInfo}
            onChange={handleAdditionalInfoChange}
            placeholder="Enter any additional context or notes about your application..."
            style={{
              width: "100%",
              minHeight: "150px",
              padding: "12px",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "16px",
              resize: "vertical",
              fontFamily: "inherit",
            }}
            aria-label="Additional information about your application"
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <button
          onClick={() => onNavigate("questionnaire")}
          aria-label="Go back to questionnaire"
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
            aria-hidden="true"
          >
            <path d="M19 12H5"></path>
            <path d="m12 19-7-7 7-7"></path>
          </svg>
          Back
        </button>
        <div style={{ display: "flex", gap: "12px" }}>
          {hasExistingDraft && (
            <button
              onClick={() => onNavigate("sectionEditor")}
              aria-label="Continue to section editor"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 24px",
                background: "white",
                border: "2px solid #14558F",
                borderRadius: "6px",
                color: "#14558F",
                fontSize: "16px",
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              }}
            >
              Next
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
                aria-hidden="true"
              >
                <path d="M5 12h14"></path>
                <path d="m12 5 7 7-7 7"></path>
              </svg>
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isLoading || generatingDraft}
            aria-label={generatingDraft ? "Generating draft, please wait" : isLoading ? "Processing, please wait" : hasExistingDraft ? "Generate draft again" : "Create draft"}
            aria-busy={isLoading || generatingDraft}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 24px",
              background: (isLoading || generatingDraft) ? "#a0aec0" : "#14558F",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: 500,
              cursor: (isLoading || generatingDraft) ? "not-allowed" : "pointer",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
            }}
          >
            {generatingDraft ? "Generating Draft..." : isLoading ? "Processing..." : hasExistingDraft ? "Generate Again" : "Create Draft"}
            {!isLoading && !generatingDraft && (
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
                aria-hidden="true"
              >
                <path d="M5 12h14"></path>
                <path d="m12 5 7 7-7 7"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
      {generatingDraft && draftProgress && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Draft generation progress"
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            background: "#e0f2fe",
            border: "1px solid #0284c7",
            borderRadius: "6px",
            color: "#0369a1",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            role="img"
            aria-label="Loading"
            style={{
              width: "16px",
              height: "16px",
              border: "2px solid #0284c7",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              flexShrink: 0,
            }}
          />
          <span>{draftProgress}</span>
        </div>
      )}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default UploadDocuments;

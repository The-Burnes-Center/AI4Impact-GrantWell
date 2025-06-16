import React, { useState, useRef, useContext } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";

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
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFiles: FileInfo[] = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        newFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        });
      }
      setFiles((prevFiles) => [...prevFiles, ...newFiles]);
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
      const newFiles: FileInfo[] = [];
      for (let i = 0; i < droppedFiles.length; i++) {
        const file = droppedFiles[i];
        newFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        });
      }
      setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    }
  };

  const openFileSelector = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
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
      const apiClient = new ApiClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

      // Get project basics and questionnaire from the database
      const currentDraft = await apiClient.drafts.getDraft({
        sessionId: sessionId,
        userId: username
      });

      if (!currentDraft) {
        throw new Error('No draft found');
      }

      // Generate draft sections using data from the database
      const result = await apiClient.drafts.generateDraft({
        query: "Generate all sections for the grant application",
        documentIdentifier: selectedNofo,
        projectBasics: currentDraft.projectBasics || {},
        questionnaire: currentDraft.questionnaire || {},
        sessionId: sessionId
      });

      if (!result) {
        throw new Error('Failed to generate sections');
      }

      // Update the draft with generated sections
      await apiClient.drafts.updateDraft({
        ...currentDraft,
        sections: result,
        additionalInfo: additionalInfo,
        uploadedFiles: files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type,
          lastModified: f.lastModified
        }))
      });

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
      <h2 style={{ marginBottom: "16px" }}>Upload Supporting Documents</h2>
      <p style={{ color: "#4a5568", marginBottom: "24px" }}>
        Upload any relevant documents or supporting materials for your grant
        application. These documents will help strengthen your application and
        provide additional context.
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
          <div
            style={{
              border: `2px dashed ${isDragging ? "#4361ee" : "#d4daff"}`,
              borderRadius: "8px",
              padding: "24px",
              textAlign: "center",
              background: isDragging ? "#ebf0ff" : "#f7fafc",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onClick={openFileSelector}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <svg
              viewBox="0 0 24 24"
              style={{
                width: "40px",
                height: "40px",
                stroke: "#4361ee",
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
            <p style={{ marginBottom: "16px", color: "#4a5568" }}>
              Drag and drop files here or click to browse
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openFileSelector();
              }}
              style={{
                background: "#4361ee",
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
            <input
              type="file"
              multiple
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
          </div>
          <p style={{ fontSize: "12px", color: "#718096", marginTop: "8px" }}>
            Supported formats: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG
          </p>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "12px", fontSize: "16px" }}>
            Recommended Documents
          </h3>
          <ul style={{ color: "#4a5568", paddingLeft: "20px" }}>
            <li>Letters of Support</li>
            <li>Financial Statements</li>
            <li>Maps or Geographic Data</li>
            <li>Research Studies</li>
            <li>Organizational Chart</li>
            <li>Photos or Illustrations</li>
          </ul>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "12px", fontSize: "16px" }}>Files</h3>
          {files.length === 0 ? (
            <p style={{ color: "#718096", fontStyle: "italic" }}>
              No files uploaded yet
            </p>
          ) : (
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
                    <div style={{ fontSize: "12px", color: "#718096" }}>
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
          )}
        </div>

        <div>
          <h3 style={{ marginBottom: "12px", fontSize: "16px" }}>
            Additional Information
          </h3>
          <p
            style={{ color: "#4a5568", marginBottom: "12px", fontSize: "14px" }}
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
            color: "#4a5568",
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
            background: isLoading ? "#a0aec0" : "#4361ee",
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

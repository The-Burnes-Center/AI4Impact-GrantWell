import React, { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { Auth } from "aws-amplify";
import { FileUploader } from "../../common/file-uploader";
import Card from "../../components/ui/Card";
import NavigationButtons from "../../components/ui/NavigationButtons";
import { colors, typography, spacing, borderRadius, transitions } from "../../components/ui/styles";
import type { DocumentData } from "../../common/types/document";

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

const SUPPORTED_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html,.json,.xml,.md,.rtf,.epub,.odt,.tsv,.eml,.msg";

interface UploadDocumentsProps {
  onContinue: () => void;
  selectedNofo: string | null;
  onNavigate: (step: string) => void;
  onNavigateToEditor?: (jobId: string) => void;
  sessionId: string;
  documentData?: DocumentData | null;
}

const UploadDocuments: React.FC<UploadDocumentsProps> = ({
  onContinue,
  selectedNofo,
  onNavigate,
  onNavigateToEditor,
  sessionId,
  documentData,
}) => {
  const apiClient = useApiClient();
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
  const [draftProgressPercent, setDraftProgressPercent] = useState(0);
  const [hasExistingDraft, setHasExistingDraft] = useState(false);
  const [kbIndexing, setKbIndexing] = useState(false);
  const [sectionNames, setSectionNames] = useState<string[]>([]);
  const [completedSections, setCompletedSections] = useState<string[]>([]);
  const [completedSectionCount, setCompletedSectionCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const extractNofoName = (docId: string | null): string => {
    if (!docId) return "";
    return docId.split("/").pop() || docId;
  };

  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        setUserId(user.username);

        if (sessionId && user.username) {
          try {
            const draft = await apiClient.drafts.getDraft({
              sessionId,
              userId: user.username,
            });
            if (draft?.sections && Object.keys(draft.sections).length > 0) {
              setHasExistingDraft(true);
            }
          } catch {
            console.log("No existing draft found");
          }
        }
      } catch (error) {
        console.error("Error getting user:", error);
        setUploadError("Failed to authenticate user. Please refresh the page.");
      }
    };
    fetchUserId();
  }, [apiClient, sessionId]);

  useEffect(() => {
    if (documentData?.sections && Object.keys(documentData.sections).length > 0) {
      setHasExistingDraft(true);
    }
  }, [documentData]);

  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
    };
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(event.target.files!)]);
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
      setUploadError(null);
    }
  };

  const openFileSelector = () => fileInputRef.current?.click();

  const uploadFiles = useCallback(async () => {
    if (!selectedNofo || !userId || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    const uploader = new FileUploader();
    const nofoName = extractNofoName(selectedNofo);
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    let uploadedSize = 0;

    try {
      for (const file of files) {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
        const fileType = MIME_TYPES[fileExt] || "application/octet-stream";

        try {
          const uploadUrl = await apiClient.userDocuments.getUploadURL(
            file.name, fileType, userId, nofoName
          );
          await uploader.upload(file, uploadUrl, fileType, (uploaded: number) => {
            setUploadProgress(Math.round(((uploadedSize + uploaded) / totalSize) * 100));
          });
          uploadedSize += file.size;
        } catch (error) {
          console.error(`Error uploading file ${file.name}:`, error);
          setUploadError(`Failed to upload ${file.name}. Please try again.`);
          setUploading(false);
          return;
        }
      }

      setUploadProgress(100);
      setKbIndexing(true);

      if (syncPollRef.current) clearInterval(syncPollRef.current);
      syncPollRef.current = setInterval(async () => {
        try {
          const status = await apiClient.kbSync.isSyncing();
          if (typeof status === "string" && status.includes("DONE")) {
            setKbIndexing(false);
            if (syncPollRef.current) clearInterval(syncPollRef.current);
            syncPollRef.current = null;
          }
        } catch {
          // Keep polling on transient errors
        }
      }, 5000);

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
  }, [selectedNofo, userId, files, apiClient]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " bytes";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (fileType: string): string => {
    if (fileType.includes("pdf")) return "\u{1F4C4}";
    if (fileType.includes("image")) return "\u{1F5BC}\uFE0F";
    if (fileType.includes("word") || fileType.includes("document")) return "\u{1F4DD}";
    if (fileType.includes("excel") || fileType.includes("spreadsheet")) return "\u{1F4CA}";
    return "\u{1F4CE}";
  };

  const [generationPhase, setGenerationPhase] = useState<string>("preparing");
  const [totalSections, setTotalSections] = useState(0);

  const handleSubmit = async () => {
    if (!selectedNofo) return;

    try {
      setIsLoading(true);

      if (files.length > 0 && userId) {
        await uploadFiles();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const username = userId || (await Auth.currentAuthenticatedUser()).username;
      const draftToUse = await apiClient.drafts.getDraft({ sessionId, userId: username });

      if (!draftToUse) {
        throw new Error("Draft not found. Please start a new document first.");
      }

      // Save additional info before starting generation
      const uploadedFileInfo = files.map((f) => ({
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
      }));
      await apiClient.drafts.updateDraft({
        ...draftToUse,
        status: "generating_draft",
        additionalInfo,
        uploadedFiles: uploadedFileInfo,
      });

      setGeneratingDraft(true);
      setGenerationPhase("preparing");
      setDraftProgress("Analyzing your NOFO and preparing sections...");
      setDraftProgressPercent(0);
      setSectionNames([]);
      setCompletedSections([]);
      setCompletedSectionCount(0);
      setTotalSections(0);
      setIsLoading(false);

      // Start the generation job — returns jobId immediately
      const jobId = await apiClient.drafts.startDraftGeneration({
        query: "Generate all sections for the grant application",
        documentIdentifier: selectedNofo,
        projectBasics: draftToUse.projectBasics || {},
        questionnaire: draftToUse.questionnaire || {},
        sessionId,
      });
      console.log('Draft generation job started:', jobId);
      setGenerationPhase("planning");
      setDraftProgress("Retrieving NOFO requirements and planning sections...");

      // Poll until at least one section has content, then navigate
      let pollCount = 0;
      const maxPolls = 90; // Up to ~3 minutes
      let navigated = false;

      while (pollCount < maxPolls && !navigated) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        pollCount++;

        try {
          const jobStatus = await apiClient.drafts.pollDraftJob(jobId);

          // Update section names and phase
          if (jobStatus.sectionNames && jobStatus.sectionNames.length > 0) {
            setSectionNames(jobStatus.sectionNames);
            setTotalSections(jobStatus.totalSections || jobStatus.sectionNames.length);

            if (generationPhase === "planning" || generationPhase === "preparing") {
              setGenerationPhase("generating");
            }
          }

          // Update real progress from Step Functions
          if (typeof jobStatus.completedSectionCount === 'number') {
            const total = jobStatus.totalSections || jobStatus.sectionNames?.length || 1;
            setCompletedSectionCount(jobStatus.completedSectionCount);
            setTotalSections(total);
            setDraftProgressPercent(Math.round((jobStatus.completedSectionCount / total) * 100));
          }

          if (jobStatus.sections) {
            const completed = Object.keys(jobStatus.sections).filter(k => jobStatus.sections![k]);
            setCompletedSections(completed);
          }

          // Navigate only when at least 1 section has actual content
          if (jobStatus.completedSectionCount && jobStatus.completedSectionCount > 0) {
            navigated = true;
          }

          // Also navigate if job already completed/errored
          if (jobStatus.status === 'completed' || jobStatus.status === 'partial' || jobStatus.status === 'error') {
            navigated = true;
          }
        } catch (err) {
          console.warn('Error polling job status:', err);
        }
      }

      // Navigate to SectionEditor — it takes over live polling
      setGeneratingDraft(false);
      if (onNavigateToEditor) {
        onNavigateToEditor(jobId);
      }
    } catch (error) {
      console.error("Error creating draft:", error);
      setUploadError(error instanceof Error ? error.message : "Failed to create draft. Please try again.");
      setIsLoading(false);
      setGeneratingDraft(false);
      setDraftProgress("");
      setDraftProgressPercent(0);
    }
  };

  const dropzoneStyle: React.CSSProperties = {
    border: `2px dashed ${isDragging ? colors.primary : colors.border}`,
    borderRadius: borderRadius.lg,
    padding: `${spacing["3xl"]} ${spacing.xl}`,
    textAlign: "center",
    backgroundColor: isDragging ? colors.primaryLight : colors.background,
    cursor: "pointer",
    transition: transitions.normal,
    minHeight: "44px",
  };

  // ── Full-page generation view ──────────────────────────────────────
  if (generatingDraft) {
    const phaseLabel =
      generationPhase === "preparing"
        ? "Analyzing your NOFO..."
        : generationPhase === "planning"
          ? "Retrieving requirements & planning sections..."
          : sectionNames.length > 0
            ? `Generating sections (${completedSectionCount}/${totalSections})...`
            : "Starting generation...";

    return (
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "48px 16px", fontFamily: typography.fontFamily }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            aria-hidden
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 20px",
              border: `3px solid ${colors.primary}`,
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <h2 style={{ fontSize: typography.fontSize["2xl"], fontWeight: typography.fontWeight.bold, color: colors.heading, margin: "0 0 8px" }}>
            {phaseLabel}
          </h2>
          <p style={{ fontSize: typography.fontSize.base, color: colors.textSecondary, margin: 0 }}>
            {draftProgress}
          </p>
        </div>

        {/* Progress bar with percentage */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.text }}>
              Progress
            </span>
            <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.primary }}>
              {draftProgressPercent}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={draftProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Draft generation progress"
            aria-valuetext={`${draftProgressPercent}% complete`}
            style={{
              width: "100%",
              height: "12px",
              backgroundColor: colors.border,
              borderRadius: borderRadius.full,
              overflow: "hidden",
            }}
          >
            <div style={{
              width: `${draftProgressPercent}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`,
              borderRadius: borderRadius.full,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>

        {/* Section checklist */}
        {sectionNames.length > 0 && (
          <div style={{
            background: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.lg,
            padding: "20px 24px",
            marginBottom: "24px",
          }}>
            <h3 style={{ fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text, margin: "0 0 16px" }}>
              Sections
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {sectionNames.map((name, idx) => {
                const isCompleted = completedSections.includes(name);
                const isActive = !isCompleted && idx >= completedSectionCount && idx < completedSectionCount + 5;
                return (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: borderRadius.md,
                      backgroundColor: isCompleted ? "#f0fdf4" : isActive ? colors.primaryLight : colors.background,
                      border: `1px solid ${isCompleted ? "#bbf7d0" : isActive ? "#bfdbfe" : colors.borderLight}`,
                      transition: "all 0.3s ease",
                    }}
                    aria-label={`Section ${idx + 1}: ${name} — ${isCompleted ? "completed" : isActive ? "generating" : "pending"}`}
                  >
                    {isCompleted ? (
                      <div style={{
                        width: "22px", height: "22px", borderRadius: "50%",
                        backgroundColor: "#10B981", display: "flex", alignItems: "center",
                        justifyContent: "center", flexShrink: 0, color: "#fff", fontSize: "13px", fontWeight: 700,
                      }}>
                        &#10003;
                      </div>
                    ) : isActive ? (
                      <div style={{
                        width: "22px", height: "22px", border: `2.5px solid ${colors.primary}`,
                        borderTopColor: "transparent", borderRadius: "50%",
                        animation: "spin 1s linear infinite", flexShrink: 0,
                      }} />
                    ) : (
                      <div style={{
                        width: "22px", height: "22px", borderRadius: "50%",
                        border: "2px solid #D1D5DB", flexShrink: 0,
                      }} />
                    )}
                    <span style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: isCompleted || isActive ? typography.fontWeight.medium : typography.fontWeight.normal,
                      color: isCompleted ? "#065f46" : isActive ? colors.primary : colors.textSecondary,
                    }}>
                      {name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Persistence messaging */}
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 18px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: borderRadius.lg,
            fontSize: typography.fontSize.sm,
            color: "#065f46",
          }}
        >
          <span style={{ fontSize: "18px", flexShrink: 0 }}>&#10003;</span>
          <span>
            Your progress is automatically saved. You can close this page and come back anytime — your draft will be here.
          </span>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // ── Normal upload form ─────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "16px 0" }}>
      <Card header="Upload & Additional Info">
        <p style={{ color: colors.textSecondary, marginBottom: spacing["2xl"], fontFamily: typography.fontFamily }}>
          Upload supporting documents and share any additional context to help
          generate your grant application.
        </p>

        {/* Upload Supporting Documents */}
        <div style={{ marginBottom: spacing["3xl"] }}>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.sm,
            fontFamily: typography.fontFamily,
          }}>
            Supporting Documents
          </h3>
          <p style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            marginBottom: spacing.lg,
            fontFamily: typography.fontFamily,
          }}>
            Upload any documents that will strengthen your application
            (e.g., organizational details, past performance reports, budget templates).
          </p>

          <div
            style={dropzoneStyle}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={openFileSelector}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openFileSelector();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload files by clicking or dragging and dropping"
          >
            <p style={{
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.medium,
              color: colors.text,
              margin: `0 0 ${spacing.sm}`,
              fontFamily: typography.fontFamily,
            }}>
              Drag and drop files here, or{" "}
              <span style={{ color: colors.primary, textDecoration: "underline" }}>browse files</span>
            </p>
            <p style={{
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              margin: 0,
              fontFamily: typography.fontFamily,
            }}>
              Supported formats: PDF, DOC, DOCX, XLSX, PPTX, TXT, CSV, and more
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
            accept={SUPPORTED_ACCEPT}
            aria-label="Select files to upload"
          />

          {files.length > 0 && (
            <div style={{ marginTop: spacing.lg }}>
              <p style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text,
                marginBottom: spacing.md,
                fontFamily: typography.fontFamily,
              }}>
                Selected Files ({files.length})
              </p>
              {files.map((file, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: `${spacing.md} ${spacing.lg}`,
                    borderRadius: borderRadius.md,
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.border}`,
                    marginBottom: spacing.sm,
                    gap: spacing.md,
                  }}
                >
                  <span style={{ fontSize: "20px", flexShrink: 0 }} aria-hidden="true">
                    {getFileIcon(file.type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: "block",
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text,
                      wordBreak: "break-all",
                      fontFamily: typography.fontFamily,
                    }}>
                      {file.name}
                    </span>
                    <span style={{
                      display: "block",
                      fontSize: typography.fontSize.xs,
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily,
                    }}>
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`Remove ${file.name}`}
                    style={{
                      background: "none",
                      border: "none",
                      color: colors.danger,
                      cursor: "pointer",
                      fontSize: "20px",
                      lineHeight: 1,
                      minWidth: "44px",
                      minHeight: "44px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: borderRadius.sm,
                      flexShrink: 0,
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div style={{ marginTop: spacing.lg }} role="status" aria-live="polite">
              <div style={{
                height: "6px",
                backgroundColor: colors.border,
                borderRadius: borderRadius.sm,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${uploadProgress}%`,
                  backgroundColor: colors.primary,
                  transition: transitions.slow,
                  borderRadius: borderRadius.sm,
                }} />
              </div>
              <p style={{
                fontSize: typography.fontSize.sm,
                color: colors.textSecondary,
                marginTop: spacing.xs,
                fontFamily: typography.fontFamily,
              }}>
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}

          {kbIndexing && !uploading && (
            <div
              role="status"
              aria-live="polite"
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.md,
                marginTop: spacing.lg,
                padding: `${spacing.md} ${spacing.lg}`,
                backgroundColor: colors.primaryLight,
                borderRadius: borderRadius.md,
                border: `1px solid ${colors.border}`,
                fontSize: typography.fontSize.sm,
                color: colors.primary,
                fontFamily: typography.fontFamily,
              } satisfies CSSProperties}
            >
              <div
                aria-hidden="true"
                style={{
                  width: "14px",
                  height: "14px",
                  border: `2px solid ${colors.primary}`,
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  flexShrink: 0,
                }}
              />
              Your documents are being indexed and will be available shortly.
            </div>
          )}
        </div>

        {/* Additional Information */}
        <div>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.sm,
            fontFamily: typography.fontFamily,
          }}>
            Additional Information
          </h3>
          <p style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            marginBottom: spacing.lg,
            fontFamily: typography.fontFamily,
          }}>
            Is there anything else you'd like to share about your application?
          </p>
          <label htmlFor="additional-info" className="sr-only">
            Additional information about your application
          </label>
          <textarea
            id="additional-info"
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            placeholder="Enter any additional context or notes about your application..."
            aria-describedby="additional-info-help"
            style={{
              width: "100%",
              padding: spacing.md,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md,
              fontSize: typography.fontSize.base,
              fontFamily: typography.fontFamily,
              minHeight: "120px",
              resize: "vertical",
            }}
          />
          <span
            id="additional-info-help"
            style={{
              display: "block",
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              marginTop: spacing.xs,
              lineHeight: "1.4",
              fontFamily: typography.fontFamily,
            }}
          >
            This information will help tailor the generated draft to your needs.
          </span>
        </div>

        {uploadError && (
          <div
            role="alert"
            style={{
              marginTop: spacing.lg,
              padding: `${spacing.md} ${spacing.lg}`,
              borderRadius: borderRadius.md,
              backgroundColor: colors.errorLight,
              border: `1px solid ${colors.danger}`,
              color: colors.danger,
              fontSize: typography.fontSize.sm,
              fontFamily: typography.fontFamily,
            }}
          >
            {uploadError}
          </div>
        )}
      </Card>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: spacing.lg,
        marginTop: spacing["2xl"],
      }}>
        <NavigationButtons
          onBack={() => onNavigate("questionnaire")}
          showContinue={false}
          justify="flex-start"
        />

        <div style={{ display: "flex", gap: spacing.md, alignItems: "center" }}>
          {hasExistingDraft && (
            <button
              type="button"
              onClick={() => onNavigate("sectionEditor")}
              aria-label="Skip to section editor"
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                padding: `${spacing.md} ${spacing.xl}`,
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.md,
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                fontFamily: typography.fontFamily,
                cursor: "pointer",
                transition: transitions.normal,
                minHeight: "44px",
              }}
            >
              Skip
            </button>
          )}
          <NavigationButtons
            showBack={false}
            onContinue={handleSubmit}
            continueLabel={
              isLoading
                ? "Processing..."
                : hasExistingDraft
                  ? "Generate Again"
                  : "Create Draft"
            }
            continueDisabled={isLoading}
            continueLoading={isLoading}
            justify="flex-end"
          />
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default UploadDocuments;

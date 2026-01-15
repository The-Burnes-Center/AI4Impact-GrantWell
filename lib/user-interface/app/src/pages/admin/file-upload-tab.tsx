import { Button, Form, ProgressBar, Alert, Card, ListGroup } from "react-bootstrap";
import { useContext, useEffect, useState } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Utils } from "../../common/utils";
import { FileUploader } from "../../common/file-uploader";
import { useSearchParams } from "react-router-dom";
import { Auth } from "aws-amplify";
import "bootstrap/dist/css/bootstrap.min.css";


const fileExtensions = new Set([
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
]);

const mimeTypes = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.tar': 'application/x-tar'
};

export interface FileUploadTabProps {
  tabChangeFunction: () => void;  
}

export default function DataFileUpload(props: FileUploadTabProps) {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");
  const [files, setFiles] = useState<File[]>([]);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [globalError, setGlobalError] = useState<string | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);
  const [uploadingStatus, setUploadingStatus] =
    useState<"info" | "success" | "error" | "in-progress">("info");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadingIndex, setUploadingIndex] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [uploadPanelDismissed, setUploadPanelDismissed] =
    useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

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
      }
    };
    fetchUserId();
  }, []);

  const onSetFiles = (files: File[]) => {
    const errors: string[] = [];
    const filesToUpload: File[] = [];
    setUploadError(undefined);

    if (files.length > 100) {
      setUploadError("Max 100 files allowed");
      files = files.slice(0, 100);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExtension = file.name.split(".").pop()?.toLowerCase();

      if (!fileExtensions.has(`.${fileExtension}`)) {
        errors[i] = "Format not supported";
      } else if (file.size > 1000 * 1000 * 100) {
        errors[i] = "File size is too large, max 100MB";
      } else {
        filesToUpload.push(file);
      }
    }

    setFiles(files);
    setFileErrors(errors);
    setFilesToUpload(filesToUpload);
  };

  const onUpload = async () => {
    if (!appContext || !userId || !documentIdentifier) return;
    setUploadingStatus("in-progress");
    setUploadProgress(0);
    setUploadingIndex(1);
    setUploadPanelDismissed(false);

    const uploader = new FileUploader();
    const nofoName = extractNofoName(documentIdentifier);
    const totalSize = filesToUpload.reduce((acc, file) => acc + file.size, 0);
    let accumulator = 0;
    let hasError = false;

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setCurrentFileName(file.name);
      let fileUploaded = 0;

      try {
        
        const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        const fileType = mimeTypes[fileExtension];
        const result = await apiClient.knowledgeManagement.getUploadURL(file.name, fileType, userId, nofoName);
        try {
          await uploader.upload(
            file,
            result,
            fileType,
            (uploaded: number) => {
              fileUploaded = uploaded;
              const totalUploaded = fileUploaded + accumulator;
              const percent = Math.round((totalUploaded / totalSize) * 100);
              setUploadProgress(percent);
            }
          );

          accumulator += file.size;
          setUploadingIndex(Math.min(filesToUpload.length, i + 2));
        } catch (error) {
          console.error(error);
          setUploadingStatus("error");
          hasError = true;
          break;
        }
      } catch (error: any) {
        setGlobalError(Utils.getErrorMessage(error));
        console.error(Utils.getErrorMessage(error));
        setUploadingStatus("error");
        hasError = true;
        break;
      }
    }

    if (!hasError) {
      setUploadingStatus("success");
      setFilesToUpload([]);
      setFiles([]);
    }
  };

  const getProgressbarVariant = (): "danger" | "success" | "info" => {
    if (uploadingStatus === "error") return "danger";
    if (uploadingStatus === "success") return "success";
    return "info";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    onSetFiles(selectedFiles);
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    const newErrors = fileErrors.filter((_, i) => i !== index);
    onSetFiles(newFiles);
    setFileErrors(newErrors);
  };

  return (
    <div>
      <Form>
        {globalError && (
          <Alert variant="danger" className="mb-3">
            {globalError}
          </Alert>
        )}
        {uploadError && (
          <Alert variant="danger" className="mb-3">
            {uploadError}
          </Alert>
        )}
        <Card className="mb-3">
          <Card.Body>
            <Form.Group className="mb-3">
              <Form.Label>
                <div className="mb-2">
                  Upload relevant files here, to better inform GrantWell. Click "Manage Backend Files" below to see the documents the chatbot is currently referring to.
                </div>
                <div className="text-muted small">
                  Text documents up to 100MB are supported ({Array.from(fileExtensions.values()).join(", ")})
                </div>
              </Form.Label>
              <Form.Control
                type="file"
                multiple
                onChange={handleFileChange}
                accept={Array.from(fileExtensions.values()).join(",")}
              />
            </Form.Group>
            {files.length > 0 && (
              <div className="mt-3">
                <h6>Selected Files:</h6>
                <ListGroup>
                  {files.map((file, index) => (
                    <ListGroup.Item key={index} className="d-flex justify-content-between align-items-center">
                      <div>
                        <strong>{file.name}</strong>
                        <div className="text-muted small">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                          {fileErrors[index] && (
                            <span className="text-danger ms-2"> - {fileErrors[index]}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        Remove
                      </Button>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </div>
            )}
          </Card.Body>
        </Card>
        {uploadingStatus !== "info" && !uploadPanelDismissed && (
          <Alert
            variant={uploadingStatus === "error" ? "danger" : uploadingStatus === "success" ? "success" : "info"}
            dismissible={uploadingStatus === "success" || uploadingStatus === "error"}
            onClose={() => setUploadPanelDismissed(true)}
            className="mb-3"
          >
            <div className="mb-2">
              <strong>
                {uploadingStatus === "success" || uploadingStatus === "error"
                  ? "Uploading files"
                  : `Uploading files ${uploadingIndex} of ${filesToUpload.length}`}
              </strong>
            </div>
            {uploadingStatus !== "success" && uploadingStatus !== "error" && (
              <div className="mb-2 small">{currentFileName}</div>
            )}
            <ProgressBar
              now={uploadProgress}
              variant={getProgressbarVariant()}
              label={`${uploadProgress}%`}
              className="mb-2"
            />
            <div className="small">
              {uploadingStatus === "success"
                ? "Upload complete"
                : uploadingStatus === "error"
                ? "Upload failed"
                : "Uploading..."}
            </div>
          </Alert>
        )}
        <div className="d-flex gap-2">
          <Button
            data-testid="create"
            variant="primary"
            disabled={
              filesToUpload.length === 0 ||
              uploadingStatus === "in-progress"
            }
            onClick={onUpload}
          >
            Upload files
          </Button>
        </div>
      </Form>
    </div>
  );
}

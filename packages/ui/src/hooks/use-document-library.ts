import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { useApiClient } from "./use-api-client";
import { FileUploader } from "../common/file-uploader";
import {
  LIBRARY_FOLDER,
  MIME_TYPES,
  libraryKey,
  uploadProblem,
  type LibraryDocument,
} from "../common/helpers/user-documents";

export interface UploadPlan {
  accepted: File[];
  rejected: string[];
  /** Accepted files whose name is already taken in the library folder; uploading replaces them. */
  duplicates: File[];
}

export interface UploadResult {
  uploaded: string[];
  failed: string[];
}

/** The signed-in user's document library: list, upload into it, download and delete. */
export function useDocumentLibrary() {
  const apiClient = useApiClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDocuments(await apiClient.userDocuments.listDocuments());
    } catch (error) {
      console.error("Error loading documents:", error);
      setLoadError("Your documents couldn't be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setUserId(user.username);
      })
      .catch(() => {
        if (!cancelled) setLoadError("You need to sign in again to see your documents.");
      });
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Leaving mid-upload loses the file being sent; nothing else needs a warning.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const planUpload = useCallback((files: File[]): UploadPlan => {
    const taken = new Set(documentsRef.current.filter((d) => d.folder === LIBRARY_FOLDER).map((d) => d.name));
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const problem = uploadProblem(file);
      if (problem) rejected.push(problem);
      else accepted.push(file);
    }
    return { accepted, rejected, duplicates: accepted.filter((f) => taken.has(f.name)) };
  }, []);

  const upload = useCallback(
    async (files: File[]): Promise<UploadResult> => {
      const result: UploadResult = { uploaded: [], failed: [] };
      if (!userId || files.length === 0) return result;
      setUploading(true);
      setProgress(0);
      const uploader = new FileUploader();
      const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
      let done = 0;
      for (const file of files) {
        const key = libraryKey(userId, file.name);
        const type = MIME_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] || "application/octet-stream";
        try {
          const url = await apiClient.userDocuments.getUploadURL(key, type, file.size);
          await uploader.upload(file, url, type, (sent) => setProgress(Math.round(((done + sent) / total) * 100)));
          result.uploaded.push(key);
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          result.failed.push(file.name);
        }
        done += file.size;
      }
      setProgress(100);
      setUploading(false);
      await refresh();
      return result;
    },
    [apiClient, userId, refresh]
  );

  const remove = useCallback(
    async (key: string) => {
      await apiClient.userDocuments.deleteFile(key);
      setDocuments((prev) => prev.filter((d) => d.key !== key));
    },
    [apiClient]
  );

  const download = useCallback(
    async (doc: LibraryDocument) => {
      const url = await apiClient.userDocuments.getDownloadURL(doc.key);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", doc.name);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [apiClient]
  );

  return { userId, documents, loading, loadError, refresh, planUpload, upload, uploading, progress, remove, download };
}

export type DocumentLibrary = ReturnType<typeof useDocumentLibrary>;
